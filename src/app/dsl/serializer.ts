import { Block, Diagram } from '../model/diagram.model';
import { KEYWORDS } from './parser';

const INDENT = '  ';

function quote(s: string): string {
  return `"${s.replace(/(["\\])/g, '\\$1')}"`;
}

function needsQuote(s: string): boolean {
  const t = s.trim();
  return t !== s || t === '' || (t.startsWith('"') && t.endsWith('"'));
}

function arg(s: string): string {
  return needsQuote(s) || s.endsWith('{') ? quote(s) : s;
}

function statementText(s: string): string {
  const first = s.trim().split(/\s|\{/)[0];
  const risky =
    needsQuote(s) ||
    KEYWORDS.includes(first) ||
    /^(return|break|continue)\b/.test(s) ||
    s.startsWith('}') ||
    s.startsWith('#') ||
    s.startsWith('//') ||
    s.endsWith('{');
  return risky ? quote(s) : s;
}

function optArg(s: string): string {
  return s === '' ? '' : ` ${needsQuote(s) ? quote(s) : s}`;
}

export function serializeBlocks(list: Block[], depth: number, out: string[]): void {
  const pad = INDENT.repeat(depth);
  for (const b of list) {
    switch (b.kind) {
      case 'statement':
        out.push(pad + statementText(b.text));
        break;
      case 'call':
        out.push(`${pad}call${optArg(b.text)}`);
        break;
      case 'exit':
        out.push(`${pad}exit${optArg(b.text)}`);
        break;
      case 'if': {
        out.push(`${pad}if ${arg(b.condition)} {`);
        let cur = b;
        while (true) {
          serializeBlocks(cur.then, depth + 1, out);
          if (cur.else.length === 1 && cur.else[0].kind === 'if') {
            cur = cur.else[0];
            out.push(`${pad}} else if ${arg(cur.condition)} {`);
            continue;
          }
          if (cur.else.length > 0) {
            out.push(`${pad}} else {`);
            serializeBlocks(cur.else, depth + 1, out);
          }
          out.push(`${pad}}`);
          break;
        }
        break;
      }
      case 'while':
        out.push(`${pad}while ${arg(b.condition)} {`);
        serializeBlocks(b.body, depth + 1, out);
        out.push(`${pad}}`);
        break;
      case 'for':
        out.push(`${pad}for ${arg(b.header)} {`);
        serializeBlocks(b.body, depth + 1, out);
        out.push(`${pad}}`);
        break;
      case 'doWhile':
        out.push(`${pad}do {`);
        serializeBlocks(b.body, depth + 1, out);
        out.push(`${pad}} while ${needsQuote(b.condition) ? quote(b.condition) : b.condition}`);
        break;
      case 'switch':
        out.push(`${pad}switch ${arg(b.expr)} {`);
        for (const c of b.cases) {
          out.push(`${pad}${INDENT}case ${arg(c.label)} {`);
          serializeBlocks(c.body, depth + 2, out);
          out.push(`${pad}${INDENT}}`);
        }
        if (b.default) {
          out.push(`${pad}${INDENT}default {`);
          serializeBlocks(b.default, depth + 2, out);
          out.push(`${pad}${INDENT}}`);
        }
        out.push(`${pad}}`);
        break;
    }
  }
}

export function serializeDsl(d: Diagram): string {
  const out: string[] = [];
  if (d.title) out.push(`title ${quote(d.title)}`, '');
  serializeBlocks(d.body, 0, out);
  return out.join('\n') + '\n';
}
