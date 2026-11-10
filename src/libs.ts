// Icon-library readers. Each one finds the installed package by walking node_modules and
// extracts icon data from the SOURCE TEXT of the package files. Nothing is require()d or evaluated.
// Layouts verified against: lucide-react 1.71.0, react-icons 5.7.0, @heroicons/react 2.2.0,
// @mui/icons-material 9.5.0, @fortawesome/fontawesome-free 7.3.1, bootstrap-icons 1.13.2.
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cached, readText } from './cache';
import { fontGlyph } from './font';
import { parseJs, parseSvgDocument, type SvgNode } from './parse';
import { mkNode } from './svg';

export interface Found {
  node: SvgNode;
  name: string;
  source: string;
}

const PACK_MAX = 16 * 1024 * 1024; // react-icons packs are 1-7 MB single files
const isFile = (p: string) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};
const IDENT = /^[A-Za-z_$][\w$]*$/;

export function findPackage(fromFile: string, pkg: string, roots: string[]): string | null {
  const starts = [dirname(fromFile), ...roots];
  for (const start of starts) {
    for (let d = start; ; d = dirname(d)) {
      const p = join(d, 'node_modules', pkg);
      if (isFile(join(p, 'package.json'))) return p;
      if (dirname(d) === d) break;
    }
  }
  return null;
}

export function loadSvg(file: string, maxBytes: number): SvgNode | null {
  return cached(file, `svg:${maxBytes}`, () => {
    const t = readText(file, maxBytes);
    return t ? parseSvgDocument(t) : null;
  });
}

/** `spec` is the import specifier, `imported` the export name ('default' for default imports). */
export function libraryIcon(spec: string, imported: string, fromFile: string, roots: string[], maxBytes: number): Found | null {
  const m = /^(@[^/]+\/[^/]+|[^/@][^/]*)(?:\/(.+))?$/.exec(spec);
  if (!m) return null;
  const [, pkg, sub = ''] = m;
  const dir = ['lucide-react', 'react-icons', '@heroicons/react', '@mui/icons-material'].includes(pkg) ? findPackage(fromFile, pkg, roots) : null;
  if (!dir) return null;
  switch (pkg) {
    case 'lucide-react':
      return !sub && IDENT.test(imported) ? lucide(dir, imported, maxBytes) : null;
    case 'react-icons':
      return /^[a-z0-9]+$/.test(sub) && IDENT.test(imported) ? reactIcons(dir, sub, imported) : null;
    case '@heroicons/react': {
      // `@heroicons/react/24/outline` + named import, or `@heroicons/react/24/outline/Name` + default import
      const h = /^(\d+\/(?:outline|solid))(?:\/([A-Za-z0-9]+))?$/.exec(sub);
      const name = h?.[2] ?? imported;
      return h && /^[A-Za-z0-9]+$/.test(name) ? heroicon(dir, h[1], name, maxBytes) : null;
    }
    default: {
      // `@mui/icons-material` + named import, or `@mui/icons-material/Name` + default import
      const base = sub || imported;
      return mui(dir, base, maxBytes);
    }
  }
}

// ---------------------------------------------------------------- lucide-react

function lucide(dir: string, name: string, maxBytes: number): Found | null {
  const index = join(dir, 'dist/esm/lucide-react.mjs');
  return cached(index, `lucide:${name}`, () => {
    const t = readText(index, PACK_MAX);
    if (!t) return null;
    // e.g.  export { default as Home, default as HomeIcon, default as House } from './icons/house.mjs';
    const hit = new RegExp(`\\bdefault as ${name}(?=[,\\s}])`).exec(t);
    if (!hit) return null;
    const line = t.slice(t.lastIndexOf('\n', hit.index) + 1, t.indexOf('\n', hit.index));
    const file = /from '\.\/icons\/([\w-]+)\.mjs'/.exec(line)?.[1];
    const src = file && readText(join(dir, 'dist/esm/icons', `${file}.mjs`), maxBytes);
    const at = src ? src.indexOf('__iconData = ') : -1;
    if (!src || at < 0) return null;
    const d = parseJs(src, at + '__iconData = '.length).value;
    const kids = (list: unknown[]): SvgNode[] =>
      list.map((n) => {
        const [tag, attrs, children] = n as [string, Record<string, unknown>, unknown[]?];
        return mkNode(tag, attrs, children ? kids(children) : []);
      });
    const size = d.size ?? 24;
    // root attrs = lucide's defaultAttributes (shared/src/build/defaultAttributes.mjs)
    const root = mkNode('svg', { viewBox: `0 0 ${size} ${size}`, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, kids(d.node));
    return { node: root, name: d.name ?? name, source: 'lucide-react' };
  });
}

// ---------------------------------------------------------------- react-icons

function reactIcons(dir: string, pack: string, name: string): Found | null {
  const file = ['index.mjs', 'index.js'].map((f) => join(dir, pack, f)).find(isFile);
  if (!file) return null;
  return cached(file, `ri:${name}`, () => {
    const t = readText(file, PACK_MAX);
    // esm: `export function FaHome (props) {`   cjs: `module.exports.FaHome = function FaHome (props) {`
    const at = t ? t.indexOf(`function ${name} (props)`) : -1;
    const g = t && at >= 0 ? t.indexOf('GenIcon(', at) : -1;
    if (!t || g < 0 || g - at > 200) return null;
    type Tree = { tag: string; attr: Record<string, unknown>; child: Tree[] };
    const conv = (n: Tree): SvgNode => mkNode(n.tag, n.attr, n.child.map(conv));
    const root = conv(parseJs(t, g + 'GenIcon('.length).value);
    // IconBase (lib/iconBase.mjs) defaults, overridden by the icon's own attrs
    root.attrs = { stroke: 'currentColor', fill: 'currentColor', 'stroke-width': '0', ...root.attrs };
    return { node: root, name, source: `react-icons/${pack}` };
  });
}

// ---------------------------------------------------------------- @heroicons/react

const HERO_SHAPES = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);

