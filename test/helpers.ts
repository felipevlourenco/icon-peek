import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { resolveIcon, type Config, type Resolved } from '../src/resolve';

export const defaultConfig: Config = {
  previewSize: 48,
  iconComponentPatterns: { Icon: ['name', 'icon'] },
  nameToFolder: {},
  maxSvgBytes: 200_000,
};

/** Create a throwaway workspace from { 'relative/path': 'content' }. */
export function workspace(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'iconpeek-'));
  for (const [p, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), content);
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/**
 * Hover on `needle` inside `text` (offset `delta` chars into the needle) as if the doc lived at `root/file`.
 * Pass `|` in `text` to mark the cursor instead.
 */
export function hover(root: string, file: string, text: string, needle: string, delta = 2, config: Partial<Config> = {}, roots = [root]): Resolved | null {
  const at = text.indexOf(needle);
  if (at < 0) throw new Error(`needle not found: ${needle}`);
  return resolveIcon({ text, offset: at + delta, file: join(root, file), roots, config: { ...defaultConfig, ...config } });
}

export const b64 = (r: Resolved) => r.svg;
