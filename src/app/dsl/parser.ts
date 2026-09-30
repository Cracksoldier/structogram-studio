import { Block, Diagram, SwitchCase, newId } from '../model/diagram.model';

export interface ParseError {
  line: number; // 1-based
  message: string;
}

export type ParseResult =
  | { ok: true; diagram: Diagram }
  | { ok: false; error: ParseError };

class DslError extends Error {
  constructor(
    public line: number,
    message: string,
  ) {
    super(message);
  }
}

interface Line {
  no: number;
  text: string;
}

/** Keywords that start a structured line; statements beginning with them must be quoted. */
export const KEYWORDS = ['if', 'else', 'while', 'for', 'do', 'switch', 'case', 'default', 'call', 'exit', 'title'];

const HEADER = /^(if|while|for|switch|case)\s+(.+?)\s*\{$/;

export function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  return t;
}

/**
 * Parses the Nassi–Shneiderman text DSL.
 *
 * ```
 * title "Name"
 * statement text
 * call proc()
 * exit return x
 * if cond { … } else if cond2 { … } else { … }
 * while cond { … }
 * for i := 1 to n { … }
 * do { … } while cond
 * switch expr { case 1 { … } default { … } }
 * ```
 */
export function parseDsl(source: string): ParseResult {
  const lines: Line[] = source
    .split(/\r?\n/)
    .map((text, i) => ({ no: i + 1, text: text.trim() }))
    .filter((l) => l.text !== '' && !l.text.startsWith('#') && !l.text.startsWith('//'));

  let pos = 0;
  let title = '';

  const peek = (): Line | undefined => lines[pos];

  /** Parses statements until a line starting with `}` (not consumed) or EOF. */
  const parseList = (): Block[] => {
    const out: Block[] = [];
    while (pos < lines.length) {
      const l = lines[pos];
      if (l.text.startsWith('}')) break;
      const tm = /^title(?:\s+(.*))?$/.exec(l.text);
      if (tm) {
        title = unquote(tm[1] ?? '');
        pos++;
        continue;
      }
      out.push(parseBlock());
    }
    return out;
  };

  const expectClose = (opener: Line, what: string): Line => {
    const l = peek();
    if (!l) throw new DslError(opener.no, `Unclosed ${what}: missing "}"`);
    pos++;
    return l;
  };

  const parseIfRest = (opener: Line, condition: string): Block => {
    const thenList = parseList();
    const close = expectClose(opener, '"if"');
    let elseList: Block[] = [];
    const t = close.text;
    if (t === '}') {
      // no else
    } else if (/^\}\s*else\s*\{$/.test(t)) {
      elseList = parseList();
      const c2 = expectClose(close, '"else"');
      if (c2.text !== '}') throw new DslError(c2.no, `Expected "}" to close "else", got "${c2.text}"`);
    } else {
      const m = /^\}\s*else\s+if\s+(.+?)\s*\{$/.exec(t);
      if (!m) throw new DslError(close.no, `Unexpected "${t}" after "if" branch`);
      elseList = [parseIfRest(close, unquote(m[1]))];
    }
    return { id: newId(), kind: 'if', condition, then: thenList, else: elseList };
  };

  const parseBody = (opener: Line, what: string): Block[] => {
    const body = parseList();
    const c = expectClose(opener, what);
    if (c.text !== '}') throw new DslError(c.no, `Expected "}" to close ${what}, got "${c.text}"`);
    return body;
  };

  const parseSwitch = (opener: Line, expr: string): Block => {
    const cases: SwitchCase[] = [];
    let def: Block[] | null = null;
    while (true) {
      const l = peek();
      if (!l) throw new DslError(opener.no, 'Unclosed "switch": missing "}"');
      if (l.text === '}') {
        pos++;
        break;
      }
      pos++;
      const m = HEADER.exec(l.text);
      if (m && m[1] === 'case') {
        cases.push({ id: newId(), label: unquote(m[2]), body: parseBody(l, '"case"') });
      } else if (/^default\s*\{$/.test(l.text)) {
        if (def) throw new DslError(l.no, 'Duplicate "default" in switch');
        def = parseBody(l, '"default"');
      } else {
        throw new DslError(l.no, `Only "case <label> {" or "default {" allowed inside switch, got "${l.text}"`);
      }
    }
    if (cases.length === 0 && !def) throw new DslError(opener.no, 'A switch needs at least one case');
    return { id: newId(), kind: 'switch', expr, cases, default: def };
  };

  const parseBlock = (): Block => {
    const l = lines[pos++];
    const t = l.text;

    const header = HEADER.exec(t);
    if (header) {
      const [, kw, rest] = header;
      const arg = unquote(rest);
      switch (kw) {
        case 'if':
          return parseIfRest(l, arg);
        case 'while':
          return { id: newId(), kind: 'while', condition: arg, body: parseBody(l, '"while"') };
        case 'for':
          return { id: newId(), kind: 'for', header: arg, body: parseBody(l, '"for"') };
        case 'switch':
          return parseSwitch(l, arg);
        case 'case':
          throw new DslError(l.no, '"case" is only allowed inside a switch');
      }
    }
    if (/^do\s*\{$/.test(t)) {
      const body = parseList();
      const c = expectClose(l, '"do"');
      const m = /^\}\s*while\s+(.+)$/.exec(c.text);
      if (!m) throw new DslError(c.no, 'Expected "} while <condition>" to close "do"');
      return { id: newId(), kind: 'doWhile', condition: unquote(m[1]), body };
    }
    if (/^default\s*\{$/.test(t)) throw new DslError(l.no, '"default" is only allowed inside a switch');

    const kwm = /^(call|exit)(?:\s+(.*))?$/.exec(t);
    if (kwm) {
      return { id: newId(), kind: kwm[1] as 'call' | 'exit', text: unquote(kwm[2] ?? '') };
    }
    if (/^(return|break|continue)\b/.test(t)) {
      return { id: newId(), kind: 'exit', text: t };
    }
    if (t.endsWith('{')) throw new DslError(l.no, `Unknown block header "${t}"`);
    return { id: newId(), kind: 'statement', text: unquote(t) };
  };

  try {
    const body = parseList();
    if (pos < lines.length) {
      throw new DslError(lines[pos].no, `Unexpected "${lines[pos].text}"`);
    }
    return { ok: true, diagram: { title, body } };
  } catch (e) {
    if (e instanceof DslError) return { ok: false, error: { line: e.line, message: e.message } };
    throw e;
  }
}
