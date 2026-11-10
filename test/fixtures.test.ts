import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from './helpers';
import { resolveIcon, type Config } from '../src/resolve';

// Runs the real resolver over the real fixtures/ workspace (and its real node_modules).
// Needs `npm install` inside fixtures/ once. Each row is one manual-verification hover target.
const root = resolve(__dirname, '../fixtures');
const installed = existsSync(join(root, 'node_modules/lucide-react/package.json'));

const settings = JSON.parse(readFileSync(join(root, '.vscode/settings.json'), 'utf8'));
const config: Config = {
  ...defaultConfig,
  iconComponentPatterns: settings['iconpeek.iconComponentPatterns'],
  nameToFolder: settings['iconpeek.nameToFolder'],
};

function at(file: string, needle: string) {
  const text = readFileSync(join(root, file), 'utf8');
  const i = text.indexOf(needle);
  if (i < 0) throw new Error(`${file}: needle not found: ${needle}`);
  return resolveIcon({ text, offset: i + 1, file: join(root, file), roots: [root], config });
}

// [file, text to hover (cursor lands inside the tag), distinctive part of the expected icon | null = no hover]
const rows: [string, string, string | null][] = [
  // 1. local svg
  ['src/01-local-svg.tsx', '<StarIcon />', 'M12 2l3.09 6.26'],
  ['src/01-local-svg.tsx', '<HeartIcon className', 'M20.84 4.61'],
  ['src/01-local-svg.tsx', '<RingIcon />', 'stroke="#2b2b2b"'],
  ['src/01-local-svg.tsx', '<img src="./assets/icons/bolt.svg"', 'M13 2L3 14h9'],
  ['src/01-local-svg.tsx', '<img src={boltUrl}', 'M13 2L3 14h9'],
  ['src/01-local-svg.tsx', '<img src="/logo.svg"', '#2563eb'],
  ['src/01-local-svg.tsx', '<use href="./assets/sprite.svg#home"', 'M3 9l9-7'],
  ['src/01-local-svg.tsx', '<use href="./assets/sprite.svg#bell"', 'M18 8A6 6'],
  // 2. libraries
  ['src/02-libraries.tsx', '<Search />', 'm21 21-4.34-4.34'],
  ['src/02-libraries.tsx', '<HomeLucide', 'M15 21v-8a1 1 0 0 0-1-1h-4'],
  ['src/02-libraries.tsx', '<Bell />', 'M10.268 21a2 2 0 0 0 3.464 0'],
  ['src/02-libraries.tsx', '<Lucide.Star', 'M11.525 2.295'],
  ['src/02-libraries.tsx', '<FaHome />', 'M280.37 148.26'],
  ['src/02-libraries.tsx', '<FaGithub />', 'M165.9 397.4'],
  ['src/02-libraries.tsx', '<FiSearch />', 'stroke-linecap="round"'],
  ['src/02-libraries.tsx', '<MagnifyingGlassIcon', 'm21 21-5.197-5.197m0 0A7.5'],
  ['src/02-libraries.tsx', '<HeartIcon', 'm11.645 20.91'],
  ['src/02-libraries.tsx', '<SearchMui', 'M15.5 14h-.79'],
  ['src/02-libraries.tsx', '<AddAPhoto', 'M3 4V1h2v3h3v2H5v3H3V6H0V4z'],
  ['src/02-libraries.tsx', '<AdminPanelSettingsOutlined', 'M18 11.09V6.27'],
  // 3. own icon components
  ['src/03-icon-component.tsx', '<Icon name="search"', 'm21 21-4.34-4.34'],
  ['src/03-icon-component.tsx', '<Icon icon="heart"', 'M20.84 4.61'],
  ['src/03-icon-component.tsx', '<Icon name="home"', 'M280.37 148.26'],
  ['src/03-icon-component.tsx', '<SwitchIcon name="bell"', 'M18 8A6 6'],
  ['src/03-icon-component.tsx', '<SwitchIcon name="flash"', 'M13 2L3 14h9'],
  ['src/03-icon-component.tsx', '<FolderIcon name="home"', 'M3 9l9-7'],
  ['src/03-icon-component.tsx', '<LegacyIcon name="search"', 'x1="21" y1="21"'],
  ['src/03-icon-component.tsx', '<Icon name="does-not-exist"', null],
  ['src/03-icon-component.tsx', '<Icon name={dynamicName}', null],
  // 4. inline svg + icon fonts
  ['src/04-inline-and-fonts.html', '<svg xmlns', 'M8 14s1.5 2 4 2 4-2 4-2'],
  ['src/04-inline-and-fonts.html', '<i class="fa-solid fa-house"', 'M277.8 8.6'],
  ['src/04-inline-and-fonts.html', '<i class="fa-regular fa-star"', 'M288.1-32c9'],
  ['src/04-inline-and-fonts.html', '<i class="fa-brands fa-github"', 'M216.5 362.5'],
  ['src/04-inline-and-fonts.html', '<i class="bi bi-house"', 'M8.707 1.5'],
  ['src/04-inline-and-fonts.html', '<i class="bi bi-alarm-fill"', 'M6 .5a.5.5'],
  ['src/04-inline-and-fonts.html', '<span class="material-icons">', 'M15.5 14h-.79'],
  ['src/04-inline-and-fonts.html', '<span class="material-icons-outlined">', 'm12 21.35-1.45-1.32C5.4'],
  ['src/04-inline-and-fonts.html', '<i class="fa-light fa-house"', null],
  ['src/04-inline-and-fonts.html', '<i class="fa-solid fa-not-a-real-icon"', null],
  ['src/04-inline-and-fonts.html', '<img src="/logo.svg"', '#2563eb'],
  ['src/04-inline-and-fonts.html', '<img src="https://example.com/remote.svg"', null],
  // 5. not icons
  ['src/05-not-icons.tsx', '<div className="box">', null],
  ['src/05-not-icons.tsx', '<Button variant', null],
  ['src/05-not-icons.tsx', '<Panel title', null],
  ['src/05-not-icons.tsx', '<span>plain', null],
  // 7. project icon font (.ttf glyphs, `@/` alias from tsconfig)
  ['src/07-glyph-font.tsx', '<GlyphIcon name="cross"', '<path d="M'],
  ['src/07-glyph-font.tsx', '<GlyphIcon name="camera"', '<path d="M'],
  ['src/07-glyph-font.tsx', '<GlyphIcon name="search"', '<path d="M'],
  ['src/07-glyph-font.tsx', '<GlyphIcon name="menu"', '<path d="M'],
  ['src/07-glyph-font.tsx', '<GlyphIcon name="scanner"', null],
  ['src/07-glyph-font.tsx', '<GlyphIcon name="missing"', null],
  // 6. other languages
  ['src/06-frameworks/Card.vue', '<StarIcon />', 'M12 2l3.09 6.26'],
  ['src/06-frameworks/Card.vue', '<i class="bi bi-house"', 'M8.707 1.5'],
  ['src/06-frameworks/Card.svelte', '<Heart />', 'M20.84 4.61'],
  ['src/06-frameworks/Card.svelte', '<img src="../assets/icons/bolt.svg"', 'M13 2L3 14h9'],
  ['src/06-frameworks/Card.astro', '<Bell />', 'M10.268 21a2 2 0 0 0 3.464 0'],
  ['src/06-frameworks/Card.astro', '<i class="fa-solid fa-house"', 'M277.8 8.6'],
];

describe.skipIf(!installed)('real fixtures/ workspace', () => {
  it.each(rows)('%s  %s', (file, needle, expected) => {
    const r = at(file, needle);
    if (expected === null) expect(r).toBeNull();
    else {
      expect(r, `no hover for ${needle}`).not.toBeNull();
      expect(r!.svg).toContain(expected);
      expect(r!.svg).not.toMatch(/currentColor|<script|onload|onclick|foreignObject/i);
      expect(r!.svg.length).toBeLessThan(config.maxSvgBytes);
    }
  });
});
