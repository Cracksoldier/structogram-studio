import { Block, Diagram } from '../model/diagram.model';
import { childSlots } from '../model/tree-ops';

/**
 * Copies ids from `prev` onto structurally matching blocks of `next`
 * (same position, same kind) so that selection survives re-parsing.
 */
export function reconcileIds(prev: Diagram, next: Diagram): Diagram {
  const walk = (a: Block[], b: Block[]): void => {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const pa = a[i];
      const nb = b[i];
      if (pa.kind !== nb.kind) continue;
      nb.id = pa.id;
      if (pa.kind === 'switch' && nb.kind === 'switch') {
        nb.cases.forEach((c, j) => {
          if (pa.cases[j]) c.id = pa.cases[j].id;
        });
      }
      const ca = childSlots(pa);
      const cb = childSlots(nb);
      for (const s of cb) {
        const match = ca.find((x) => x.branch === s.branch);
        if (match) walk(match.list, s.list);
      }
    }
  };
  walk(prev.body, next.body);
  return next;
}
