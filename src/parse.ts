// Pure text parsing. No fs, no vscode. Nothing here executes the text it reads.

export interface Attr {
  name: string; // '' for `{...spread}` / svelte shorthand
  value: string | null; // static string value, null when dynamic
  expr: string | null; // inner text of `{...}` (or of a vue binding), when dynamic
}
export interface Tag {
  name: string;
  start: number;
  end: number; // exclusive
  attrs: Attr[];
  selfClosing: boolean;
}
export interface SvgNode {
  tag: string;
  attrs: Record<string, string>;
  children: (SvgNode | string)[];
}
export interface Binding {
  local: string;
  imported: string; // 'default' | '*' | export name
  source: string;
}

const MAX_TAG = 20_000;
const isWs = (c: string | undefined) => c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === '\f';

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const l = e.toLowerCase();
    if (l[0] === '#') return String.fromCodePoint(l[1] === 'x' ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[l]!;
  });
}

/** Index after the string literal that opens at s[i]; -1 if unterminated. */
function skipString(s: string, i: number, limit: number): number {
  const q = s[i];
  for (let j = i + 1; j < limit; j++) {
    const c = s[j];
    if (c === '\\') j++;
    else if (c === q) return j + 1;
    else if (q === '`' && c === '$' && s[j + 1] === '{') {
      const e = skipBraces(s, j + 1, limit);
      if (e < 0) return -1;
      j = e - 1;
    }
  }
  return -1;
}

/** Index after the `}` matching the `{` at s[i]; -1 if unbalanced. */
function skipBraces(s: string, i: number, limit: number): number {
  let depth = 0;
  for (let j = i; j < limit; j++) {
    const c = s[j];
    if (c === '{') depth++;
    else if (c === '}') {
      if (--depth === 0) return j + 1;
    } else if (c === '"' || c === "'" || c === '`') {
      const e = skipString(s, j, limit);
      if (e < 0) return -1;
      j = e - 1;
    } else if (c === '/' && s[j + 1] === '*') {
      const e = s.indexOf('*/', j + 2);
      if (e < 0 || e >= limit) return -1;
      j = e + 1;
    } else if (c === '/' && s[j + 1] === '/' && (isWs(s[j - 1]) || s[j - 1] === '{')) {
      const e = s.indexOf('\n', j);
      if (e < 0 || e >= limit) return -1;
      j = e;
    }
  }
  return -1;
}

/** `{"x"}`, `{'x'}`, `{`x`}`, `{12}`, `{true}` -> static string; anything else -> null. */
function bracedLiteral(inner: string): string | null {
  const q = inner[0];
  if ((q === '"' || q === "'" || q === '`') && inner.length >= 2 && inner.at(-1) === q) {
    const body = inner.slice(1, -1);
    return body.includes(q) || body.includes('\\') || body.includes('${') ? null : body;
  }
  return /^-?\d+(\.\d+)?$|^(true|false)$/.test(inner) ? inner : null;
}

