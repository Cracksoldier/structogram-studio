import { Injectable, computed, effect, signal } from '@angular/core';
import { ParseError, parseDsl } from '../dsl/parser';
import { reconcileIds } from '../dsl/reconcile';
import { serializeDsl } from '../dsl/serializer';
import { layoutDiagram } from '../layout/layout';
import { canvasMeasurer } from '../layout/text-measure';
import { Block, BlockKind, Diagram, cloneWithNewIds, createBlock } from '../model/diagram.model';
import { SAMPLE_DSL } from '../model/sample';
import {
  ROOT_SLOT,
  Slot,
  countBlocks,
  findBlock,
  getList,
  insertBlock,
  moveBlock,
  removeBlock,
  replaceBlock,
  slotKey,
} from '../model/tree-ops';

export type Selection = { type: 'block'; id: string } | { type: 'slot'; slot: Slot };

const STORAGE_KEY = 'nsd-editor.diagram.v1';
const HISTORY_LIMIT = 100;
const TEXT_COALESCE_MS = 1200;

function sampleDiagram(): Diagram {
  const r = parseDsl(SAMPLE_DSL);
  return r.ok ? r.diagram : { title: '', body: [] };
}

function isDiagram(v: unknown): v is Diagram {
  return !!v && typeof v === 'object' && Array.isArray((v as Diagram).body);
}

@Injectable({ providedIn: 'root' })
export class DiagramStore {
  readonly diagram = signal<Diagram>(this.restore());
  readonly selection = signal<Selection | null>(null);
  readonly dslText = signal<string>(serializeDsl(this.diagram()));
  readonly parseError = signal<ParseError | null>(null);
  readonly zoom = signal(1);
  /** Bumped when web fonts finish loading so text is re-measured. */
  readonly fontEpoch = signal(0);
  readonly editingId = signal<string | null>(null);

  private readonly undoStack = signal<Diagram[]>([]);
  private readonly redoStack = signal<Diagram[]>([]);
  private clipboard: Block | null = null;
  private readonly clipboardFull = signal(false);
  private lastTextEdit = 0;

  readonly layout = computed(() => {
    this.fontEpoch();
    return layoutDiagram(this.diagram(), canvasMeasurer);
  });
  readonly canUndo = computed(() => this.undoStack().length > 0);
  readonly canRedo = computed(() => this.redoStack().length > 0);
  readonly canPaste = computed(() => this.clipboardFull());
  readonly blockCount = computed(() => countBlocks(this.diagram()));

  readonly selectedBlock = computed<Block | null>(() => {
    const s = this.selection();
    if (s?.type !== 'block') return null;
    return findBlock(this.diagram(), s.id)?.block ?? null;
  });

  readonly selectedKey = computed(() => {
    const s = this.selection();
    if (!s) return null;
    return s.type === 'block' ? s.id : slotKey(s.slot);
  });

