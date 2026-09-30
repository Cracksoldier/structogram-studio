import { describe, expect, it } from 'vitest';
import { parseDsl } from '../dsl/parser';
import { Diagram } from './diagram.model';
import { findBlock, insertBlock, moveBlock, relocateBlock, removeBlock, ROOT_SLOT } from './tree-ops';

function d(src: string): Diagram {
  const r = parseDsl(src);
  if (!r.ok) throw new Error(r.error.message);
  return r.diagram;
}

describe('tree-ops', () => {
  const base = d('a\nwhile c {\n  b\n}\nz');

  it('finds nested blocks with their slot', () => {
    const inner = (base.body[1] as { body: { id: string }[] }).body[0];
    const loc = findBlock(base, inner.id)!;
    expect(loc.slot).toEqual({ owner: base.body[1].id, branch: 'body' });
    expect(loc.index).toBe(0);
  });

  it('inserts, removes and moves immutably', () => {
    const ins = insertBlock(base, ROOT_SLOT, 1, { id: 'new', kind: 'statement', text: 'n' });
    expect(ins.body[1].id).toBe('new');
    expect(base.body).toHaveLength(3);
    expect(removeBlock(ins, 'new').body).toHaveLength(3);
    const moved = moveBlock(base, base.body[0].id, 1);
    expect(moved.body[1].id).toBe(base.body[0].id);
    expect(moveBlock(base, base.body[0].id, -1)).toBe(base);
  });

  it('relocates into another slot but not into itself', () => {
    const loopId = base.body[1].id;
    const r = relocateBlock(base, base.body[0].id, { owner: loopId, branch: 'body' }, 0);
    expect(r.body).toHaveLength(2);
    expect(relocateBlock(base, loopId, { owner: loopId, branch: 'body' }, 0)).toBe(base);
  });
});