function heroicon(dir: string, folder: string, name: string, maxBytes: number): Found | null {
  const file = join(dir, folder, `${name}.js`);
  return cached(file, 'hero', () => {
    const t = readText(file, maxBytes);
    if (!t) return null;
    // React.createElement("svg", Object.assign({...}, props), title ? ... : null, React.createElement("path", {...}))
    const re = /createElement\("(\w+)",\s*(?:Object\.assign\()?(\{)/g;
    let svg: SvgNode | null = null;
    const kids: SvgNode[] = [];
    for (const m of t.matchAll(re)) {
      const tag = m[1];
      if (tag === 'title') continue;
      const attrs = parseJs(t, m.index + m[0].length - 1).value;
      if (tag === 'svg') svg = mkNode('svg', attrs); // `ref: svgRef` etc. are identifiers -> dropped by mkNode
      else if (HERO_SHAPES.has(tag)) kids.push(mkNode(tag, attrs));
      else return null; // nested/unknown structure: do not guess
    }
    if (!svg || !kids.length) return null;
    svg.children = kids;
    return { node: svg, name, source: `@heroicons/react/${folder}` };
  });
}

// ---------------------------------------------------------------- @mui/icons-material

const MUI_TAGS = new Set(['path', 'circle', 'rect', 'g', 'ellipse', 'line', 'polygon', 'polyline']);

function mui(dir: string, base: string, maxBytes: number): Found | null {
  if (!/^(?:esm\/)?[A-Za-z0-9]+$/.test(base)) return null;
  const file = ['.mjs', '.js'].map((e) => join(dir, base + e)).find(isFile);
  if (!file) return null;
  return cached(file, 'mui', () => {
    const t = readText(file, maxBytes);
    // esm: createSvgIcon(_jsx("path", {...}), 'Search')   cjs: (0, _createSvgIcon.default)((0, _jsxRuntime.jsx)("path", {...}), 'Search')
    const m = t && /(?:\(0,\s*_createSvgIcon\.default\)|createSvgIcon)\(/.exec(t);
    if (!t || !m) return null;
    const call = parseJs(t, m.index).value;
    const els = (v: unknown): SvgNode[] => {
      if (Array.isArray(v)) return v.flatMap(els);
      const e = v as { call?: string; args?: [unknown, Record<string, unknown>?] };
      if (!e?.call || !/jsx/i.test(e.call) || !e.args) throw new Error('unexpected mui icon shape');
      const [tag, props = {}] = e.args;
      const { children, ...attrs } = props;
      const kids = children === undefined ? [] : els(children);
      if (typeof tag !== 'string') return kids; // Fragment
      if (!MUI_TAGS.has(tag)) throw new Error(`unexpected tag ${tag}`);
      return [mkNode(tag, attrs, kids)];
    };
    // SvgIcon defaults: viewBox 0 0 24 24, fill currentColor
    const root = mkNode('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, els(call.args[0]));
    return { node: root, name: String(call.args[1] ?? base), source: '@mui/icons-material' };
  });
}

// ---------------------------------------------------------------- icon fonts (via their SVG sources)

export function fontAwesomeIcon(fromFile: string, roots: string[], style: string, name: string, maxBytes: number): Found | null {
  const dir = /^[a-z0-9-]+$/.test(name) ? findPackage(fromFile, '@fortawesome/fontawesome-free', roots) : null;
  const node = dir && loadSvg(join(dir, 'svgs', style, `${name}.svg`), maxBytes);
  return node ? { node, name: `fa-${name}`, source: `@fortawesome/fontawesome-free/${style}` } : null;
}

export function bootstrapIcon(fromFile: string, roots: string[], name: string, maxBytes: number): Found | null {
  const dir = /^[a-z0-9-]+$/.test(name) ? findPackage(fromFile, 'bootstrap-icons', roots) : null;
  const node = dir && loadSvg(join(dir, 'icons', `${name}.svg`), maxBytes);
  return node ? { node, name: `bi-${name}`, source: 'bootstrap-icons' } : null;
}

/** Material Icons ligature (`search`, class `material-icons-outlined`) -> same glyph shipped in @mui/icons-material. */
export function materialIcon(fromFile: string, roots: string[], ligature: string, variant: string, maxBytes: number): Found | null {
  if (!/^[a-z][a-z0-9_]*$/.test(ligature)) return null;
  const dir = findPackage(fromFile, '@mui/icons-material', roots);
  const pascal = ligature.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  const f = dir && mui(dir, pascal + variant, maxBytes);
  return f ? { ...f, name: ligature } : null;
}

// ---------------------------------------------------------------- icon-font sets: @expo/vector-icons, react-native-vector-icons
// <MaterialIcons name="add-a-photo" />: glyphmaps/<Set>.json maps the name to a code point, the .ttf next to it draws it.
// Layouts verified against @expo/vector-icons 15.1.1, react-native-vector-icons 10.3.0, @react-native-vector-icons/{material-icons,fontawesome5} 14.0.0.

const VI_SPEC = /^(?:(@expo\/vector-icons|react-native-vector-icons)|@react-native-vector-icons\/([a-z0-9-]+))(?:\/([A-Za-z0-9]+))?$/;
export const isVectorIcons = (spec: string) => VI_SPEC.test(spec);
const FA_FONT: Record<string, string> = { solid: 'Solid', regular: 'Regular', brand: 'Brands' };

/**
 * `style` is the FontAwesome weight prop (solid | regular | brand | light) when written on the tag.
 * Like the library, FontAwesome falls back to the first weight that has the glyph when the asked one doesn't.
 */
export function vectorIcon(spec: string, imported: string, name: string, style: string | null, fromFile: string, roots: string[]): Found | null {
  const m = VI_SPEC.exec(spec);
  if (!m) return null;
  const [, pkg = `@react-native-vector-icons/${m[2]}`, slug, sub] = m;
  const dir = findPackage(fromFile, pkg, roots);
  if (!dir) return null;
  const [maps, fonts] = slug ? ['glyphmaps', 'fonts'] : pkg === '@expo/vector-icons' ? ['build/vendor/react-native-vector-icons/glyphmaps', 'build/vendor/react-native-vector-icons/Fonts'] : ['glyphmaps', 'Fonts'];
  // set: `@expo/vector-icons` + named import, `<pkg>/Set` + default import, or the one set of a per-family package
  let set = slug ? undefined : sub ?? imported;
  if (slug) {
    try {
      set = readdirSync(join(dir, maps)).map((f) => f.replace(/\.json$/, '')).find((f) => f.toLowerCase() === slug.replace(/-/g, ''));
    } catch {
      return null;
    }
  }
  if (!set || !/^[A-Za-z0-9]+$/.test(set)) return null;
  const json = (file: string) => {
    const t = isFile(file) ? readText(file, 5_000_000) : null;
    try {
      return t ? (JSON.parse(t) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const glyphs = [`${set}Free.json`, `${set}.json`].map((f) => json(join(dir, maps, f))).find((x) => x);
  const code = glyphs?.[name];
  if (typeof code !== 'number') return null;
  // FontAwesome sets have one font per weight and a *_meta.json listing which weight has which glyph
  const meta = [`${set}Free_meta.json`, `${set}_meta.json`].map((f) => json(join(dir, maps, f))).find((x) => x) as Record<string, string[]> | undefined;
  let font = `${set}.ttf`;
  if (meta) {
    const fam = (k: string) => (k === 'brands' ? 'brand' : k);
    const want = style === 'light' ? 'regular' : style ?? 'regular';
    const has = (k: string) => meta[k === 'brand' ? (meta.brands ? 'brands' : 'brand') : k]?.includes(name);
    const weight = has(want) ? want : Object.keys(meta).map(fam).find(has);
    if (!weight || !FA_FONT[weight]) return null;
    font = `${set}_${FA_FONT[weight]}.ttf`;
  }
  const file = join(dir, fonts, font);
  const node = isFile(file) ? fontGlyph(file, code) : null;
  return node ? { node, name, source: `${pkg}/${set}` } : null;
}
