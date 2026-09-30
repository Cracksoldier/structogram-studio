import { describe, expect, it } from 'vitest';
import { Block, Diagram } from '../model/diagram.model';
import { SAMPLE_DSL } from '../model/sample';
import { parseDsl } from './parser';
import { reconcileIds } from './reconcile';
import { serializeDsl } from './serializer';

/** Removes ids so structures can be compared. */
function strip(d: Diagram): unknown {
  return JSON.parse(JSON.stringify(d, (k, v) => (k === 'id' ? undefined : v)));
}

function parseOk(src: string): Diagram {
  const r = parseDsl(src);
  if (!r.ok) throw new Error(`line ${r.error.line}: ${r.error.message}`);
  return r.diagram;
}

describe('parseDsl', () => {
  it('parses the sample', () => {
    const d = parseOk(SAMPLE_DSL);
    expect(d.title).toBe('Bubble Sort');
    expect(d.body.map((b) => b.kind)).toEqual(['statement', 'statement', 'while', 'switch']);
    const sw = d.body[3];
    expect(sw.kind === 'switch' && sw.cases.length).toBe(2);
    expect(sw.kind === 'switch' && sw.default?.[0].kind).toBe('doWhile');
  });

  it('parses else-if chains as nested ifs', () => {
    const d = parseOk('if a {\n x\n} else if b {\n y\n} else {\n z\n}');
    const top = d.body[0] as Extract<Block, { kind: 'if' }>;
    expect(top.else[0].kind).toBe('if');
    expect((top.else[0] as typeof top).else[0]).toMatchObject({ kind: 'statement', text: 'z' });
  });

  it('treats return/break as exit and quoted keywords as statements', () => {
    const d = parseOk('return x\nbreak\n"if this is text"');
    expect(d.body.map((b) => b.kind)).toEqual(['exit', 'exit', 'statement']);
    expect(d.body[2]).toMatchObject({ text: 'if this is text' });
  });

  it('reports errors with line numbers', () => {
    const r = parseDsl('a\nwhile x {\n  b\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.line).toBe(2);
    const r2 = parseDsl('a\n}\n');
    expect(!r2.ok && r2.error.line).toBe(2);
    const r3 = parseDsl('switch x {\n  y\n}');
    expect(!r3.ok && r3.error.line).toBe(2);
  });

  it('ignores comments and blank lines', () => {
    expect(parseOk('# comment\n\n// other\nx').body).toHaveLength(1);
  });
});

describe('serializeDsl round trip', () => {
  const cases = [
    SAMPLE_DSL,
    'if a {\n} else {\n  b\n}',
    'switch x {\n  case "+" {\n  }\n}',
    'do {\n} while "  spaced  "',
    '"while not a loop"\n"}"\n"return nothing"\n"x {"',
    'call\nexit',
    'if a {\n  b\n} else if c {\n  d\n}',
  ];
  for (const src of cases) {
    it(`round-trips ${JSON.stringify(src.slice(0, 30))}`, () => {
      const a = parseOk(src);
      const text = serializeDsl(a);
      const b = parseOk(text);
      expect(strip(b)).toEqual(strip(a));
      expect(serializeDsl(b)).toBe(text);
    });
  }

  it('round-trips hand-built text needing quotes', () => {
    const d: Diagram = {
      title: 'T "q"',
      body: [
        { id: '1', kind: 'statement', text: 'for real' },
        { id: '2', kind: 'if', condition: 'x {', then: [], else: [] },
        { id: '3', kind: 'statement', text: '"quoted"' },
      ],
    };
    expect(strip(parseOk(serializeDsl(d)))).toEqual(strip(d));
  });
});

describe('reconcileIds', () => {
  it('keeps ids of structurally matching blocks', () => {
    const a = parseOk('x\nif c {\n  y\n}');
    const b = reconcileIds(a, parseOk('x2\nif c2 {\n  y\n  z\n}'));
    expect(b.body[0].id).toBe(a.body[0].id);
    expect(b.body[1].id).toBe(a.body[1].id);
  });
});

describe('documentation', () => {
  it('README syntax example parses', async () => {
    const { readFileSync } = await import('node:fs');
    const readme = readFileSync('README.md', 'utf-8');
    const block = /## Pseudo-code syntax\s+```\n([\s\S]*?)```/.exec(readme)![1];
    const d = parseOk(block);
    expect(d.title).toBe('My algorithm');
    expect(d.body.map((b) => b.kind)).toEqual(['statement', 'call', 'exit', 'exit', 'if', 'switch', 'while', 'for', 'doWhile']);
  });
});
