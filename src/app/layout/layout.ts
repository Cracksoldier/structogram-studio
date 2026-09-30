import { Block, Diagram } from '../model/diagram.model';
import { ROOT_SLOT, Slot, slotKey } from '../model/tree-ops';
import { TITLE_FONT_SIZE, TextMeasurer, wrapText } from './text-measure';

export type CellRole = 'statement' | 'call' | 'exit' | 'cond' | 'loop' | 'empty' | 'title';
export type TextRole = 'text' | 'label' | 'title' | 'placeholder';

export type Prim =
  | { t: 'rect'; x: number; y: number; w: number; h: number; role: CellRole; nodeId?: string; slot?: string }
  | { t: 'poly'; points: string; role: CellRole; nodeId?: string }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; accent?: boolean }
  | { t: 'text'; x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end'; role: TextRole };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutResult {
  width: number;
  height: number;
  prims: Prim[];
  /** Full extent of each block. */
  bounds: Map<string, Box>;
  /** Area holding the block's primary text (used for inline editing). */
  editBoxes: Map<string, Box>;
  /** Extent of each empty-list placeholder, keyed by slotKey. */
  slots: Map<string, { box: Box; slot: Slot }>;
}

export const L = {
  MARGIN: 16,
  PAD_X: 10,
  PAD_Y: 7,
  LINE_H: 18,
  BASELINE: 13,
  EMPTY_W: 56,
  BAR: 22,
  LABEL_H: 16,
  MAX_TEXT: 300,
  MAX_COND: 220,
  TITLE_H: 36,
  NOTCH: 12,
  CALL_INSET: 7,
  MIN_W: 44,
} as const;

interface TextBlock {
  lines: string[];
  w: number;
  h: number;
}

interface Size {
  w: number;
  h: number;
}

const EMPTY_H = L.LINE_H + 2 * L.PAD_Y;

export function layoutDiagram(d: Diagram, m: TextMeasurer): LayoutResult {
  return new LayoutEngine(m).run(d);
}

class LayoutEngine {
  private sizes = new Map<Block, Size>();
  private texts = new Map<Block, TextBlock>();
  /** if: header height; switch: header height + column min widths. */
  private extra = new Map<Block, { headerH: number; cols?: number[] }>();
  private prims: Prim[] = [];
  private bounds = new Map<string, Box>();
  private editBoxes = new Map<string, Box>();
  private slots = new Map<string, { box: Box; slot: Slot }>();

  constructor(private m: TextMeasurer) {}

  run(d: Diagram): LayoutResult {
    const body = this.measureList(d.body);
    const titleW = d.title ? this.m.width(d.title, true, TITLE_FONT_SIZE) + 2 * L.PAD_X * 2 : 0;
    const w = Math.ceil(Math.max(body.w, titleW, 160));
    let y = L.MARGIN;
    const x = L.MARGIN;
    if (d.title) {
      this.prims.push({ t: 'rect', x, y, w, h: L.TITLE_H, role: 'title' });
      this.prims.push({ t: 'text', x: x + w / 2, y: y + L.TITLE_H / 2 + 5, text: d.title, anchor: 'middle', role: 'title' });
      y += L.TITLE_H;
    }
    this.placeList(d.body, ROOT_SLOT, x, y, w, body.h);
    return {
      width: w + 2 * L.MARGIN,
      height: y + body.h + L.MARGIN,
      prims: this.prims,
      bounds: this.bounds,
      editBoxes: this.editBoxes,
      slots: this.slots,
    };
  }

  // ---------------------------------------------------------------- measure

  private text(b: Block, s: string, max: number): TextBlock {
    const lines = wrapText(s || ' ', max, this.m);
    const w = Math.max(...lines.map((l) => this.m.width(l)));
    const tb = { lines, w, h: lines.length * L.LINE_H };
    this.texts.set(b, tb);
    return tb;
  }

  private measureList(list: Block[]): Size {
    if (list.length === 0) return { w: L.EMPTY_W, h: EMPTY_H };
    let w = 0;
    let h = 0;
    for (const b of list) {
      const s = this.measure(b);
      w = Math.max(w, s.w);
      h += s.h;
    }
    return { w, h };
  }

