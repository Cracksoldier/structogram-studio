export const FONT_FAMILY = "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";
export const FONT_SIZE = 13;
export const TITLE_FONT_SIZE = 15;

export interface TextMeasurer {
  width(text: string, bold?: boolean, size?: number): number;
}

/** Fallback measurer used where no canvas is available (tests, SSR). */
export const approxMeasurer: TextMeasurer = {
  width: (text, bold = false, size = FONT_SIZE) => text.length * size * (bold ? 0.6 : 0.56),
};

let canvasCtx: CanvasRenderingContext2D | null | undefined;

export const canvasMeasurer: TextMeasurer = {
  width(text, bold = false, size = FONT_SIZE) {
    if (canvasCtx === undefined) {
      canvasCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    }
    if (!canvasCtx) return approxMeasurer.width(text, bold, size);
    canvasCtx.font = `${bold ? 600 : 400} ${size}px ${FONT_FAMILY}`;
    return canvasCtx.measureText(text).width;
  },
};

/** Greedy word wrap. Words longer than `maxWidth` are kept on their own line. */
export function wrapText(text: string, maxWidth: number, m: TextMeasurer, bold = false): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${line} ${words[i]}`;
      if (m.width(candidate, bold) <= maxWidth) {
        line = candidate;
      } else {
        out.push(line);
        line = words[i];
      }
    }
    out.push(line);
  }
  return out;
}
