# IconPeek

Hover an icon in your code and see it. No opening the SVG, no running the app.

Works on `<SearchIcon />`, `<Icon name="search" />`, `<img src="x.svg">`, `<use href="sprite.svg#id">`, inline `<svg>`, and icon-font tags like `<i class="fa-solid fa-house">`.

Languages: `typescriptreact`, `javascriptreact`, `html`, `vue`, `svelte`, `astro` (Vue / Svelte / Astro need their language extensions installed, they provide the language ids). The extension activates lazily with `onLanguage`, never on `*`.

## How it works

- **Static parsing only.** Icon data is read out of the source text of SVG files and package files. Nothing from your workspace or `node_modules` is ever `require()`d, `import()`ed or evaluated. The extension declares itself safe for untrusted workspaces for that reason.
- **Sanitized.** Before display every SVG loses `<script>`, `<foreignObject>`, `on*` handlers, external `href` / `url()` references, `javascript:` values and `@import`. If an icon depends on something external (a `<use>` or `<image>` pointing outside the file) there is no hover, because dropping it would show a wrong icon.
- **No wrong icons.** If the icon cannot be resolved with confidence (dynamic name, missing file, unknown library, file over the size cap) there is **no hover at all**. No placeholders.
- **Smallest trust level.** The hover is plain Markdown: `![icon](data:image/svg+xml;base64,…)` with `isTrusted` and `supportHtml` both off. VS Code's Markdown sanitizer allows `data:` images without either (checked in the renderer source, VS Code 1.145). The preview size and the chip are baked into the SVG, so no HTML is needed.
- **Theme-aware.** `currentColor` becomes `#2b2b2b` (and `fill="none"` icons that never set a stroke get one), drawn on a light `#e9e9e9` chip, so it reads on light and dark themes.
- **Fast.** Parsed icons are cached per file path + mtime/size (500 entries max, LRU) and a `FileSystemWatcher` on `**/*.svg` drops entries eagerly. Measured on the fixtures: about 4 ms for the first hover into a 7 MB `react-icons` pack, under 0.3 ms afterwards.

## Supported sources

| Source | What is resolved |
| --- | --- |
| Local SVG files | `import X from './x.svg'` (also `?react`, `?url`, `?component`, and `import { ReactComponent as X }`) used as `<X />`; `<img src="./x.svg">`, `<img src={importedUrl}>`; `<use href="sprite.svg#id">`. Paths resolve relative to the file, then the workspace root, then `public/`. |
| `lucide-react` | `import { Search } from 'lucide-react'`, aliases (`House as Home`), namespace (`<Lucide.Star />`). Found through the `export { default as … } from './icons/<name>.mjs'` map. |
| `react-icons` | Per-pack subpaths (`react-icons/fa`, `/fa6`, `/fi`, …). The icon's JSON tree is cut out of the pack file by exact function name. |
| `@heroicons/react` | `…/24/outline`, `…/24/solid`, `…/20/solid`, `…/16/solid`, named import or deep default import. |
| `@mui/icons-material` | `import Search from '@mui/icons-material/Search'` or `import { Search } from '@mui/icons-material'`, including multi-element icons. |
| Your own `<Icon name="…" />` | Follows the import to the component file (or this file) and looks for, in order: an object map `name: Identifier`, `switch`/`case 'name'`, a path template (`` `./icons/${name}.svg` ``, `'./icons/' + name + '.svg'`, `import.meta.glob('./icons/*.svg')`). Identifiers are followed to their own import, so the map can point at SVG files or at any supported library. Last resort: the `iconpeek.nameToFolder` setting. |
| Inline `<svg>` | Hover the `<svg …>` opening tag. JSX attribute names are converted; `{expr}` attributes on the root are dropped, but dynamic geometry or `{children}` anywhere inside means no hover. |
| Icon fonts | Font Awesome (`fa-solid fa-house`, `fas`, `far`, `fab`, …) via `@fortawesome/fontawesome-free/svgs/<style>/<name>.svg`; Bootstrap Icons (`bi bi-house`) via `bootstrap-icons/icons/<name>.svg`; Material Icons ligatures (`<span class="material-icons">search</span>`, plus `-outlined`, `-round`, `-sharp`, `-two-tone`) via the same glyph in `@mui/icons-material`. Only when that package is installed in the workspace. |