  private measure(b: Block): Size {
    let s: Size;
    switch (b.kind) {
      case 'statement':
      case 'call':
      case 'exit': {
        const t = this.text(b, b.text, L.MAX_TEXT);
        const deco = b.kind === 'call' ? 2 * L.CALL_INSET : b.kind === 'exit' ? L.NOTCH : 0;
        s = { w: Math.max(L.MIN_W, t.w + 2 * L.PAD_X + deco), h: t.h + 2 * L.PAD_Y };
        break;
      }
      case 'while':
      case 'for':
      case 'doWhile': {
        const t = this.text(b, b.kind === 'for' ? `for ${b.header}` : `while ${b.condition}`, L.MAX_TEXT);
        const body = this.measureList(b.body);
        s = { w: Math.max(t.w + 2 * L.PAD_X, L.BAR + body.w), h: t.h + 2 * L.PAD_Y + body.h };
        break;
      }
      case 'if': {
        const t = this.text(b, b.condition, L.MAX_COND);
        const th = this.measureList(b.then);
        const el = this.measureList(b.else);
        const headerH = 2 * t.h + L.PAD_Y + L.LABEL_H;
        this.extra.set(b, { headerH });
        s = { w: Math.max(th.w + el.w, headerMinWidth(t, headerH)), h: headerH + Math.max(th.h, el.h) };
        break;
      }
      case 'switch': {
        const t = this.text(b, b.expr, L.MAX_COND);
        const lists = [...b.cases.map((c) => ({ label: c.label, body: c.body }))];
        if (b.default) lists.push({ label: 'default', body: b.default });
        const cols: number[] = [];
        let maxH = 0;
        for (const c of lists) {
          const sz = this.measureList(c.body);
          cols.push(Math.max(sz.w, this.m.width(c.label) + 2 * L.PAD_X));
          maxH = Math.max(maxH, sz.h);
        }
        const headerH = 2 * t.h + L.PAD_Y + L.LABEL_H;
        this.extra.set(b, { headerH, cols });
        const sum = cols.reduce((a, c) => a + c, 0);
        s = { w: Math.max(sum, headerMinWidth(t, headerH)), h: headerH + maxH };
        break;
      }
    }
    s = { w: Math.ceil(s.w), h: Math.ceil(s.h) };
    this.sizes.set(b, s);
    return s;
  }

  // ------------------------------------------------------------------ place

  private placeList(list: Block[], slot: Slot, x: number, y: number, w: number, h: number): void {
    if (list.length === 0) {
      const key = slotKey(slot);
      this.prims.push({ t: 'rect', x, y, w, h, role: 'empty', slot: key });
      this.prims.push({ t: 'text', x: x + w / 2, y: y + h / 2 + 5, text: '∅', anchor: 'middle', role: 'placeholder' });
      this.slots.set(key, { box: { x, y, w, h }, slot });
      return;
    }
    let cy = y;
    list.forEach((b, i) => {
      const bh = i === list.length - 1 ? y + h - cy : this.sizes.get(b)!.h;
      this.place(b, x, cy, w, bh);
      cy += bh;
    });
  }

  private drawLines(tb: TextBlock, x: number, y: number, anchor: 'start' | 'middle', w = 0): void {
    tb.lines.forEach((line, i) => {
      this.prims.push({
        t: 'text',
        x: anchor === 'middle' ? x + w / 2 : x,
        y: y + i * L.LINE_H + L.BASELINE,
        text: line,
        anchor,
        role: 'text',
      });
    });
  }

