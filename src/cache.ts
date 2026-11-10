import { readFileSync, statSync } from 'node:fs';

// ponytail: sync fs + one Map. Hover work is tiny after the first hit; go async only if a profile says so.
const MAX_ENTRIES = 500;
interface Entry {
  file: string;
  stamp: string;
  value: unknown;
}
const store = new Map<string, Entry>();

/** Memoize compute() per (file, key), valid while the file's mtime+size are unchanged. LRU-capped. */
export function cached<T>(file: string, key: string, compute: () => T | null): T | null {
  let stamp: string;
  try {
    const st = statSync(file);
    stamp = `${st.mtimeMs}:${st.size}`;
  } catch {
    return null;
  }
  const k = `${file}\0${key}`;
  const hit = store.get(k);
  if (hit && hit.stamp === stamp) {
    store.delete(k);
    store.set(k, hit); // most recently used goes last
    return hit.value as T | null;
  }
  let value: T | null = null;
  try {
    value = compute();
  } catch {
    value = null; // parse failure == unresolvable
  }
  store.delete(k);
  store.set(k, { file, stamp, value });
  while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string);
  return value;
}

/** Drop every entry derived from `file` (called by the FileSystemWatcher). */
export function invalidate(file: string): void {
  for (const [k, e] of store) if (e.file === file) store.delete(k);
}

export function clearCache(): void {
  store.clear();
}

export function cacheSize(): number {
  return store.size;
}

/** Read a binary file unless it is missing, not a regular file, or over `maxBytes`. */
export function readBytes(file: string, maxBytes: number): Buffer | null {
  try {
    const st = statSync(file);
    return st.isFile() && st.size <= maxBytes ? readFileSync(file) : null;
  } catch {
    return null;
  }
}

/** Read a text file unless it is missing, not a regular file, or over `maxBytes`. */
export function readText(file: string, maxBytes: number): string | null {
  try {
    const st = statSync(file);
    return st.isFile() && st.size <= maxBytes ? readFileSync(file, 'utf8') : null;
  } catch {
    return null;
  }
}
