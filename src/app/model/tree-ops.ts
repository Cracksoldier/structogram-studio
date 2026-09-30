import { Block, Diagram, forEachChildList, primaryText, withPrimaryText } from './diagram.model';

/**
 * Addresses a block list inside the diagram.
 * `owner === null` is the diagram root; otherwise `owner` is the id of the
 * block owning the list and `branch` names which list
 * ('body' | 'then' | 'else' | 'default' | `case:<caseId>`).
 */
export interface Slot {
  owner: string | null;
  branch: string;
}

export interface Location {
  block: Block;
  slot: Slot;
  index: number;
  parent: Block | null;
}

export const ROOT_SLOT: Slot = { owner: null, branch: 'body' };

export function slotKey(s: Slot): string {
  return `${s.owner ?? 'root'}/${s.branch}`;
}

export function sameSlot(a: Slot, b: Slot): boolean {
  return a.owner === b.owner && a.branch === b.branch;
}

/** Returns the named child lists of a block together with their branch names. */
export function childSlots(b: Block): { branch: string; list: Block[] }[] {
  switch (b.kind) {
    case 'if':
      return [
        { branch: 'then', list: b.then },
        { branch: 'else', list: b.else },
      ];
    case 'switch': {
      const r = b.cases.map((c) => ({ branch: `case:${c.id}`, list: c.body }));
      if (b.default) r.push({ branch: 'default', list: b.default });
      return r;
    }
    case 'while':
    case 'doWhile':
    case 'for':
      return [{ branch: 'body', list: b.body }];
    default:
      return [];
  }
}

function listOf(b: Block, branch: string): Block[] | null {
  return childSlots(b).find((s) => s.branch === branch)?.list ?? null;
}

export function findBlock(diagram: Diagram, id: string): Location | null {
  const visit = (list: Block[], slot: Slot, parent: Block | null): Location | null => {
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.id === id) return { block: b, slot, index: i, parent };
      for (const cs of childSlots(b)) {
        const r = visit(cs.list, { owner: b.id, branch: cs.branch }, b);
        if (r) return r;
      }
    }
    return null;
  };
  return visit(diagram.body, ROOT_SLOT, null);
}

/** Resolves a slot to its (mutable) list inside `diagram`. */
export function getList(diagram: Diagram, slot: Slot): Block[] | null {
  if (slot.owner === null) return diagram.body;
  const loc = findBlock(diagram, slot.owner);
  return loc ? listOf(loc.block, slot.branch) : null;
}

function clone(d: Diagram): Diagram {
  return structuredClone(d);
}

export function insertBlock(diagram: Diagram, slot: Slot, index: number, block: Block): Diagram {
  const d = clone(diagram);
  const list = getList(d, slot);
  if (!list) return diagram;
  const i = Math.max(0, Math.min(index, list.length));
  list.splice(i, 0, block);
  return d;
}

export function removeBlock(diagram: Diagram, id: string): Diagram {
  const d = clone(diagram);
  const loc = findBlock(d, id);
  if (!loc) return diagram;
  getList(d, loc.slot)!.splice(loc.index, 1);
  return d;
}

export function replaceBlock(diagram: Diagram, id: string, fn: (b: Block) => Block): Diagram {
  const d = clone(diagram);
  const loc = findBlock(d, id);
  if (!loc) return diagram;
  getList(d, loc.slot)![loc.index] = fn(loc.block);
  return d;
}

/** Collapses line breaks and trims, as block text is single-line in the DSL. */
export function normalizeText(raw: string): string {
  return raw.replace(/\s*\n\s*/g, ' ').trim();
}

/**
 * Sets a block's primary text (condition, header, statement…).
 * Returns the original diagram when nothing changes, so no history entry is created.
 */
export function setBlockText(diagram: Diagram, id: string, raw: string): Diagram {
  const loc = findBlock(diagram, id);
  if (!loc) return diagram;
  const text = normalizeText(raw);
  if (text === primaryText(loc.block)) return diagram;
  return replaceBlock(diagram, id, (b) => withPrimaryText(b, text));
}

/** Moves a block up (-1) or down (+1) within its sibling list. */
export function moveBlock(diagram: Diagram, id: string, delta: number): Diagram {
  const d = clone(diagram);
  const loc = findBlock(d, id);
  if (!loc) return diagram;
  const list = getList(d, loc.slot)!;
  const j = loc.index + delta;
  if (j < 0 || j >= list.length) return diagram;
  [list[loc.index], list[j]] = [list[j], list[loc.index]];
  return d;
}

/** True if `ancestorId` equals `id` or contains it. */
export function isAncestorOrSelf(diagram: Diagram, ancestorId: string, id: string): boolean {
  const loc = findBlock(diagram, ancestorId);
  if (!loc) return false;
  let found = false;
  const walk = (b: Block): void => {
    if (found) return;
    if (b.id === id) {
      found = true;
      return;
    }
    forEachChildList(b, (l) => l.forEach(walk));
  };
  walk(loc.block);
  return found;
}

/** Moves a block into another slot (drag & drop). Returns original diagram if invalid. */
export function relocateBlock(diagram: Diagram, id: string, target: Slot, index: number): Diagram {
  if (target.owner && isAncestorOrSelf(diagram, id, target.owner)) return diagram;
  const loc = findBlock(diagram, id);
  if (!loc) return diagram;
  let idx = index;
  if (sameSlot(loc.slot, target) && loc.index < index) idx--;
  return insertBlock(removeBlock(diagram, id), target, idx, loc.block);
}

export function countBlocks(diagram: Diagram): number {
  let n = 0;
  const walk = (b: Block): void => {
    n++;
    forEachChildList(b, (l) => l.forEach(walk));
  };
  diagram.body.forEach(walk);
  return n;
}