  private place(b: Block, x: number, y: number, w: number, h: number): void {
    const box = { x, y, w, h };
    this.bounds.set(b.id, box);
    const tb = this.texts.get(b)!;

    switch (b.kind) {
      case 'statement':
      case 'call':
      case 'exit': {
        this.prims.push({ t: 'rect', x, y, w, h, role: b.kind, nodeId: b.id });
        let tx = x + L.PAD_X;
        if (b.kind === 'call') {
          const i = L.CALL_INSET;
          this.prims.push({ t: 'line', x1: x + i, y1: y, x2: x + i, y2: y + h });
          this.prims.push({ t: 'line', x1: x + w - i, y1: y, x2: x + w - i, y2: y + h });
          tx += i;
        } else if (b.kind === 'exit') {
          const n = L.NOTCH;
          this.prims.push({ t: 'line', x1: x + n, y1: y, x2: x, y2: y + h / 2, accent: true });
          this.prims.push({ t: 'line', x1: x, y1: y + h / 2, x2: x + n, y2: y + h, accent: true });
          tx += n;
        }
        const ty = y + (h - tb.h) / 2;
        this.drawLines(tb, tx, ty, 'start');
        this.editBoxes.set(b.id, box);
        break;
      }

      case 'while':
      case 'for': {
        const hh = tb.h + 2 * L.PAD_Y;
        const B = L.BAR;
        this.prims.push({
          t: 'poly',
          points: pts([x, y], [x + w, y], [x + w, y + hh], [x + B, y + hh], [x + B, y + h], [x, y + h]),
          role: 'loop',
          nodeId: b.id,
        });
        this.drawLines(tb, x + L.PAD_X, y + L.PAD_Y, 'start');
        this.editBoxes.set(b.id, { x, y, w, h: hh });
        this.placeList(b.body, { owner: b.id, branch: 'body' }, x + B, y + hh, w - B, h - hh);
        break;
      }

      case 'doWhile': {
        const fh = tb.h + 2 * L.PAD_Y;
        const B = L.BAR;
        this.prims.push({
          t: 'poly',
          points: pts([x, y], [x + B, y], [x + B, y + h - fh], [x + w, y + h - fh], [x + w, y + h], [x, y + h]),
          role: 'loop',
          nodeId: b.id,
        });
        this.drawLines(tb, x + L.PAD_X, y + h - fh + L.PAD_Y, 'start');
        this.editBoxes.set(b.id, { x, y: y + h - fh, w, h: fh });
        this.placeList(b.body, { owner: b.id, branch: 'body' }, x + B, y, w - B, h - fh);
        break;
      }

      case 'if': {
        const { headerH: H } = this.extra.get(b)!;
        const thMin = this.sizeOfList(b.then).w;
        const elMin = this.sizeOfList(b.else).w;
        const extra = w - thMin - elMin;
        const thenW = Math.round(thMin + (extra * thMin) / (thMin + elMin));
        const split = x + thenW;
        this.prims.push({ t: 'rect', x, y, w, h: H, role: 'cond', nodeId: b.id });
        this.prims.push({ t: 'line', x1: x, y1: y, x2: split, y2: y + H });
        this.prims.push({ t: 'line', x1: x + w, y1: y, x2: split, y2: y + H });
        this.drawHeaderText(tb, x, y, w, H, split, true);
        this.prims.push({ t: 'text', x: x + 6, y: y + H - 4, text: 'T', anchor: 'start', role: 'label' });
        this.prims.push({ t: 'text', x: x + w - 6, y: y + H - 4, text: 'F', anchor: 'end', role: 'label' });
        this.editBoxes.set(b.id, { x, y, w, h: H });
        this.placeList(b.then, { owner: b.id, branch: 'then' }, x, y + H, thenW, h - H);
        this.placeList(b.else, { owner: b.id, branch: 'else' }, split, y + H, w - thenW, h - H);
        break;
      }

      case 'switch': {
        const { headerH: H, cols } = this.extra.get(b)!;
        const lists = b.cases.map((c) => ({ label: c.label, body: c.body, branch: `case:${c.id}` }));
        if (b.default) lists.push({ label: 'default', body: b.default, branch: 'default' });
        const sum = cols!.reduce((a, c) => a + c, 0);
        const extra = w - sum;
        const widths = cols!.map((c) => Math.round(c + (extra * c) / sum));
        widths[widths.length - 1] = w - widths.slice(0, -1).reduce((a, c) => a + c, 0);
        const xs: number[] = [];
        let acc = x;
        for (const cw of widths) {
          xs.push(acc);
          acc += cw;
        }
        const hasDefault = !!b.default && lists.length > 1;
        const xd = hasDefault ? xs[xs.length - 1] : x + w;
        this.prims.push({ t: 'rect', x, y, w, h: H, role: 'cond', nodeId: b.id });
        this.prims.push({ t: 'line', x1: x, y1: y, x2: xd, y2: y + H });
        if (hasDefault) this.prims.push({ t: 'line', x1: xd, y1: y + H, x2: x + w, y2: y });
        for (let j = 1; j < xs.length; j++) {
          if (xs[j] >= xd) continue;
          const yTop = y + (H * (xs[j] - x)) / (xd - x);
          this.prims.push({ t: 'line', x1: xs[j], y1: y + H, x2: xs[j], y2: yTop });
        }
        this.drawHeaderText(tb, x, y, w, H, xd, hasDefault);
        lists.forEach((c, j) => {
          const isDefault = hasDefault && j === lists.length - 1;
          this.prims.push({
            t: 'text',
            x: isDefault ? xs[j] + widths[j] - 5 : xs[j] + 5,
            y: y + H - 4,
            text: c.label,
            anchor: isDefault ? 'end' : 'start',
            role: 'label',
          });
          this.placeList(c.body, { owner: b.id, branch: c.branch }, xs[j], y + H, widths[j], h - H);
        });
        this.editBoxes.set(b.id, { x, y, w, h: H });
        break;
      }
    }
  }

  private sizeOfList(list: Block[]): Size {
    if (list.length === 0) return { w: L.EMPTY_W, h: EMPTY_H };
    return { w: Math.max(...list.map((b) => this.sizes.get(b)!.w)), h: 0 };
  }

  /** Centers each text line inside the free region above the header diagonals. */
  private drawHeaderText(tb: TextBlock, x: number, y: number, w: number, H: number, split: number, rightDiag: boolean): void {
    tb.lines.forEach((line, i) => {
      const mid = L.PAD_Y / 2 + (i + 0.5) * L.LINE_H;
      const f = mid / H;
      const left = x + (split - x) * f;
      const right = rightDiag ? x + w - (x + w - split) * f : x + w;
      this.prims.push({
        t: 'text',
        x: (left + right) / 2,
        y: y + L.PAD_Y / 2 + i * L.LINE_H + L.BASELINE,
        text: line,
        anchor: 'middle',
        role: 'text',
      });
    });
  }
}

/** Minimal header width so the widest (last) text line fits between the diagonals. */
function headerMinWidth(t: TextBlock, H: number): number {
  const fLast = (L.PAD_Y / 2 + (t.lines.length - 0.5) * L.LINE_H) / H;
  return t.w / (1 - fLast) + 2 * L.PAD_X;
}

function pts(...p: [number, number][]): string {
  return p.map(([a, b]) => `${a},${b}`).join(' ');
}