Library layouts were inspected, not assumed. Verified against: `lucide-react` 1.71.0, `react-icons` 5.7.0, `@heroicons/react` 2.2.0, `@mui/icons-material` 9.5.0, `@fortawesome/fontawesome-free` 7.3.1, `bootstrap-icons` 1.13.2. Other major versions may lay files out differently and will simply show nothing.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `iconpeek.enabled` | `true` | Master switch (live). |
| `iconpeek.previewSize` | `48` | Preview box in px, clamped to 16–256. The icon is scaled to fit inside it, keeping its aspect ratio. |
| `iconpeek.languages` | the six languages above | Language ids where IconPeek runs. Reload the window after changing. |
| `iconpeek.iconComponentPatterns` | `{ "Icon": ["name", "icon"] }` | Components that take an icon name, mapped to the props that hold it. Only static string values count (`name="search"`, `name={'search'}`). |
| `iconpeek.nameToFolder` | `{}` | Fallback when a component's mapping cannot be read statically. Key is `Component` or `Component.prop` (the latter wins). Value is a folder, workspace-relative or absolute, holding `<name>.svg`. |
| `iconpeek.maxSvgBytes` | `200000` | SVG files larger than this, and previews larger than this, are skipped. (`react-icons` pack files are read up to a fixed 16 MB.) |

## Run it

```bash
npm install
npm run compile
```

Then open this folder in VS Code and press **F5** (`Run IconPeek (fixtures)`). It builds, launches an Extension Development Host and opens `fixtures/`. The fixtures' `node_modules` is already installed; if you cloned fresh, run `npm install` inside `fixtures/` once.

```bash
npm test        # vitest: parser, sanitizer, every resolver, and the real fixtures/ workspace
```

## Manual verification (Extension Development Host on `fixtures/`)

Put the mouse on the quoted text. Line numbers are 1-based.

