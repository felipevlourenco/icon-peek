import { statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { aliasBases } from './alias';
import { readText } from './cache';
import { fontGlyph } from './font';
import {
  bootstrapIcon, fontAwesomeIcon, libraryIcon, loadSvg, materialIcon, type Found,
} from './libs';
import { attrValue, bindTag, findTagAt, parseImports, parseMarkup, type Binding, type SvgNode, type Tag } from './parse';
import { renderPreview } from './svg';

export interface Config {
  previewSize: number;
  iconComponentPatterns: Record<string, string[]>; // component -> props that carry the icon name
  nameToFolder: Record<string, string>; // `Component` | `Component.prop` -> folder of <name>.svg
  maxSvgBytes: number;
}
export interface Request {
  text: string; // full document text
  offset: number; // cursor offset in text
  file: string; // absolute path of the document
  roots: string[]; // workspace folder paths
  config: Config;
}
export interface Resolved {
  svg: string; // ready-to-embed preview (sanitized, themed, in a chip)
  name: string;
  source: string; // package or workspace-relative path
  range: [number, number]; // offsets of the tag that was hovered
}

const COMPONENT_MAX = 1_000_000;
const CODE_EXT = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.vue', '.svelte', '.astro'];
const SAFE_NAME = /^\w[\w./-]*$/;

interface Ctx {
  file: string;
  roots: string[]; // ordered: the root containing `file` first
  max: number;
}

/** Nothing resolvable with confidence -> null. Never throws. */
export function resolveIcon(req: Request): Resolved | null {
  try {
    const tag = findTagAt(req.text, req.offset);
    if (!tag) return null;
    const roots = [...req.roots.filter((r) => inside(req.file, r)), ...req.roots.filter((r) => !inside(req.file, r))];
    const found = locate(tag, req, { file: req.file, roots, max: req.config.maxSvgBytes });
    if (!found) return null;
    const svg = renderPreview(found.node, req.config.previewSize, req.config.maxSvgBytes);
    return svg ? { svg, name: found.name, source: found.source, range: [tag.start, tag.end] } : null;
  } catch {
    return null;
  }
}

function inside(file: string, root: string): boolean {
  const r = relative(root, file);
  return !r.startsWith('..') && !isAbsolute(r);
}

function rel(file: string, c: Ctx): string {
  const root = c.roots.find((r) => inside(file, r));
  return root ? relative(root, file) : file;
}

function locate(tag: Tag, req: Request, c: Ctx): Found | null {
  const imports = parseImports(req.text);
  switch (tag.name) {
    case 'svg': {
      const node = parseMarkup(req.text, tag.start, true);
      return node && { node, name: 'inline svg', source: rel(req.file, c) };
    }
    case 'use':
      return spriteIcon(tag, c);
    case 'img':
      return imgIcon(tag, imports, c);
  }
  const cls = attrValue(tag, 'class') ?? attrValue(tag, 'className');
  if (cls) {
    const f = fontIcon(tag, cls, req.text, c);
    if (f) return f;
  }
  const props = req.config.iconComponentPatterns[tag.name];
  if (props) {
    const f = customIcon(tag, props, imports, req, c);
    if (f) return f;
  }
  const b = bindTag(tag.name, imports);
  return b && fromBinding(b, req.file, c);
}

// ---------------------------------------------------------------- files

/** Resolve an asset path written in source: relative to the file, else workspace root, else public/. */
function resolveAsset(spec: string, fromFile: string, c: Ctx, exts = ['.svg']): string | null {
  const clean = spec.replace(/[?#][^/]*$/, '');
  if (!exts.includes(extname(clean).toLowerCase())) return null;
  const cands: string[] = [];
  if (clean.startsWith('.')) cands.push(resolve(dirname(fromFile), clean));
  else if (clean.startsWith('/')) for (const r of c.roots) cands.push(join(r, 'public', clean), join(r, clean));
  else {
    cands.push(...aliasBases(clean, fromFile), resolve(dirname(fromFile), clean));
    for (const r of c.roots) cands.push(join(r, clean), join(r, 'public', clean));
  }
  return cands.find(isFile) ?? null;
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function svgFile(file: string | null, c: Ctx, name?: string): Found | null {
  const node = file && loadSvg(file, c.max);
  return node ? { node, name: name ?? basename(file!, '.svg'), source: rel(file!, c) } : null;
}

// ---------------------------------------------------------------- bindings: `<X />` where X is imported

function fromBinding(b: { source: string; imported: string }, fromFile: string, c: Ctx): Found | null {
  if (/\.svg(?:[?#].*)?$/i.test(b.source)) return svgFile(resolveAsset(b.source, fromFile, c), c); // ./x.svg, ?react, ?url, {ReactComponent}
  return libraryIcon(b.source, b.imported, fromFile, c.roots, c.max);
}

// ---------------------------------------------------------------- <img> and <use>

function imgIcon(tag: Tag, imports: Binding[], c: Ctx): Found | null {
  const src = tag.attrs.find((a) => a.name === 'src');
  let spec = src?.value ?? null;
  if (spec === null && src?.expr && /^[\w$]+$/.test(src.expr)) spec = imports.find((b) => b.local === src.expr)?.source ?? null; // src={logoUrl}
  return spec && /\.svg(?:[?#].*)?$/i.test(spec) ? svgFile(resolveAsset(spec, c.file, c), c) : null;
}

function findById(n: SvgNode, id: string): SvgNode | null {
  if (n.attrs.id === id) return n;
  for (const k of n.children) if (typeof k !== 'string') {
    const f = findById(k, id);
    if (f) return f;
  }
  return null;
}

function spriteIcon(tag: Tag, c: Ctx): Found | null {
  const href = attrValue(tag, 'href') ?? attrValue(tag, 'xlink:href') ?? attrValue(tag, 'xlinkHref');
  const hash = href?.indexOf('#') ?? -1;
  if (!href || hash <= 0) return null; // `#id` alone points inside the same document: not handled
  const file = resolveAsset(href.slice(0, hash), c.file, c);
  const sprite = file && loadSvg(file, c.max);
  const el = sprite && findById(sprite, href.slice(hash + 1));
  if (!sprite || !el) return null;
  const isBox = el.tag === 'symbol' || el.tag === 'svg';
  const viewBox = isBox ? el.attrs.viewBox ?? sprite.attrs.viewBox : sprite.attrs.viewBox;
  if (!viewBox) return null;
  const defs = sprite.children.filter((k): k is SvgNode => typeof k !== 'string' && k.tag === 'defs');
  // a <symbol>'s own fill/stroke/... apply to its content, so they travel with it
  const { id: _id, x: _x, y: _y, width: _w, height: _h, ...own } = el.attrs;
  const node: SvgNode = { tag: 'svg', attrs: isBox ? { ...own, viewBox } : { viewBox }, children: [...defs, ...(isBox ? el.children : [el])] };
  return { node, name: el.attrs.id, source: rel(file!, c) };
}

// ---------------------------------------------------------------- icon fonts

const FA_STYLES: Record<string, string> = { 'fa-solid': 'solid', fas: 'solid', fa: 'solid', 'fa-regular': 'regular', far: 'regular', 'fa-brands': 'brands', fab: 'brands' };
const FA_NOT_ICON = /^fa-(?:solid|regular|brands|light|thin|duotone|sharp|classic|lg|xs|sm|xl|2xs|2xl|\d+x|fw|ul|li|spin|spin-pulse|spin-reverse|pulse|beat|beat-fade|bounce|fade|flip|flip-horizontal|flip-vertical|flip-both|rotate-\d+|rotate-by|border|inverse|pull-left|pull-right|stack|stack-1x|stack-2x|swap-opacity|width-auto)$/;
const MATERIAL_VARIANT: Record<string, string> = { '': '', outlined: 'Outlined', round: 'Rounded', sharp: 'Sharp', 'two-tone': 'TwoTone' };

function fontIcon(tag: Tag, cls: string, text: string, c: Ctx): Found | null {
  const t = cls.split(/\s+/).filter(Boolean);
  const faStyles = new Set(t.filter((x) => x in FA_STYLES).map((x) => FA_STYLES[x]));
  const faNames = t.filter((x) => /^fa-[a-z0-9-]+$/.test(x) && !FA_NOT_ICON.test(x));
  if (faStyles.size === 1 && faNames.length === 1) {
    return fontAwesomeIcon(c.file, c.roots, [...faStyles][0], faNames[0].slice(3), c.max);
  }
  const bi = t.filter((x) => /^bi-[a-z0-9-]+$/.test(x));
  if (t.includes('bi') && bi.length === 1) return bootstrapIcon(c.file, c.roots, bi[0].slice(3), c.max);
  const mat = t.map((x) => /^material-icons(?:-(outlined|round|sharp|two-tone))?$/.exec(x)).filter((m) => m);
  if (mat.length === 1) {
    const lt = text.indexOf('<', tag.end);
    const ligature = text.slice(tag.end, lt < 0 ? undefined : lt).trim(); // <span class="material-icons">search</span>
    return materialIcon(c.file, c.roots, ligature, MATERIAL_VARIANT[mat[0]![1] ?? ''], c.max);
  }
  return null;
}

// ---------------------------------------------------------------- the project's own <Icon name="..." />

function customIcon(tag: Tag, props: string[], imports: Binding[], req: Request, c: Ctx): Found | null {
  for (const prop of props) {
    const value = attrValue(tag, prop);
    if (!value || !SAFE_NAME.test(value) || value.includes('..')) continue; // dynamic or odd -> unknown
    const comp = componentSource(tag.name, imports, req, c);
    if (comp) {
      const f = fromComponent(comp.text, comp.file, value, c);
      if (f) return f;
    }
    const dir = req.config.nameToFolder[`${tag.name}.${prop}`] ?? req.config.nameToFolder[tag.name];
    if (dir) {
      const f = svgInDir(dir, value, c);
      if (f) return f;
    }
  }
  return null;
}

/** Source text of the file that defines the component: follow a relative import, or this very file. */
function componentSource(name: string, imports: Binding[], req: Request, c: Ctx): { file: string; text: string } | null {
  const b = imports.find((x) => x.local === name);
  if (!b) return new RegExp(`\\b(?:function|const|class)\\s+${name}\\b`).test(req.text) ? { file: req.file, text: req.text } : null;
  // relative, or an alias from tsconfig/jsconfig; anything else comes from node_modules: not our component
  const spec = b.source.replace(/[?#][^/]*$/, '');
  const bases = spec.startsWith('.') ? [resolve(dirname(req.file), spec)] : aliasBases(spec, req.file);
  const file = bases.flatMap((base) => [base, ...CODE_EXT.map((e) => base + e), ...CODE_EXT.map((e) => join(base, 'index' + e))]).find(isFile);
  const text = file && extname(file) !== '' ? readText(file, COMPONENT_MAX) : null;
  return text ? { file: file!, text } : null;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Statically find what `name` maps to inside the component source: object map, switch/case, or a path template. */
function fromComponent(src: string, file: string, name: string, c: Ctx): Found | null {
  const imports = parseImports(src);
  // value after `name:` / `case 'name':` -> `Ident`, `<Ident`, `() => <Ident`, or a quoted string
  const V = String.raw`(?:\(\s*\)\s*=>\s*)?\(?\s*(?:(<)?\s*([A-Za-z_$][\w$.]*)|'([^'\n]*)'|"([^"\n]*)"|(0[xX][\da-fA-F]+|\d+))`;
  const keys = [
    new RegExp(String.raw`(?:^|[\s,{(])['"]?${esc(name)}['"]?\s*:\s*${V}`, 'g'),
    new RegExp(String.raw`\bcase\s+['"]${esc(name)}['"]\s*:\s*(?:return\s*)?${V}`, 'g'),
  ];
  for (const re of keys) {
    for (const m of src.matchAll(re)) {
      const [, lt, ident, s1, s2, num] = m;
      const str = s1 ?? s2;
      let f: Found | null = null;
      if (lt && ident === 'svg') {
        const at = m.index + m[0].lastIndexOf('<');
        const node = parseMarkup(src, at, true);
        f = node && { node, name, source: rel(file, c) };
      } else if (ident) {
        const b = bindTag(ident, imports);
        f = b && fromBinding(b, file, c);
      } else if (str) {
        if (/^\s*<svg[\s>]/.test(str)) {
          const node = parseMarkup(str, str.indexOf('<'), false);
          f = node && { node, name, source: rel(file, c) };
        } else if (/\.svg$/i.test(str)) f = svgFile(resolveAsset(str, file, c), c, name);
        else f = glyphIcon(str, src, imports, file, name, c);
      } else if (num) f = glyphIcon(Number(num), src, imports, file, name, c);
      if (f) return f;
    }
  }
  // `{ "name": 59648 }` glyph maps kept in a json file next to the font
  for (const b of imports) {
    if (!/\.json(?:[?#].*)?$/i.test(b.source)) continue;
    const jf = resolveAsset(b.source, file, c, ['.json']);
    const text = jf && readText(jf, 500_000);
    let val: unknown;
    try {
      val = text ? (JSON.parse(text) as Record<string, unknown>)[name] : undefined;
    } catch {
      continue;
    }
    const f = typeof val === 'string' || typeof val === 'number' ? glyphIcon(val, src, imports, file, name, c) : null;
    if (f) return f;
  }
  // folder of svgs named after the prop: `./icons/${name}.svg`, './icons/' + name + '.svg', import.meta.glob('./icons/*.svg')
  const t1 = /([`'"])([^`'"$\n]*)\$\{[^}]*\}([^`'"$\n]*\.svg)(?:\?[^`'"\n]*)?\1/.exec(src);
  const t2 = /(['"])([^'"\n]*)\1\s*\+\s*[\w$.]+\s*\+\s*(['"])([^'"\n]*\.svg)\3/.exec(src);
  const t3 = /glob\(\s*([`'"])([^`'"*\n]*)\*[^`'"\n]*(\.svg)['"`]/.exec(src);
  const [prefix, suffix] = t1 ? [t1[2], t1[3]] : t2 ? [t2[2], t2[4]] : t3 ? [t3[2], t3[3]] : [];
  if (prefix !== undefined && suffix) {
    const f = svgFile(resolveAsset(prefix + name + suffix, file, c), c, name);
    if (f) return f;
  }
  return null;
}

function svgInDir(dir: string, name: string, c: Ctx): Found | null {
  const file = name.toLowerCase().endsWith('.svg') ? name : `${name}.svg`;
  const dirs = isAbsolute(dir) ? [dir] : c.roots.map((r) => join(r, dir));
  for (const d of dirs) {
    const f = svgFile(isFile(join(d, file)) ? join(d, file) : null, c, name);
    if (f) return f;
  }
  return null;
}

// ---------------------------------------------------------------- icon fonts defined by the project (createIconSet + .ttf)

/** The one .ttf/.otf the component imports (or the one passed as createIconSet's 3rd argument). */
function fontFile(src: string, imports: Binding[], file: string, c: Ctx): string | null {
  let fonts = imports.filter((b) => /\.(?:ttf|otf)(?:[?#].*)?$/i.test(b.source));
  if (fonts.length > 1) {
    const arg = /createIconSet\w*\(\s*[^,]+,\s*[^,]+,\s*([A-Za-z_$][\w$]*)/.exec(src)?.[1];
    fonts = fonts.filter((b) => b.local === arg);
  }
  return fonts.length === 1 ? resolveAsset(fonts[0].source, file, c, ['.ttf', '.otf']) : null;
}

/** Glyph map value (a character, `\ue900`, or a code point number) -> the glyph drawn from the component's font. */
function glyphIcon(value: string | number, src: string, imports: Binding[], file: string, name: string, c: Ctx): Found | null {
  let cp: number | undefined;
  if (typeof value === 'number') cp = value;
  else {
    const decoded = value
      .replace(/\\u\{([\da-fA-F]+)\}/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/\\u([\da-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\x([\da-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
    const chars = Array.from(decoded);
    cp = chars.length === 1 ? chars[0].codePointAt(0) : undefined; // 'A1' would be a ligature: not drawn
  }
  const font = cp === undefined ? null : fontFile(src, imports, file, c);
  const node = font && fontGlyph(font, cp!);
  return node ? { node, name, source: rel(font!, c) } : null;
}