  constructor() {
    effect(() => {
      const d = this.diagram();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
      } catch {
        /* storage unavailable (private mode, quota) – ignore */
      }
    });
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => this.fontEpoch.update((n) => n + 1));
    }
  }

  private restore(): Diagram {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isDiagram(parsed)) return parsed;
      }
    } catch {
      /* ignore corrupt storage */
    }
    return sampleDiagram();
  }

  // ------------------------------------------------------------- mutations

  /** Applies a structural change coming from the visual editor. */
  commit(next: Diagram): void {
    const prev = this.diagram();
    if (next === prev) return;
    this.pushHistory(prev);
    this.diagram.set(next);
    this.dslText.set(serializeDsl(next));
    this.parseError.set(null);
    this.lastTextEdit = 0;
  }

  /** Applies text typed into the DSL editor. */
  applyText(text: string): void {
    this.dslText.set(text);
    const r = parseDsl(text);
    if (!r.ok) {
      this.parseError.set(r.error);
      return;
    }
    this.parseError.set(null);
    const prev = this.diagram();
    const next = reconcileIds(prev, r.diagram);
    if (JSON.stringify(next) === JSON.stringify(prev)) return;
    const now = Date.now();
    if (now - this.lastTextEdit > TEXT_COALESCE_MS) this.pushHistory(prev);
    this.lastTextEdit = now;
    this.diagram.set(next);
    this.pruneSelection();
  }

  private pushHistory(d: Diagram): void {
    this.undoStack.update((s) => [...s.slice(-(HISTORY_LIMIT - 1)), d]);
    this.redoStack.set([]);
  }

  undo(): void {
    const stack = this.undoStack();
    if (!stack.length) return;
    const prev = stack[stack.length - 1];
    this.undoStack.set(stack.slice(0, -1));
    this.redoStack.update((r) => [...r, this.diagram()]);
    this.setWithoutHistory(prev);
  }

  redo(): void {
    const stack = this.redoStack();
    if (!stack.length) return;
    const next = stack[stack.length - 1];
    this.redoStack.set(stack.slice(0, -1));
    this.undoStack.update((u) => [...u, this.diagram()]);
    this.setWithoutHistory(next);
  }

  private setWithoutHistory(d: Diagram): void {
    this.diagram.set(d);
    this.dslText.set(serializeDsl(d));
    this.parseError.set(null);
    this.lastTextEdit = 0;
    this.pruneSelection();
  }

  private pruneSelection(): void {
    const s = this.selection();
    if (s?.type === 'block' && !findBlock(this.diagram(), s.id)) this.selection.set(null);
    if (s?.type === 'slot' && !getList(this.diagram(), s.slot)) this.selection.set(null);
  }

  // ------------------------------------------------------------ operations

  select(sel: Selection | null): void {
    this.selection.set(sel);
  }

  /** Where a new block goes: after the selected block, or at the end of the selected slot/root. */
  private insertionPoint(): { slot: Slot; index: number } {
    const d = this.diagram();
    const s = this.selection();
    if (s?.type === 'block') {
      const loc = findBlock(d, s.id);
      if (loc) return { slot: loc.slot, index: loc.index + 1 };
    }
    if (s?.type === 'slot') {
      const list = getList(d, s.slot);
      if (list) return { slot: s.slot, index: list.length };
    }
    return { slot: ROOT_SLOT, index: d.body.length };
  }

  insert(kind: BlockKind): void {
    this.insertBlock(createBlock(kind));
  }

  private insertBlock(block: Block): void {
    const { slot, index } = this.insertionPoint();
    this.commit(insertBlock(this.diagram(), slot, index, block));
    this.selection.set({ type: 'block', id: block.id });
  }

  deleteSelected(): void {
    const s = this.selection();
    if (s?.type !== 'block') return;
    const loc = findBlock(this.diagram(), s.id);
    if (!loc) return;
    this.commit(removeBlock(this.diagram(), s.id));
    // select a sensible neighbour
    const list = getList(this.diagram(), loc.slot) ?? [];
    const neighbour = list[Math.min(loc.index, list.length - 1)];
    this.selection.set(neighbour ? { type: 'block', id: neighbour.id } : { type: 'slot', slot: loc.slot });
  }

  moveSelected(delta: number): void {
    const s = this.selection();
    if (s?.type === 'block') this.commit(moveBlock(this.diagram(), s.id, delta));
  }

  copySelected(): void {
    const b = this.selectedBlock();
    if (!b) return;
    this.clipboard = structuredClone(b);
    this.clipboardFull.set(true);
  }

  cutSelected(): void {
    this.copySelected();
    this.deleteSelected();
  }

  paste(): void {
    if (this.clipboard) this.insertBlock(cloneWithNewIds(this.clipboard));
  }

  duplicateSelected(): void {
    const b = this.selectedBlock();
    if (b) this.insertBlock(cloneWithNewIds(b));
  }

  updateBlock(id: string, fn: (b: Block) => Block): void {
    this.commit(replaceBlock(this.diagram(), id, fn));
  }

  setTitle(title: string): void {
    if (title !== this.diagram().title) this.commit({ ...this.diagram(), title });
  }

  newDiagram(): void {
    this.commit({ title: 'Untitled', body: [] });
    this.selection.set({ type: 'slot', slot: ROOT_SLOT });
  }

  loadSample(): void {
    this.commit(sampleDiagram());
    this.selection.set(null);
  }

  loadJson(json: string): void {
    const v: unknown = JSON.parse(json);
    if (!isDiagram(v)) throw new Error('File does not contain a Nassi–Shneiderman diagram.');
    this.commit({ title: typeof v.title === 'string' ? v.title : '', body: v.body });
    this.selection.set(null);
  }

  loadDsl(text: string): void {
    const r = parseDsl(text);
    if (!r.ok) throw new Error(`Line ${r.error.line}: ${r.error.message}`);
    this.commit(r.diagram);
    this.selection.set(null);
  }

  setZoom(z: number): void {
    this.zoom.set(Math.min(4, Math.max(0.25, Math.round(z * 100) / 100)));
  }
}
