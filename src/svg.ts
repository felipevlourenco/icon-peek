import type { SvgNode } from './parse';

export const ICON_COLOR = '#2b2b2b'; // dark glyph on a light chip: readable on light and dark themes
export const CHIP_COLOR = '#e9e9e9';

// JSX / react-icons camelCase presentation attrs -> svg kebab-case. Real camelCase svg attrs
// (viewBox, gradientUnits, ...) are left alone.
const KEBAB = /^(?:stroke|fill|clip|stop|font|text|dominant|alignment|baseline|letter|word|pointer|vector|shape|color|flood|lighting|marker|paint|writing|unicode|image|enable)[A-Z]/;
const KEEP_CAMEL = new Set(['clipPathUnits', 'markerWidth', 'markerHeight', 'markerUnits', 'textLength']);

export function attrName(n: string): string {
  if (n === 'className') return 'class';
  if (n === 'xlinkHref') return 'xlink:href';
  if (n === 'xmlnsXlink') return 'xmlns:xlink';
  return KEBAB.test(n) && !KEEP_CAMEL.has(n) ? n.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) : n;
}

/** Build a node from loosely-typed attrs (numbers, strings); skips `key`/`ref` and non-scalars. */
export function mkNode(tag: string, attrs: Record<string, unknown>, children: SvgNode[] = []): SvgNode {
  const a: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'key' || k === 'ref') continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') a[attrName(k)] = String(v);
  }
  return { tag, attrs: a, children };
}

// ---------------------------------------------------------------- sanitize

const DROP_TAGS = new Set([
  'script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video', 'canvas', 'link', 'meta',
  'base', 'set', 'handler', 'listener', 'discard', 'title', 'desc', 'metadata',
]);
const ANIM = new Set(['animate', 'animatetransform', 'animatemotion']);
const REF_TAGS = new Set(['use', 'image', 'feimage']);
const EXTERNAL_URL = /url\(\s*['"]?\s*(?!#)/i;
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

class Unsafe extends Error {}

const cleanCss = (css: string) =>
  css
    .replace(CTRL, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(|-moz-binding|behavior\s*:/gi, '')
    .replace(/url\(\s*['"]?\s*(?!#)[^)]*\)/gi, 'none');

/**
 * Returns a cleaned copy, or null when the svg cannot be made safe AND faithful:
 * not an <svg>, or a <use>/<image> pointing at something external (dropping it would show a wrong icon).
 * Removed: script, foreignObject, event handlers, external href / url(), javascript:, @import, foreign namespaces.
 */
export function sanitize(root: SvgNode): SvgNode | null {
  if (root.tag.toLowerCase() !== 'svg') return null;
  let count = 0;
  const walk = (n: SvgNode): SvgNode | null => {
    if (++count > 5000) throw new Unsafe();
    const lower = n.tag.toLowerCase();
    if (DROP_TAGS.has(lower) || n.tag.includes(':')) return null;
    if (ANIM.has(lower) && /href/i.test(n.attrs.attributeName ?? '')) return null;
    const attrs: Record<string, string> = {};
    for (const [k, raw] of Object.entries(n.attrs)) {
      const name = attrName(k);
      const v = raw.replace(CTRL, '');
      if (!/^[A-Za-z_][\w.:-]*$/.test(name) || /^on/i.test(name) || /^xmlns/i.test(name)) continue;
      if (name === 'href' || name === 'xlink:href') {
        const ok = v.startsWith('#') || (lower === 'image' && /^data:image\/(?:png|jpe?g|gif|webp);base64,[\w+/=]+$/i.test(v));
        if (ok) attrs[name] = v;
        else if (REF_TAGS.has(lower)) throw new Unsafe();
        continue;
      }
      if (name.includes(':') && !/^(xlink|xml):/.test(name)) continue;
      if (/javascript:/i.test(v) || EXTERNAL_URL.test(v)) continue;
      if (name === 'style' && /@import|expression\s*\(|behavior\s*:|-moz-binding/i.test(v)) continue;
      attrs[name] = v;
    }
    const children: (SvgNode | string)[] = [];
    for (const c of n.children) {
      if (typeof c === 'string') children.push(lower === 'style' ? cleanCss(c) : c.replace(CTRL, ''));
      else {
        const w = walk(c);
        if (w) children.push(w);
      }
    }
    return { tag: n.tag, attrs, children };
  };
  try {
    return walk(root);
  } catch (e) {
    if (e instanceof Unsafe) return null;
    throw e;
  }
}

// ---------------------------------------------------------------- theme + preview

/** currentColor -> ICON_COLOR; add a stroke when the root is fill:none and nothing sets one. */
function applyTheme(root: SvgNode): void {
  let hasStroke = false;
  let hasStyle = false;
  const walk = (n: SvgNode) => {
    for (const k of Object.keys(n.attrs)) n.attrs[k] = n.attrs[k].replace(/currentcolor/gi, ICON_COLOR);
    if ('stroke' in n.attrs) hasStroke = true;
    if (n.tag.toLowerCase() === 'style') hasStyle = true;
    n.children = n.children.map((c) => {
      if (typeof c === 'string') return c.replace(/currentcolor/gi, ICON_COLOR);
      walk(c);
      return c;
    });
  };
  walk(root);
  if (root.attrs.fill === 'none' && !hasStroke && !hasStyle) root.attrs.stroke = ICON_COLOR;
}

function viewBoxOf(a: Record<string, string>): [number, number, number, number] | null {
  const vb = a.viewBox?.trim().split(/[\s,]+/).map(Number);
  if (vb?.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) return vb as [number, number, number, number];
  const num = (v?: string) => (v && /^\d+(\.\d+)?(px)?$/.test(v) ? parseFloat(v) : NaN);
  const w = num(a.width);
  const h = num(a.height);
  return w > 0 && h > 0 ? [0, 0, w, h] : null;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function serialize(n: SvgNode): string {
  const a = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  if (!n.children.length) return `<${n.tag}${a}/>`;
  const style = n.tag.toLowerCase() === 'style';
  const body = n.children
    .map((c) => (typeof c !== 'string' ? serialize(c) : style ? `<![CDATA[${c.replace(/]]>/g, ']] >')}]]>` : c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')))
    .join('');
  return `<${n.tag}${a}>${body}</${n.tag}>`;
}

/**
 * Sanitize + theme + fit the icon into a `size`px neutral chip. Returns standalone svg text,
 * or null if the icon cannot be rendered faithfully (unsafe, no usable viewBox, too large).
 */
export function renderPreview(root: SvgNode, size: number, maxBytes: number): string | null {
  const clean = sanitize(root);
  if (!clean) return null;
  const vb = viewBoxOf(clean.attrs);
  if (!vb) return null;
  applyTheme(clean);
  const S = Math.round(Math.min(256, Math.max(16, size || 48)));
  const pad = Math.round(S * 0.12);
  const { width: _w, height: _h, x: _x, y: _y, style: _s, id: _i, class: _c, ...rest } = clean.attrs;
  const inner: SvgNode = {
    tag: 'svg',
    attrs: { ...rest, viewBox: vb.join(' '), x: String(pad), y: String(pad), width: String(S - 2 * pad), height: String(S - 2 * pad) },
    children: clean.children,
  };
  const out =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">` +
    `<rect width="${S}" height="${S}" rx="${Math.round(S / 8)}" style="fill:${CHIP_COLOR}"/>${serialize(inner)}</svg>`;
  return out.length > maxBytes ? null : out;
}

export const toDataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