| File:line | Hover | Expect |
| --- | --- | --- |
| `src/01-local-svg.tsx:10` | `<StarIcon />` (`.svg?react`) | solid star |
| `src/01-local-svg.tsx:11` | `<HeartIcon …>` (`ReactComponent`) | outlined heart |
| `src/01-local-svg.tsx:12` | `<RingIcon />` | clock ring (the file never sets a stroke, IconPeek adds one) |
| `src/01-local-svg.tsx:13` | `<img src="./assets/icons/bolt.svg">` | bolt |
| `src/01-local-svg.tsx:14` | `<img src={boltUrl}>` (`?url` import) | bolt |
| `src/01-local-svg.tsx:15` | `<img src="/logo.svg">` (`public/`) | blue logo |
| `src/01-local-svg.tsx:16`, `:17` | `<use href="…sprite.svg#home">`, `#bell` | outlined house, outlined bell |
| `src/02-libraries.tsx:14` | `<Search />` | lucide search |
| `src/02-libraries.tsx:15` | `<HomeLucide />` (`House as HomeLucide`) | lucide house |
| `src/02-libraries.tsx:16`, `:17` | `<Bell />`, `<Lucide.Star />` | lucide bell, lucide star |
| `src/02-libraries.tsx:18`–`:20` | `<FaHome />`, `<FaGithub />`, `<FiSearch />` | react-icons house, GitHub mark, feather search |
| `src/02-libraries.tsx:21`, `:22` | `<MagnifyingGlassIcon>` (outline), `<HeartIcon>` (solid) | heroicons magnifier, filled heart |
| `src/02-libraries.tsx:23`–`:25` | `<SearchMui />`, `<AddAPhoto />`, `<AdminPanelSettingsOutlined />` | MUI magnifier, camera with plus, shield with person |
| `src/03-icon-component.tsx:10` | `<Icon name="search" />` | lucide search (object map to a library import) |
| `src/03-icon-component.tsx:11`, `:12` | `<Icon icon="heart" />`, `<Icon name="home" />` | outlined heart (svg import), react-icons house |
| `src/03-icon-component.tsx:13`, `:14` | `<SwitchIcon name="bell" />`, `name="flash"` | bell (switch to svg import), bolt (switch to inline svg) |
| `src/03-icon-component.tsx:15` | `<FolderIcon name="home" />` | outlined house (path template) |
| `src/03-icon-component.tsx:16` | `<LegacyIcon name="search" />` | search (`nameToFolder` setting) |
| `src/03-icon-component.tsx:17`, `:18` | `name="does-not-exist"`, `name={dynamicName}` | **nothing** |
| `src/04-inline-and-fonts.html:4` | `<svg xmlns=…>` | smiley |
| `src/04-inline-and-fonts.html:11`–`:13` | `fa-solid fa-house`, `fa-regular fa-star`, `fa-brands fa-github` | Font Awesome house, star outline, GitHub |
| `src/04-inline-and-fonts.html:14`, `:15` | `bi bi-house`, `bi bi-alarm-fill` | Bootstrap house, alarm |
| `src/04-inline-and-fonts.html:16`, `:17` | `material-icons` `search`, `material-icons-outlined` `favorite` | magnifier, heart |
| `src/04-inline-and-fonts.html:19`, `:20`, `:22` | `fa-light fa-house`, `fa-not-a-real-icon`, remote `<img>` | **nothing** |
| `src/04-inline-and-fonts.html:21` | `<img src="/logo.svg">` | blue logo |
| `src/05-not-icons.tsx:7`–`:10` | `<div>`, `<Button>`, `<Panel>`, `<span>` | **nothing from IconPeek** |
| `src/06-frameworks/Card.vue:6`,`:7`, `Card.svelte:5`,`:6`, `Card.astro:5`,`:6` | components, `<img>`, `<i>` | same logic in Vue / Svelte / Astro (needs those language extensions) |

**Live change on disk:** hover `src/01-local-svg.tsx:10` (star), edit the `d="…"` in `src/assets/icons/star.svg`, save, hover again. The new shape shows on the next hover.

## Known limitations

- Path aliases (`@/assets/x.svg`, tsconfig `paths`) are not resolved. Barrel re-exports (`export { default as X } from './x.svg'`) and your own components that merely wrap an `<svg>` are not followed. Name-based icon components are (see above).
- Yarn PnP (no `node_modules` folder) is not supported. Only `file:` documents work (no virtual workspaces, no untitled files).
- Dynamic names or props (`name={x}`), JSX expressions inside inline SVG, and `<use href="#id">` pointing into the same document show nothing.
- Font Awesome: legacy aliases (`fa-home`) show nothing unless an SVG of that exact name exists; Pro-only styles (`fa-light`, `fa-thin`, `fa-duotone`) show nothing. Material Symbols (`material-symbols-*`) are a different glyph set and are not mapped. Material ligatures that start with a digit (`3d_rotation`) are not mapped. The ligature-to-glyph mapping assumes `@mui/icons-material` mirrors the Material Icons font.
- Icons whose own colors are very light (white fills) can be hard to see on the light chip.
- The caption is plain text: VS Code only allows a small font through HTML, which stays disabled.
- Reads are synchronous. A first hover into a multi-MB `react-icons` pack costs a few milliseconds; later hovers hit the cache.
- Hover works over a tag's whole opening tag (`<Icon … >`), including across lines. Closing tags and tag children do not trigger it.
- Changing `iconpeek.languages` needs a window reload. The Vue / Svelte / Astro language ids exist only with their extensions installed.
