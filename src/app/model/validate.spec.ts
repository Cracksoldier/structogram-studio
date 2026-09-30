import { describe, expect, it } from 'vitest';
import { parseDsl } from '../dsl/parser';
import { layoutDiagram } from '../layout/layout';
import { approxMeasurer } from '../layout/text-measure';
import { SAMPLE_DSL } from './sample';
import { InvalidDiagramError, validateDiagram } from './validate';

describe('validateDiagram', () => {
  it('accepts a diagram produced by the editor unchanged', () => {
    const r = parseDsl(SAMPLE_DSL);
    if (!r.ok) throw new Error();
    const json = JSON.parse(JSON.stringify(r.diagram));
    expect(validateDiagram(json)).toEqual(r.diagram);
  });

  it.each([
    ['non-object', 42],
    ['missing body', { title: 'x' }],
    ['non-object block', { body: [1] }],
    ['unknown kind', { body: [{ kind: 'goto', text: 'x' }] }],
    ['if without branches', { body: [{ kind: 'if', condition: 'c' }] }],
    ['statement without text', { body: [{ kind: 'statement' }] }],
    ['nested bad block', { body: [{ kind: 'while', condition: 'c', body: [{ kind: 'call', text: 5 }] }] }],
    ['switch with no branches', { body: [{ kind: 'switch', expr: 'x', cases: [], default: null }] }],
    ['non-string title', { title: 3, body: [] }],
  ])('rejects %s', (_, input) => {
    expect(() => validateDiagram(input)).toThrow(InvalidDiagramError);
  });

  it('assigns ids when missing or duplicated and drops unknown fields', () => {
    const d = validateDiagram({
      body: [
        { kind: 'statement', text: 'a', extra: true },
        { id: 'dup', kind: 'statement', text: 'b' },
        { id: 'dup', kind: 'statement', text: 'c' },
      ],
    });
    const ids = d.body.map((b) => b.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[1]).toBe('dup');
    expect(d.body[0]).not.toHaveProperty('extra');
    expect(d.title).toBe('');
  });

  it('produces diagrams the layout engine can render', () => {
    const d = validateDiagram({
      body: [{ kind: 'switch', expr: 'x', cases: [{ label: '1', body: [] }] }],
    });
    expect(() => layoutDiagram(d, approxMeasurer)).not.toThrow();
  });
});
