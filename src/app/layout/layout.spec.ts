import { describe, expect, it } from 'vitest';
import { parseDsl } from '../dsl/parser';
import { SAMPLE_DSL } from '../model/sample';
import { DARK } from '../render/palette';
import { toSvg } from '../render/svg-export';
import { layoutDiagram } from './layout';
import { approxMeasurer } from './text-measure';

describe('layoutDiagram', () => {
  const r = parseDsl(SAMPLE_DSL);
  if (!r.ok) throw new Error('sample must parse');
  const lay = layoutDiagram(r.diagram, approxMeasurer);

  it('produces positive sizes and bounds for every block', () => {
    expect(lay.width).toBeGreaterThan(0);
    for (const b of lay.bounds.values()) {
      expect(b.w).toBeGreaterThan(0);
      expect(b.h).toBeGreaterThan(0);
      expect(b.x + b.w).toBeLessThanOrEqual(lay.width);
      expect(b.y + b.h).toBeLessThanOrEqual(lay.height);
    }
  });

  it('stretches top-level blocks to the full diagram width', () => {
    const widths = r.diagram.body.map((b) => lay.bounds.get(b.id)!.w);
    expect(new Set(widths).size).toBe(1);
  });

  it('renders placeholder slots for empty lists', () => {
    const e = parseDsl('if a {\n}');
    if (!e.ok) throw new Error();
    const l2 = layoutDiagram(e.diagram, approxMeasurer);
    expect(l2.slots.size).toBe(2);
  });

  it('serializes to escaped svg', () => {
    const e = parseDsl('a < b & c');
    if (!e.ok) throw new Error();
    const svg = toSvg(layoutDiagram(e.diagram, approxMeasurer), { palette: DARK });
    expect(svg).toContain('a &lt; b &amp; c');
    expect(svg.startsWith('<svg')).toBe(true);
  });
});