/** Parse the opening tag that starts at s[start] ('<'). Null when it is not a well-formed tag. */
export function parseTagAt(s: string, start: number): Tag | null {
  if (s[start] !== '<') return null;
  const nm = /[A-Za-z][\w.:-]*/y;
  nm.lastIndex = start + 1;
  const m = nm.exec(s);
  if (!m) return null;
  const name = m[0];
  const limit = Math.min(s.length, start + MAX_TAG);
  const attrs: Attr[] = [];
  let i = start + 1 + name.length;
  const ws = () => {
    while (i < limit && isWs(s[i])) i++;
  };
  while (i < limit) {
    ws();
    const c = s[i];
    if (c === '>') return { name, start, end: i + 1, attrs, selfClosing: false };
    if (c === '/' && s[i + 1] === '>') return { name, start, end: i + 2, attrs, selfClosing: true };
    if (c === '{') {
      const e = skipBraces(s, i, limit);
      if (e < 0) return null;
      attrs.push({ name: '', value: null, expr: s.slice(i + 1, e - 1).trim() });
      i = e;
      continue;
    }
    const a = i;
    while (i < limit && !/[\s=/>{}"'<]/.test(s[i])) i++;
    if (i === a) return null;
    const aname = s.slice(a, i);
    ws();
    if (s[i] !== '=') {
      attrs.push({ name: aname, value: '', expr: null });
      continue;
    }
    i++;
    ws();
    const q = s[i];
    let value: string | null = null;
    let expr: string | null = null;
    if (q === '"' || q === "'") {
      const e = s.indexOf(q, i + 1);
      if (e < 0 || e >= limit) return null;
      value = decodeEntities(s.slice(i + 1, e));
      i = e + 1;
    } else if (q === '{') {
      const e = skipBraces(s, i, limit);
      if (e < 0) return null;
      expr = s.slice(i + 1, e - 1).trim();
      value = bracedLiteral(expr);
      i = e;
    } else {
      const b = i;
      while (i < limit && !isWs(s[i]) && s[i] !== '>' && !(s[i] === '/' && s[i + 1] === '>')) i++;
      value = s.slice(b, i);
    }
    // vue :bind / @event / #slot / v-*: the quoted text is code, not a literal
    if (/^(:|@|#|v-)/.test(aname)) {
      expr = value ?? expr;
      value = null;
    }
    attrs.push({ name: aname, value, expr });
  }
  return null;
}

/** Innermost opening tag whose text range contains `offset`. */
export function findTagAt(s: string, offset: number): Tag | null {
  let i = s.lastIndexOf('<', offset);
  for (let tries = 0; i >= 0 && tries < 64; tries++) {
    const t = parseTagAt(s, i);
    if (t && offset < t.end) return t;
    i = i > 0 ? s.lastIndexOf('<', i - 1) : -1;
  }
  return null;
}

export function attrValue(tag: Tag, name: string): string | null {
  return tag.attrs.find((a) => a.name === name)?.value ?? null;
}

// ---------------------------------------------------------------- markup -> SvgNode

class Bail extends Error {}
const DYNAMIC_OK = /^(class|classname|key|ref|style|data-|aria-)/i;

/**
 * Parse the element at s[start] into a tree.
 * jsx=true: `{expr}` children and non-ignorable dynamic attributes on child elements make the
 * parse fail (we cannot render what we cannot know). Dynamic attributes on the root are dropped.
 */
export function parseMarkup(s: string, start: number, jsx: boolean): SvgNode | null {
  let budget = 5000;
  const element = (i: number, depth: number): { node: SvgNode; end: number } => {
    if (depth > 40 || --budget < 0) throw new Bail();
    const t = parseTagAt(s, i);
    if (!t) throw new Bail();
    const attrs: Record<string, string> = {};
    for (const a of t.attrs) {
      if (a.value !== null) attrs[a.name] = a.value;
      else if (depth > 0 && !DYNAMIC_OK.test(a.name)) throw new Bail();
    }
    const node: SvgNode = { tag: t.name, attrs, children: [] };
    if (t.selfClosing) return { node, end: t.end };
    const lower = t.name.toLowerCase();
    let p = t.end;
    if (lower === 'style' || lower === 'script') {
      const m = new RegExp(`</${lower}\\s*>`, 'i').exec(s.slice(p));
      if (!m) throw new Bail();
      node.children.push(s.slice(p, p + m.index).replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, ''));
      return { node, end: p + m.index + m[0].length };
    }
    for (;;) {
      const lt = s.indexOf('<', p);
      const br = jsx ? s.indexOf('{', p) : -1;
      const n = br >= 0 && (lt < 0 || br < lt) ? br : lt;
      if (n < 0) throw new Bail();
      const text = s.slice(p, n);
      if (text.trim()) node.children.push(decodeEntities(text.trim()));
      if (n === br) {
        const e = skipBraces(s, n, s.length);
        if (e < 0) throw new Bail();
        if (!/^\{\s*(\/\*[\s\S]*\*\/)?\s*\}$/.test(s.slice(n, e))) throw new Bail(); // only empty / comment braces
        p = e;
      } else if (s.startsWith('<!--', n)) {
        const e = s.indexOf('-->', n + 4);
        if (e < 0) throw new Bail();
        p = e + 3;
      } else if (s.startsWith('<![CDATA[', n)) {
        const e = s.indexOf(']]>', n);
        if (e < 0) throw new Bail();
        node.children.push(s.slice(n + 9, e));
        p = e + 3;
      } else if (s[n + 1] === '/') {
        const m = /^<\/([A-Za-z][\w.:-]*)\s*>/.exec(s.slice(n, n + 200));
        if (!m || m[1].toLowerCase() !== lower) throw new Bail();
        return { node, end: n + m[0].length };
      } else if (/[A-Za-z]/.test(s[n + 1] ?? '')) {
        const c = element(n, depth + 1);
        node.children.push(c.node);
        p = c.end;
      } else if (s[n + 1] === '?' || s[n + 1] === '!') {
        const e = s.indexOf('>', n);
        if (e < 0) throw new Bail();
        p = e + 1;
      } else throw new Bail();
    }
  };
  try {
    return element(start, 0).node;
  } catch (e) {
    if (e instanceof Bail) return null;
    throw e;
  }
}

/** Parse a standalone .svg document (skips xml prolog, doctype, comments). Root must be <svg>. */
export function parseSvgDocument(text: string): SvgNode | null {
  let i = 0;
  for (;;) {
    while (isWs(text[i])) i++;
    if (text.startsWith('<?', i)) i = text.indexOf('?>', i) + 2;
    else if (text.startsWith('<!--', i)) i = text.indexOf('-->', i) + 3;
    else if (text.startsWith('<!', i)) {
      const sub = text.indexOf('[', i);
      const gt = text.indexOf('>', i);
      i = sub >= 0 && sub < gt ? text.indexOf(']>', i) + 2 : gt + 1;
    } else break;
    if (i < 2) return null; // an indexOf above failed
  }
  const n = parseMarkup(text, i, false);
  return n && n.tag.toLowerCase() === 'svg' ? n : null;
}

// ---------------------------------------------------------------- imports

export function parseImports(s: string): Binding[] {
  const out: Binding[] = [];
  const re = /\bimport\s+(?:type\s+)?([\w$\s{},*]+?)\s*from\s*(['"])([^'"\n]+)\2/g;
  for (const m of s.matchAll(re)) {
    const clause = m[1];
    const source = m[3];
    const brace = clause.indexOf('{');
    for (const part of (brace >= 0 ? clause.slice(0, brace) : clause).split(',')) {
      const p = part.trim();
      const ns = /^\*\s*as\s+([\w$]+)$/.exec(p);
      if (ns) out.push({ local: ns[1], imported: '*', source });
      else if (/^[\w$]+$/.test(p)) out.push({ local: p, imported: 'default', source });
    }
    if (brace >= 0) {
      for (const part of clause.slice(brace + 1, clause.indexOf('}')).split(',')) {
        const mm = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(part.trim().replace(/^type\s+/, ''));
        if (mm) out.push({ local: mm[2] ?? mm[1], imported: mm[1], source });
      }
    }
  }
  return out;
}

/** `Foo` or `Ns.Foo` (namespace import) -> where it comes from. */
export function bindTag(tagName: string, imports: Binding[]): { source: string; imported: string } | null {
  const dot = tagName.indexOf('.');
  if (dot > 0) {
    const ns = imports.find((b) => b.local === tagName.slice(0, dot) && b.imported === '*');
    return ns ? { source: ns.source, imported: tagName.slice(dot + 1) } : null;
  }
  const b = imports.find((x) => x.local === tagName);
  return b ? { source: b.source, imported: b.imported } : null;
}

// ---------------------------------------------------------------- JS literal parser

/**
 * Reads a JS value (object / array / string / number / bool / null / identifier / call expression)
 * from source text WITHOUT evaluating it. Identifiers become {ident}, calls become {call, args}.
 * Anything else (operators, templates with ${}) throws. Returns the value and the end offset.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseJs(s: string, start: number): { value: any; end: number } {
  let i = start;
  const fail = (): never => {
    throw new Error(`unsupported JS at ${i}`);
  };
  const ws = () => {
    for (;;) {
      const c = s[i];
      if (c === ' ' || c === '\n' || c === '\t' || c === '\r') i++;
      else if (c === '/' && s[i + 1] === '*') {
        const e = s.indexOf('*/', i + 2);
        if (e < 0) fail();
        i = e + 2;
      } else if (c === '/' && s[i + 1] === '/') {
        const e = s.indexOf('\n', i);
        i = e < 0 ? s.length : e;
      } else return;
    }
  };
  const str = (): string => {
    const q = s[i++];
    let out = '';
    for (;;) {
      const c = s[i++];
      if (c === undefined) fail();
      if (c === q) return out;
      if (c === '\\') {
        const n = s[i++];
        out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'u' ? String.fromCharCode(parseInt(s.slice(i, (i += 4)), 16)) : n;
      } else out += c;
    }
  };
  const list = (close: string, item: () => void) => {
    i++; // opener
    for (;;) {
      ws();
      if (s[i] === close) {
        i++;
        return;
      }
      item();
      ws();
      if (s[i] === ',') i++;
      else if (s[i] !== close) fail();
    }
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const value = (): any => {
    ws();
    const c = s[i];
    if (c === '{') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o: Record<string, any> = {};
      list('}', () => {
        if (s.startsWith('...', i)) {
          i += 3;
          value();
          return;
        }
        let k: string;
        if (s[i] === '"' || s[i] === "'") k = str();
        else {
          const m = /^[\w$]+/.exec(s.slice(i, i + 80));
          if (!m) fail();
          k = m![0];
          i += k.length;
        }
        ws();
        if (s[i] !== ':') fail();
        i++;
        o[k] = value();
      });
      return o;
    }
    if (c === '[') {
      const a: unknown[] = [];
      list(']', () => a.push(value()));
      return a;
    }
    if (c === '"' || c === "'") return str();
    if (c === '`') {
      const e = s.indexOf('`', i + 1);
      const t = s.slice(i + 1, e);
      if (e < 0 || t.includes('${')) fail();
      i = e + 1;
      return t;
    }
    let callee: string;
    let parenCallee = false;
    if (c === '(') {
      const e = s.indexOf(')', i); // `(0, _jsxRuntime.jsx)` - no nesting
      if (e < 0) fail();
      callee = s.slice(i, e + 1);
      parenCallee = true;
      i = e + 1;
    } else {
      const num = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i.exec(s.slice(i, i + 40));
      if (num) {
        i += num[0].length;
        return Number(num[0]);
      }
      const id = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/.exec(s.slice(i, i + 120));
      if (!id) fail();
      callee = id![0];
      i += callee.length;
      if (callee === 'true') return true;
      if (callee === 'false') return false;
      if (callee === 'null' || callee === 'undefined') return null;
    }
    ws();
    if (s[i] !== '(') {
      if (parenCallee) fail();
      return { ident: callee };
    }
    const args: unknown[] = [];
    list(')', () => args.push(value()));
    return { call: callee, args };
  };
  const v = value();
  return { value: v, end: i };
}
