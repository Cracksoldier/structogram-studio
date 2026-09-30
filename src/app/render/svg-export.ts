import { LayoutResult } from '../layout/layout';
import { FONT_FAMILY, FONT_SIZE, TITLE_FONT_SIZE } from '../layout/text-measure';
import { Palette } from './palette';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface SvgOptions {
  palette: Palette;
  /** Extra CSS (e.g. embedded @font-face rules) placed in a <style> element. */
  fontCss?: string;
  transparent?: boolean;
}

/** Serializes a layout into a standalone SVG document. */
export function toSvg(layout: LayoutResult, opts: SvgOptions): string {
  const p = opts.palette;
  const { width, height } = layout;
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  out.push(
    `<style>${opts.fontCss ?? ''}text{font-family:${FONT_FAMILY.replace(/"/g, "'")};font-size:${FONT_SIZE}px;white-space:pre}.t{font-weight:600;font-size:${TITLE_FONT_SIZE}px}.l{font-size:11px;font-weight:600}</style>`,
  );
  if (!opts.transparent) out.push(`<rect width="100%" height="100%" fill="${p.background}"/>`);
  out.push(`<g stroke="${p.stroke}" stroke-width="1" stroke-linejoin="round">`);
  for (const pr of layout.prims) {
    switch (pr.t) {
      case 'rect':
        out.push(`<rect x="${pr.x}" y="${pr.y}" width="${pr.w}" height="${pr.h}" fill="${p.fill[pr.role]}"/>`);
        break;
      case 'poly':
        out.push(`<polygon points="${pr.points}" fill="${p.fill[pr.role]}"/>`);
        break;
      case 'line':
        out.push(
          `<line x1="${pr.x1}" y1="${pr.y1}" x2="${pr.x2}" y2="${pr.y2}"${pr.accent ? ` stroke="${p.accent}"` : ''}/>`,
        );
        break;
      case 'text': {
        const cls = pr.role === 'title' ? ' class="t"' : pr.role === 'label' ? ' class="l"' : '';
        out.push(
          `<text x="${pr.x}" y="${pr.y}" text-anchor="${pr.anchor}" fill="${p.text[pr.role]}" stroke="none"${cls}>${esc(pr.text)}</text>`,
        );
        break;
      }
    }
  }
  out.push('</g></svg>');
  return out.join('\n');
}
