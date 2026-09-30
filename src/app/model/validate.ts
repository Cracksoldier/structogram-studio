import { Block, Diagram, SwitchCase, newId } from './diagram.model';

export class InvalidDiagramError extends Error {}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function str(o: Obj, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new InvalidDiagramError(`${path}.${key} must be a string`);
  return v;
}

/**
 * Validates untrusted data (opened files, localStorage) and returns a clean
 * Diagram. Unknown properties are dropped; missing or duplicate ids are
 * replaced with fresh ones. Throws InvalidDiagramError on malformed input.
 */
export function validateDiagram(input: unknown): Diagram {
  if (!isObj(input)) throw new InvalidDiagramError('Diagram must be an object');
  const seen = new Set<string>();

  const id = (o: Obj): string => {
    const v = o['id'];
    if (typeof v === 'string' && v !== '' && !seen.has(v)) {
      seen.add(v);
      return v;
    }
    const fresh = newId();
    seen.add(fresh);
    return fresh;
  };

  const list = (v: unknown, path: string): Block[] => {
    if (!Array.isArray(v)) throw new InvalidDiagramError(`${path} must be an array`);
    return v.map((b, i) => block(b, `${path}[${i}]`));
  };

  const block = (v: unknown, path: string): Block => {
    if (!isObj(v)) throw new InvalidDiagramError(`${path} must be an object`);
    const kind = v['kind'];
    switch (kind) {
      case 'statement':
      case 'call':
      case 'exit':
        return { id: id(v), kind, text: str(v, 'text', path) };
      case 'if':
        return {
          id: id(v),
          kind,
          condition: str(v, 'condition', path),
          then: list(v['then'], `${path}.then`),
          else: list(v['else'], `${path}.else`),
        };
      case 'while':
      case 'doWhile':
        return { id: id(v), kind, condition: str(v, 'condition', path), body: list(v['body'], `${path}.body`) };
      case 'for':
        return { id: id(v), kind, header: str(v, 'header', path), body: list(v['body'], `${path}.body`) };
      case 'switch': {
        const rawCases = v['cases'];
        if (!Array.isArray(rawCases)) throw new InvalidDiagramError(`${path}.cases must be an array`);
        const cases: SwitchCase[] = rawCases.map((c, i) => {
          const cp = `${path}.cases[${i}]`;
          if (!isObj(c)) throw new InvalidDiagramError(`${cp} must be an object`);
          return { id: id(c), label: str(c, 'label', cp), body: list(c['body'], `${cp}.body`) };
        });
        const def = v['default'] == null ? null : list(v['default'], `${path}.default`);
        if (cases.length === 0 && !def) throw new InvalidDiagramError(`${path} needs at least one case`);
        return { id: id(v), kind, expr: str(v, 'expr', path), cases, default: def };
      }
      default:
        throw new InvalidDiagramError(`${path}.kind "${String(kind)}" is not a known block type`);
    }
  };

  const title = input['title'] === undefined ? '' : str(input, 'title', 'diagram');
  return { title, body: list(input['body'], 'body') };
}
