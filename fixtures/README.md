# IconPeek fixtures

Demo workspace for IconPeek. Run `npm install` here once, then `npm run dev` from the project root.
`src/00-demo.tsx` is the toolbar used for the README GIF.

## Hover targets

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

