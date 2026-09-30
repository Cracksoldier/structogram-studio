export type BlockKind =
  | 'statement'
  | 'call'
  | 'exit'
  | 'if'
  | 'switch'
  | 'while'
  | 'doWhile'
  | 'for';

interface BaseBlock {
  id: string;
}

export interface StatementBlock extends BaseBlock {
  kind: 'statement';
  text: string;
}

export interface CallBlock extends BaseBlock {
  kind: 'call';
  text: string;
}

export interface ExitBlock extends BaseBlock {
  kind: 'exit';
  text: string;
}

export interface IfBlock extends BaseBlock {
  kind: 'if';
  condition: string;
  then: Block[];
  else: Block[];
}

export interface SwitchCase {
  id: string;
  label: string;
  body: Block[];
}

export interface SwitchBlock extends BaseBlock {
  kind: 'switch';
  expr: string;
  cases: SwitchCase[];
  /** `null` means the switch has no default branch. */
  default: Block[] | null;
}

export interface WhileBlock extends BaseBlock {
  kind: 'while';
  condition: string;
  body: Block[];
}

export interface DoWhileBlock extends BaseBlock {
  kind: 'doWhile';
  condition: string;
  body: Block[];
}

export interface ForBlock extends BaseBlock {
  kind: 'for';
  header: string;
  body: Block[];
}

export type Block =
  | StatementBlock
  | CallBlock
  | ExitBlock
  | IfBlock
  | SwitchBlock
  | WhileBlock
  | DoWhileBlock
  | ForBlock;

export interface Diagram {
  title: string;
  body: Block[];
}

let counter = 0;
export function newId(): string {
  counter++;
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `n${counter.toString(36)}${rnd}`;
}

export const BLOCK_LABELS: Record<BlockKind, string> = {
  statement: 'Statement',
  call: 'Call',
  exit: 'Exit / Return',
  if: 'If / Else',
  switch: 'Switch',
  while: 'While loop',
  doWhile: 'Do-While loop',
  for: 'For loop',
};

export function createBlock(kind: BlockKind): Block {
  const id = newId();
  switch (kind) {
    case 'statement':
      return { id, kind, text: 'statement' };
    case 'call':
      return { id, kind, text: 'procedure()' };
    case 'exit':
      return { id, kind, text: 'return' };
    case 'if':
      return { id, kind, condition: 'condition', then: [], else: [] };
    case 'switch':
      return {
        id,
        kind,
        expr: 'value',
        cases: [
          { id: newId(), label: '1', body: [] },
          { id: newId(), label: '2', body: [] },
        ],
        default: [],
      };
    case 'while':
      return { id, kind, condition: 'condition', body: [] };
    case 'doWhile':
      return { id, kind, condition: 'condition', body: [] };
    case 'for':
      return { id, kind, header: 'i := 1 to n', body: [] };
  }
}

/** Deep clone that assigns fresh ids (used for paste / duplicate). */
export function cloneWithNewIds(block: Block): Block {
  const c = structuredClone(block) as Block;
  const walk = (b: Block): void => {
    b.id = newId();
    forEachChildList(b, (list) => list.forEach(walk));
    if (b.kind === 'switch') b.cases.forEach((cs) => (cs.id = newId()));
  };
  walk(c);
  return c;
}

/** Calls `fn` for every child block list of a block. */
export function forEachChildList(b: Block, fn: (list: Block[]) => void): void {
  switch (b.kind) {
    case 'if':
      fn(b.then);
      fn(b.else);
      break;
    case 'switch':
      b.cases.forEach((c) => fn(c.body));
      if (b.default) fn(b.default);
      break;
    case 'while':
    case 'doWhile':
    case 'for':
      fn(b.body);
      break;
    default:
      break;
  }
}

/** Primary editable text of a block (condition, header, statement text…). */
export function primaryText(b: Block): string {
  switch (b.kind) {
    case 'statement':
    case 'call':
    case 'exit':
      return b.text;
    case 'if':
    case 'while':
    case 'doWhile':
      return b.condition;
    case 'switch':
      return b.expr;
    case 'for':
      return b.header;
  }
}

export function withPrimaryText(b: Block, text: string): Block {
  switch (b.kind) {
    case 'statement':
    case 'call':
    case 'exit':
      return { ...b, text };
    case 'if':
    case 'while':
    case 'doWhile':
      return { ...b, condition: text };
    case 'switch':
      return { ...b, expr: text };
    case 'for':
      return { ...b, header: text };
  }
}
