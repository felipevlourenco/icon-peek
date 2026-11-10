// Resolves tsconfig/jsconfig `paths` + `baseUrl` aliases (e.g. `@/assets/x.svg`) to candidate file-system bases.
// The config is parsed as data (JSONC); nothing is executed.
import { statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { cached, readText } from './cache';

interface Resolved {
  baseDir: string | null; // where `baseUrl` points
  pathsDir: string; // paths are relative to baseDir, or to the config that declared them
  paths: Record<string, string[]>;
}

/** JSON with comments and trailing commas -> value. String-aware. */
export function parseJsonc(text: string): unknown {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1 || text.length;
    } else out += c;
  }
  let res = '';
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (c === '"') {
      let j = i + 1;
      while (j < out.length && out[j] !== '"') j += out[j] === '\\' ? 2 : 1;
      res += out.slice(i, j + 1);
      i = j;
    } else if (c === ',' && /^\s*[}\]]/.test(out.slice(i + 1, i + 40))) continue;
    else res += c;
  }
  return JSON.parse(res);
}

const isFile = (p: string) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

function load(file: string, depth = 0): Resolved | null {
  const text = readText(file, 1_000_000);
  if (!text || depth > 4) return null;
  const json = parseJsonc(text) as { extends?: string | string[]; compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } };
  const dir = dirname(file);
  let r: Resolved = { baseDir: null, pathsDir: dir, paths: {} };
  const ext = Array.isArray(json.extends) ? json.extends : json.extends ? [json.extends] : [];
  for (const e of ext) {
    if (!e.startsWith('.') && !isAbsolute(e)) continue; // package presets (expo/tsconfig.base): not followed
    const p = resolve(dir, e);
    const parent = load(isFile(p) ? p : p + '.json', depth + 1);
    if (parent) r = parent;
  }
  const o = json.compilerOptions;
  if (o?.baseUrl) r.baseDir = resolve(dir, o.baseUrl);
  if (o?.paths) {
    r.paths = o.paths;
    r.pathsDir = dir;
  }
  return r;
}

/** Nearest tsconfig.json / jsconfig.json above `fromFile`. */
function findConfig(fromFile: string): string | null {
  for (let d = dirname(fromFile); ; d = dirname(d)) {
    for (const n of ['tsconfig.json', 'jsconfig.json']) if (isFile(join(d, n))) return join(d, n);
    if (dirname(d) === d) return null;
  }
}

/** Candidate paths (no extension probing) for a non-relative specifier. Empty when no alias applies. */
export function aliasBases(spec: string, fromFile: string): string[] {
  const cfg = findConfig(fromFile);
  const conf = cfg && cached(cfg, 'alias', () => load(cfg));
  if (!conf) return [];
  const out: string[] = [];
  for (const [key, targets] of Object.entries(conf.paths)) {
    const star = key.endsWith('*');
    if (star ? !spec.startsWith(key.slice(0, -1)) : spec !== key) continue;
    const rest = star ? spec.slice(key.length - 1) : '';
    for (const t of targets) out.push(resolve(conf.baseDir ?? conf.pathsDir, star ? t.replace('*', rest) : t));
  }
  if (conf.baseDir) out.push(resolve(conf.baseDir, spec)); // baseUrl-relative imports
  return out;
}
