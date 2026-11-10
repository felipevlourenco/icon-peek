import { utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cacheSize, clearCache } from '../src/cache';
import { hover, workspace } from './helpers';

const pkg = (name: string) => JSON.stringify({ name, version: '1.0.0' });
const svgFile = (d: string, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"${extra}><path d="${d}"/></svg>`;

// Library files below mirror the real layouts inspected in fixtures/node_modules (see src/libs.ts header).
const files: Record<string, string> = {
  // --- lucide-react 1.x: name -> ./icons/<kebab>.mjs, icon data is a literal in the file
  'node_modules/lucide-react/package.json': pkg('lucide-react'),
  'node_modules/lucide-react/dist/esm/lucide-react.mjs': [
    `export { default as Home, default as HomeIcon, default as House } from './icons/house.mjs';`,
    `export { default as LucideSearch, default as Search, default as SearchIcon } from './icons/search.mjs';`,
  ].join('\n'),
  'node_modules/lucide-react/dist/esm/icons/search.mjs': `import createLucideIcon from '../createLucideIcon.mjs';

const __iconData = {
  name: "search",
  size: 24,
  node: [
    ["path", { d: "m21 21-4.34-4.34", key: "14j7rj" }],
    ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }]
  ]
};
__iconData.node;
const Search = createLucideIcon(__iconData);

export { __iconData, Search as default };`,
  'node_modules/lucide-react/dist/esm/icons/house.mjs': `const __iconData = { name: "house", size: 24, node: [["path", { d: "M15 21v-8", key: "a" }]], aliases: ["home"] };
export { __iconData, House as default };`,

  // --- react-icons 5.x: one big file per pack, strict-JSON tree inside GenIcon(...)
  'node_modules/react-icons/package.json': pkg('react-icons'),
  'node_modules/react-icons/fa/index.mjs': `// THIS FILE IS AUTO GENERATED
import { GenIcon } from '../lib/index.mjs';
export function FaHomeLg (props) {
  return GenIcon({"tag":"svg","attr":{"viewBox":"0 0 512 512"},"child":[{"tag":"path","attr":{"d":"M1 1LG"},"child":[]}]})(props);
};
export function FaHome (props) {
  return GenIcon({"tag":"svg","attr":{"viewBox":"0 0 576 512"},"child":[{"tag":"path","attr":{"d":"M280 148z","fillRule":"evenodd"},"child":[]}]})(props);
};
`,
  'node_modules/react-icons/fi/index.mjs': `export function FiSearch (props) {
  return GenIcon({"tag":"svg","attr":{"viewBox":"0 0 24 24","fill":"none","stroke":"currentColor","strokeWidth":"2","strokeLinecap":"round"},"child":[{"tag":"circle","attr":{"cx":"11","cy":"11","r":"8"},"child":[]}]})(props);
};
`,

  // --- @heroicons/react 2.x: <size>/<style>/<Name>.js with React.createElement literals
  'node_modules/@heroicons/react/package.json': pkg('@heroicons/react'),
  'node_modules/@heroicons/react/24/outline/MagnifyingGlassIcon.js': `const React = require("react");
function MagnifyingGlassIcon({
  title,
  titleId,
  ...props
}, svgRef) {
  return /*#__PURE__*/React.createElement("svg", Object.assign({
    xmlns: "http://www.w3.org/2000/svg",
    fill: "none",
    viewBox: "0 0 24 24",
    strokeWidth: 1.5,
    stroke: "currentColor",
    "aria-hidden": "true",
    "data-slot": "icon",
    ref: svgRef,
    "aria-labelledby": titleId
  }, props), title ? /*#__PURE__*/React.createElement("title", {
    id: titleId
  }, title) : null, /*#__PURE__*/React.createElement("path", {
    strokeLinecap: "round",
    strokeLinejoin: "round",
    d: "m21 21-5.197-5.197"
  }));
}
const ForwardRef = /*#__PURE__*/ React.forwardRef(MagnifyingGlassIcon);
module.exports = ForwardRef;`,

  // --- @mui/icons-material 9.x: <Name>.mjs at the package root
  'node_modules/@mui/icons-material/package.json': pkg('@mui/icons-material'),
  'node_modules/@mui/icons-material/Search.mjs': `"use client";

import createSvgIcon from "./utils/createSvgIcon.mjs";
import { jsx as _jsx } from "react/jsx-runtime";
export default createSvgIcon(/*#__PURE__*/_jsx("path", {
  d: "M15.5 14h-.79"
}), 'Search');
`,
  'node_modules/@mui/icons-material/AdminPanelSettingsOutlined.mjs': `"use client";

import createSvgIcon from "./utils/createSvgIcon.mjs";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default createSvgIcon(/*#__PURE__*/_jsxs("g", {
  fillRule: "evenodd",
  children: [/*#__PURE__*/_jsx("circle", {
    cx: "17",
    cy: "15.5",
    r: "1.12"
  }), /*#__PURE__*/_jsx("path", {
    d: "M17 17.5c-.73"
  })]
}), 'AdminPanelSettingsOutlined');`,
  'node_modules/@mui/icons-material/SearchOutlined.mjs': `import createSvgIcon from "./utils/createSvgIcon.mjs";
import { jsx as _jsx } from "react/jsx-runtime";
export default createSvgIcon(/*#__PURE__*/_jsx("path", { d: "M1 OUTLINED" }), 'SearchOutlined');`,
  'node_modules/@mui/icons-material/Legacy.js': `"use strict";
var _createSvgIcon = _interopRequireDefault(require("./utils/createSvgIcon"));
var _jsxRuntime = require("react/jsx-runtime");
var _default = exports.default = (0, _createSvgIcon.default)(/*#__PURE__*/(0, _jsxRuntime.jsx)("path", {
  d: "M1 CJS"
}), 'Legacy');`,

  // --- icon fonts' svg sources
  'node_modules/@fortawesome/fontawesome-free/package.json': pkg('@fortawesome/fontawesome-free'),
  'node_modules/@fortawesome/fontawesome-free/svgs/solid/house.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free --><path fill="currentColor" d="M277 8z"/></svg>`,
  'node_modules/@fortawesome/fontawesome-free/svgs/brands/github.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path fill="currentColor" d="M165 GH"/></svg>`,
  'node_modules/bootstrap-icons/package.json': pkg('bootstrap-icons'),
  'node_modules/bootstrap-icons/icons/house.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-house" viewBox="0 0 16 16">\n  <path d="M8.707 BI"/>\n</svg>`,

  // --- workspace files
  'public/logo.svg': svgFile('M0 0 PUBLIC'),
  'src/assets/star.svg': svgFile('M1 1 STAR'),
  'src/assets/bell.svg': svgFile('M2 2 BELL'),
  'src/assets/home.svg': svgFile('M3 3 HOME'),
  'src/assets/sprite.svg': `<svg xmlns="http://www.w3.org/2000/svg" style="display:none"><symbol id="bell" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5 SPRITE"/></symbol></svg>`,
  'src/assets/big.svg': svgFile('M0 0 ' + 'x'.repeat(2000)),

  // --- the project's own icon components
  'src/components/Icon.tsx': `import { Search } from 'lucide-react';
import StarSvg from '../assets/star.svg?react';
const icons = {
  search: Search,
  'star-icon': StarSvg,
  raw: '<svg viewBox="0 0 8 8"><path d="M0 0 RAWSTRING"/></svg>',
};
export default function Icon({ name }) { const C = icons[name]; return <C />; }
`,
  'src/components/SwitchIcon.tsx': `import BellSvg from '../assets/bell.svg?react';
export function SwitchIcon({ name }) {
  switch (name) {
    case 'bell':
      return <BellSvg />;
    case 'flash':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 FLASH" /></svg>
      );
    default:
      return null;
  }
}
`,
  'src/components/FolderIcon.tsx': 'export default function FolderIcon({ name }) { return <img src={`../assets/${name}.svg`} />; }\n',
  'src/components/GlobIcon.tsx': "const all = import.meta.glob('../assets/*.svg');\nexport default function GlobIcon({ name }) { return null; }\n",
  'src/components/Opaque.tsx': 'export default function Opaque({ name }) { return lookup(name); }\n',
};

const ws = workspace(files);
afterAll(ws.cleanup);
const h = (file: string, text: string, needle: string, delta = 2, config = {}) => hover(ws.root, file, text, needle, delta, config);

describe('local .svg files', () => {
  it('default import with ?react used as <X />', () => {
    const r = h('src/App.tsx', `import StarIcon from './assets/star.svg?react';\n<StarIcon />`, '<StarIcon');
    expect(r?.svg).toContain('STAR');
    expect(r?.name).toBe('star');
    expect(r?.source).toBe(join('src', 'assets', 'star.svg'));
  });

  it('plain import, ?url, and { ReactComponent } forms', () => {
    expect(h('src/App.tsx', `import S from './assets/star.svg';\n<S />`, '<S')?.svg).toContain('STAR');
    expect(h('src/App.tsx', `import { ReactComponent as B } from './assets/bell.svg';\n<B />`, '<B')?.svg).toContain('BELL');
    expect(h('src/App.tsx', `import url from './assets/star.svg?url';\n<img src={url} />`, '<img')?.svg).toContain('STAR');
  });

  it('<img src> relative to the file, absolute to public/, and bare', () => {
    expect(h('src/App.tsx', `<img src="./assets/star.svg" />`, '<img')?.svg).toContain('STAR');
    expect(h('src/App.tsx', `<img src="/logo.svg" />`, '<img')?.svg).toContain('PUBLIC');
    expect(h('src/App.html', `<img src="assets/bell.svg">`, '<img')?.svg).toContain('BELL');
  });

  it('<use href="sprite.svg#id"> resolves the symbol', () => {
    const r = h('src/App.tsx', `<use href="./assets/sprite.svg#bell" />`, '<use');
    expect(r?.svg).toContain('SPRITE');
    expect(r?.name).toBe('bell');
    // the symbol's own presentation attrs must survive (regression: icons rendered as black blobs)
    expect(r?.svg).toContain('fill="none"');
    expect(r?.svg).toContain('stroke="#2b2b2b"');
    expect(r?.svg).toContain('stroke-width="2"');
    expect(r?.svg).not.toContain('display:none');
    expect(h('src/App.tsx', `<use href="./assets/sprite.svg#missing" />`, '<use')).toBeNull();
    expect(h('src/App.tsx', `<use href="#local" />`, '<use')).toBeNull();
  });

  it('is unresolvable when the file is missing, not an svg, remote, or over maxSvgBytes', () => {
    expect(h('src/App.tsx', `import X from './assets/nope.svg';\n<X />`, '<X')).toBeNull();
    expect(h('src/App.tsx', `<img src="https://example.com/a.svg" />`, '<img')).toBeNull();
    expect(h('src/App.tsx', `<img src="./assets/star.png" />`, '<img')).toBeNull();
    // big.svg is ~2 KB: fine by default, skipped when the cap is below its size
    expect(h('src/App.tsx', `<img src="./assets/big.svg" />`, '<img')?.svg).toContain('xxxx');
    expect(h('src/App.tsx', `<img src="./assets/big.svg" />`, '<img', 2, { maxSvgBytes: 1024 })).toBeNull();
  });
});

describe('icon libraries (static parse of node_modules)', () => {
  it('lucide-react: named, aliased and namespace imports', () => {
    const src = `import { Search, House as Casa } from 'lucide-react';\nimport * as L from 'lucide-react';\n<Search />\n<Casa />\n<L.SearchIcon />`;
    const a = h('src/App.tsx', src, '<Search');
    expect(a?.svg).toContain('m21 21-4.34-4.34');
    expect(a?.svg).toContain('<circle');
    expect(a?.svg).toContain('stroke-width="2"'); // lucide defaults applied
    expect(a?.source).toBe('lucide-react');
    expect(h('src/App.tsx', src, '<Casa')?.svg).toContain('M15 21v-8');
    expect(h('src/App.tsx', src, '<L.SearchIcon')?.svg).toContain('m21 21');
    expect(h('src/App.tsx', `import { Nope } from 'lucide-react';\n<Nope />`, '<Nope')).toBeNull();
  });

  it('react-icons: per-pack subpath, exact name match, defaults + camelCase attrs', () => {
    const a = h('src/App.tsx', `import { FaHome, FaHomeLg } from 'react-icons/fa';\n<FaHome />\n<FaHomeLg />`, '<FaHome ');
    expect(a?.svg).toContain('M280 148z');
    expect(a?.svg).toContain('fill-rule="evenodd"');
    expect(a?.source).toBe('react-icons/fa');
    expect(h('src/App.tsx', `import { FaHome, FaHomeLg } from 'react-icons/fa';\n<FaHome />\n<FaHomeLg />`, '<FaHomeLg')?.svg).toContain('M1 1LG');
    const fi = h('src/App.tsx', `import { FiSearch } from 'react-icons/fi';\n<FiSearch />`, '<FiSearch');
    expect(fi?.svg).toContain('stroke-linecap="round"');
    expect(fi?.svg).toContain('fill="none"');
    expect(h('src/App.tsx', `import { FaNope } from 'react-icons/fa';\n<FaNope />`, '<FaNope')).toBeNull();
    expect(h('src/App.tsx', `import { X } from 'react-icons/zz';\n<X />`, '<X')).toBeNull(); // pack not installed
  });

  it('@heroicons/react: size/style subpath and deep default import', () => {
    const a = h('src/App.tsx', `import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';\n<MagnifyingGlassIcon className="h-6" />`, '<Magnifying');
    expect(a?.svg).toContain('m21 21-5.197-5.197');
    expect(a?.svg).toContain('stroke-width="1.5"');
    expect(a?.svg).not.toContain('aria-labelledby');
    expect(a?.source).toBe('@heroicons/react/24/outline');
    const b = h('src/App.tsx', `import Mag from '@heroicons/react/24/outline/MagnifyingGlassIcon';\n<Mag />`, '<Mag ');
    expect(b?.svg).toContain('m21 21-5.197-5.197');
    expect(h('src/App.tsx', `import { NopeIcon } from '@heroicons/react/24/solid';\n<NopeIcon />`, '<NopeIcon')).toBeNull();
  });

  it('@mui/icons-material: subpath default import, root named import, multi-element icons, .js fallback', () => {
    const sub = h('src/App.tsx', `import SearchIcon from '@mui/icons-material/Search';\n<SearchIcon />`, '<SearchIcon');
    expect(sub?.svg).toContain('M15.5 14h-.79');
    expect(sub?.source).toBe('@mui/icons-material');
    expect(h('src/App.tsx', `import { Search } from '@mui/icons-material';\n<Search />`, '<Search')?.svg).toContain('M15.5 14h-.79');
    const multi = h('src/App.tsx', `import { AdminPanelSettingsOutlined as A } from '@mui/icons-material';\n<A />`, '<A ');
    expect(multi?.svg).toContain('<g fill-rule="evenodd">');
    expect(multi?.svg).toContain('<circle');
    expect(multi?.svg).toContain('M17 17.5c-.73');
    expect(h('src/App.tsx', `import L from '@mui/icons-material/Legacy';\n<L />`, '<L ')?.svg).toContain('M1 CJS');
    expect(h('src/App.tsx', `import { Nope } from '@mui/icons-material';\n<Nope />`, '<Nope')).toBeNull();
  });

  it('finds packages by walking up node_modules from a nested file', () => {
    expect(h('src/deep/er/App.tsx', `import { Search } from 'lucide-react';\n<Search />`, '<Search')?.svg).toContain('m21 21');
  });

  it('does not touch libraries it does not know, even if installed', () => {
    expect(h('src/App.tsx', `import { Button } from '@mui/material';\n<Button />`, '<Button')).toBeNull();
    expect(h('src/App.tsx', `import { Search } from 'some-other-icons';\n<Search />`, '<Search')).toBeNull();
  });
});

describe('the project\'s own <Icon name="..." />', () => {
  const header = `import Icon from './components/Icon';\n`;

  it('object map: identifiers are followed to library and svg imports; strings can hold inline svg', () => {
    expect(h('src/App.tsx', header + `<Icon name="search" />`, '<Icon', 2)?.svg).toContain('m21 21-4.34-4.34');
    expect(h('src/App.tsx', header + `<Icon name="star-icon" />`, '<Icon', 2)?.svg).toContain('STAR');
    expect(h('src/App.tsx', header + `<Icon icon="raw" />`, '<Icon', 2)?.svg).toContain('RAWSTRING');
  });

  it('switch/case: component identifiers and inline <svg>', () => {
    const cfg = { iconComponentPatterns: { SwitchIcon: ['name'] } };
    const head = `import { SwitchIcon } from './components/SwitchIcon';\n`;
    expect(h('src/App.tsx', head + `<SwitchIcon name="bell" />`, '<SwitchIcon', 2, cfg)?.svg).toContain('BELL');
    expect(h('src/App.tsx', head + `<SwitchIcon name="flash" />`, '<SwitchIcon', 2, cfg)?.svg).toContain('FLASH');
  });

  it('folder of svgs named after the prop: template literal and import.meta.glob', () => {
    const cfg = { iconComponentPatterns: { FolderIcon: ['name'], GlobIcon: ['name'] } };
    expect(h('src/App.tsx', `import FolderIcon from './components/FolderIcon';\n<FolderIcon name="home" />`, '<FolderIcon', 2, cfg)?.svg).toContain('HOME');
    expect(h('src/App.tsx', `import GlobIcon from './components/GlobIcon';\n<GlobIcon name="bell" />`, '<GlobIcon', 2, cfg)?.svg).toContain('BELL');
  });

  it('falls back to the nameToFolder setting when the mapping is not statically readable', () => {
    const src = `import Opaque from './components/Opaque';\n<Opaque name="star" />`;
    expect(h('src/App.tsx', src, '<Opaque', 2, { iconComponentPatterns: { Opaque: ['name'] } })).toBeNull();
    const cfg = { iconComponentPatterns: { Opaque: ['name'] }, nameToFolder: { Opaque: 'src/assets' } };
    expect(h('src/App.tsx', src, '<Opaque', 2, cfg)?.svg).toContain('STAR');
    // `Component.prop` is more specific than `Component`
    const cfg2 = { iconComponentPatterns: { Opaque: ['name'] }, nameToFolder: { Opaque: 'nowhere', 'Opaque.name': 'src/assets' } };
    expect(h('src/App.tsx', src, '<Opaque', 2, cfg2)?.svg).toContain('STAR');
    // component imported through an alias we cannot follow still works via the setting
    expect(h('src/App.tsx', `import Opaque from '@/Opaque';\n<Opaque name="bell" />`, '<Opaque', 2, cfg)?.svg).toContain('BELL');
  });

  it('is unresolvable for unknown names, dynamic props, and path tricks', () => {
    expect(h('src/App.tsx', header + `<Icon name="missing" />`, '<Icon')).toBeNull();
    expect(h('src/App.tsx', header + `<Icon name={dyn} />`, '<Icon')).toBeNull();
    const cfg = { iconComponentPatterns: { Opaque: ['name'] }, nameToFolder: { Opaque: 'src/assets' } };
    expect(h('src/App.tsx', `<Opaque name="../../public/logo" />`, '<Opaque', 2, cfg)).toBeNull();
  });

  it('only components listed in iconComponentPatterns are treated as name-based icons', () => {
    expect(h('src/App.tsx', header + `<Icon name="search" />`, '<Icon', 2, { iconComponentPatterns: {} })).toBeNull();
  });
});

describe('icon fonts (only when the svg source is installed)', () => {
  it('Font Awesome: style + name -> svgs/<style>/<name>.svg', () => {
    expect(h('src/a.html', `<i class="fa-solid fa-house"></i>`, '<i')?.svg).toContain('M277 8z');
    expect(h('src/a.html', `<i class="fas fa-house fa-lg"></i>`, '<i')?.svg).toContain('M277 8z');
    expect(h('src/a.html', `<i class="fa-brands fa-github"></i>`, '<i')?.svg).toContain('M165 GH');
    expect(h('src/a.tsx', `<i className="fa-solid fa-house" />`, '<i')?.svg).toContain('M277 8z');
  });

  it('Font Awesome: unknown icon, unavailable style, or no style -> nothing', () => {
    expect(h('src/a.html', `<i class="fa-solid fa-nope"></i>`, '<i')).toBeNull();
    expect(h('src/a.html', `<i class="fa-regular fa-house"></i>`, '<i')).toBeNull();
    expect(h('src/a.html', `<i class="fa-light fa-house"></i>`, '<i')).toBeNull();
    expect(h('src/a.html', `<i class="fa-house"></i>`, '<i')).toBeNull();
    expect(h('src/a.html', `<i class="fa-solid fa-house fa-github"></i>`, '<i')).toBeNull(); // ambiguous
  });

  it('Bootstrap Icons: bi bi-<name>', () => {
    expect(h('src/a.html', `<i class="bi bi-house"></i>`, '<i')?.svg).toContain('M8.707 BI');
    expect(h('src/a.html', `<i class="bi bi-nope"></i>`, '<i')).toBeNull();
  });

  it('Material Icons ligature text (+ variant) -> the same glyph in @mui/icons-material', () => {
    expect(h('src/a.html', `<span class="material-icons">search</span>`, '<span')?.svg).toContain('M15.5 14h-.79');
    expect(h('src/a.html', `<span class="material-icons-outlined">search</span>`, '<span')?.svg).toContain('M1 OUTLINED');
    expect(h('src/a.html', `<span class="material-icons">nope_icon</span>`, '<span')).toBeNull();
    expect(h('src/a.html', `<span class="material-icons">{{ dyn }}</span>`, '<span')).toBeNull();
    expect(h('src/a.html', `<span class="material-symbols-outlined">search</span>`, '<span')).toBeNull(); // different glyph set
  });

  it('shows nothing when the font source package is not installed', () => {
    const empty = workspace({ 'a.html': '' });
    try {
      for (const t of [`<i class="fa-solid fa-house"></i>`, `<i class="bi bi-house"></i>`, `<span class="material-icons">search</span>`]) {
        expect(hover(empty.root, 'a.html', t, t.slice(0, 2))).toBeNull();
      }
    } finally {
      empty.cleanup();
    }
  });
});

describe('inline <svg>', () => {
  it('renders the svg under the cursor (jsx attrs converted, dynamic root attrs dropped)', () => {
    const t = `<svg className="x" width={size} viewBox="0 0 24 24" fill="none" strokeWidth={2} strokeLinecap="round"><path d="M4 4 INLINE" /></svg>`;
    const r = h('src/App.tsx', t, '<svg');
    expect(r?.svg).toContain('INLINE');
    expect(r?.svg).toContain('stroke-width="2"');
    expect(r?.svg).toContain('stroke-linecap="round"');
    expect(r?.svg).not.toContain('className');
    expect(r?.name).toBe('inline svg');
  });

  it('refuses when geometry is dynamic or the markup contains expressions', () => {
    expect(h('src/App.tsx', `<svg viewBox="0 0 24 24"><path d={pathData} /></svg>`, '<svg')).toBeNull();
    expect(h('src/App.tsx', `<svg viewBox="0 0 24 24">{children}</svg>`, '<svg')).toBeNull();
    expect(h('src/App.tsx', `<svg viewBox="0 0 24 24"><path d="M0 0" {...rest} /></svg>`, '<svg')).toBeNull();
  });

  it('strips script / handlers from inline markup too', () => {
    const r = h('src/a.html', `<svg viewBox="0 0 24 24" onload="x()"><script>alert(1)</script><path d="M0 0 OK" onclick="y()"/></svg>`, '<svg');
    expect(r?.svg).toContain('OK');
    expect(r?.svg).not.toMatch(/script|alert|onload|onclick/);
  });
});

describe('"unresolvable means no hover"', () => {
  it('non-icon tags show nothing', () => {
    expect(h('src/App.tsx', `<div className="a">x</div>`, '<div')).toBeNull();
    expect(h('src/App.tsx', `import { Button } from './Button';\n<Button>Save</Button>`, '<Button')).toBeNull();
    expect(h('src/App.tsx', `<Unknown />`, '<Unknown')).toBeNull();
    expect(h('src/App.tsx', `<span>search</span>`, '<span')).toBeNull();
  });

  it('never throws on garbage', () => {
    for (const t of ['<', '<<<', '<a b="', '<svg', '<svg viewBox="0 0 1 1"><', '{{{', '<Icon name=', '<I {', '']) {
      expect(() => hover(ws.root, 'src/x.tsx', t || ' ', t.slice(0, 1) || ' ', 0)).not.toThrow();
    }
  });
});

describe('cache', () => {
  it('reflects an svg changed on disk on the next hover (mtime invalidation)', () => {
    const w = workspace({ 'a.svg': svgFile('M1 1 BEFORE') });
    try {
      const src = `import A from './a.svg';\n<A />`;
      expect(hover(w.root, 'App.tsx', src, '<A')?.svg).toContain('BEFORE');
      writeFileSync(join(w.root, 'a.svg'), svgFile('M1 1 AFTER'));
      const t = new Date(Date.now() + 5000);
      utimesSync(join(w.root, 'a.svg'), t, t);
      const r = hover(w.root, 'App.tsx', src, '<A');
      expect(r?.svg).toContain('AFTER');
      expect(r?.svg).not.toContain('BEFORE');
    } finally {
      w.cleanup();
    }
  });

  it('is capped', () => {
    clearCache();
    const many: Record<string, string> = {};
    for (let i = 0; i < 560; i++) many[`i${i}.svg`] = svgFile(`M${i} 0`);
    const w = workspace(many);
    try {
      for (let i = 0; i < 560; i++) hover(w.root, 'App.tsx', `<img src="./i${i}.svg" />`, '<img');
      expect(cacheSize()).toBeLessThanOrEqual(500);
    } finally {
      w.cleanup();
    }
  });
});
