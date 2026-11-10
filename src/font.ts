// Reads glyph outlines out of a TrueType (.ttf) file and turns one into an SVG node.
// Pure byte parsing: the font is data, never executed. CFF/OpenType-PS and WOFF are not supported (-> null).
import { cached, readBytes } from './cache';
import type { SvgNode } from './parse';
import { mkNode } from './svg';

interface Pt {
  x: number;
  y: number;
  on: boolean;
}

const FONT_MAX = 16 * 1024 * 1024;

function parse(buf: Buffer, cp: number): { d: string; box: [number, number, number, number] } | null {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (v.getUint32(0) !== 0x00010000 && v.getUint32(0) !== 0x74727565 /* 'true' */) return null;
  const tables = new Map<string, number>();
  for (let i = 0, n = v.getUint16(4); i < n; i++) {
    const o = 12 + 16 * i;
    tables.set(String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3)), v.getUint32(o + 8));
  }
  const [head, maxp, cmap, loca, glyf] = ['head', 'maxp', 'cmap', 'loca', 'glyf'].map((t) => tables.get(t));
  if (head === undefined || maxp === undefined || cmap === undefined || loca === undefined || glyf === undefined) return null;
  const longLoca = v.getInt16(head + 50) === 1;
  const numGlyphs = v.getUint16(maxp + 4);

  // ---- cmap: code point -> glyph index (formats 0, 4, 6, 12)
  const subs: { pri: number; at: number }[] = [];
  for (let i = 0, n = v.getUint16(cmap + 2); i < n; i++) {
    const plat = v.getUint16(cmap + 4 + 8 * i);
    const enc = v.getUint16(cmap + 6 + 8 * i);
    const at = cmap + v.getUint32(cmap + 8 + 8 * i);
    subs.push({ at, pri: plat === 3 && enc === 10 ? 0 : plat === 0 ? 1 : plat === 3 && enc === 1 ? 2 : 3 });
  }
  const lookup = (at: number): number => {
    const fmt = v.getUint16(at);
    if (fmt === 0) return cp < 256 ? v.getUint8(at + 6 + cp) : 0;
    if (fmt === 6) {
      const first = v.getUint16(at + 6);
      return cp >= first && cp < first + v.getUint16(at + 8) ? v.getUint16(at + 10 + 2 * (cp - first)) : 0;
    }
    if (fmt === 12) {
      for (let g = 0, n = v.getUint32(at + 12); g < n; g++) {
        const o = at + 16 + 12 * g;
        if (cp >= v.getUint32(o) && cp <= v.getUint32(o + 4)) return v.getUint32(o + 8) + cp - v.getUint32(o);
      }
      return 0;
    }
    if (fmt === 4 && cp <= 0xffff) {
      const segX2 = v.getUint16(at + 6);
      const ends = at + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let s = 0; s < segX2; s += 2) {
        if (cp > v.getUint16(ends + s)) continue;
        if (cp < v.getUint16(starts + s)) return 0;
        const ro = v.getUint16(ranges + s);
        if (ro === 0) return (cp + v.getInt16(deltas + s)) & 0xffff;
        const g = v.getUint16(ranges + s + ro + 2 * (cp - v.getUint16(starts + s)));
        return g === 0 ? 0 : (g + v.getInt16(deltas + s)) & 0xffff;
      }
    }
    return 0;
  };
  let gid = 0;
  for (const s of subs.sort((a, b) => a.pri - b.pri)) if (!gid) gid = lookup(s.at);
  if (!gid || gid >= numGlyphs) return null;

  // ---- glyf: outline -> contours of points
  const range = (g: number): [number, number] => (longLoca ? [v.getUint32(loca + 4 * g), v.getUint32(loca + 4 * g + 4)] : [v.getUint16(loca + 2 * g) * 2, v.getUint16(loca + 2 * g + 2) * 2]);
  const contours = (g: number, depth: number): Pt[][] => {
    if (depth > 6 || g >= numGlyphs) throw new Error('bad glyph');
    const [a, b] = range(g);
    if (b <= a) return [];
    const o = glyf + a;
    const nc = v.getInt16(o);
    if (nc >= 0) return simple(o, nc);
    // composite: offsets + optional scale, no point matching
    const out: Pt[][] = [];
    let p = o + 10;
    for (;;) {
      const flags = v.getUint16(p);
      const sub = v.getUint16(p + 2);
      p += 4;
      if (!(flags & 0x2)) throw new Error('point-matching composite');
      let dx: number, dy: number;
      if (flags & 0x1) {
        dx = v.getInt16(p);
        dy = v.getInt16(p + 2);
        p += 4;
      } else {
        dx = v.getInt8(p);
        dy = v.getInt8(p + 1);
        p += 2;
      }
      let xx = 1, yy = 1, xy = 0, yx = 0;
      const f2 = (q: number) => v.getInt16(q) / 16384;
      if (flags & 0x8) {
        xx = yy = f2(p);
        p += 2;
      } else if (flags & 0x40) {
        xx = f2(p);
        yy = f2(p + 2);
        p += 4;
      } else if (flags & 0x80) {
        xx = f2(p);
        xy = f2(p + 2);
        yx = f2(p + 4);
        yy = f2(p + 6);
        p += 8;
      }
      for (const c of contours(sub, depth + 1)) out.push(c.map((q) => ({ on: q.on, x: xx * q.x + yx * q.y + dx, y: xy * q.x + yy * q.y + dy })));
      if (!(flags & 0x20)) return out;
    }
  };
  const simple = (o: number, nc: number): Pt[][] => {
    if (nc === 0) return [];
    const ends: number[] = [];
    let p = o + 10;
    for (let i = 0; i < nc; i++, p += 2) ends.push(v.getUint16(p));
    const n = ends[nc - 1] + 1;
    p += 2 + v.getUint16(p); // instructions
    const flags: number[] = [];
    while (flags.length < n) {
      const f = v.getUint8(p++);
      flags.push(f);
      if (f & 0x8) for (let r = v.getUint8(p++); r > 0; r--) flags.push(f);
    }
    const coords = (short: number, same: number): number[] => {
      const out: number[] = [];
      let c = 0;
      for (let i = 0; i < n; i++) {
        const f = flags[i];
        if (f & short) {
          const d = v.getUint8(p++);
          c += f & same ? d : -d;
        } else if (!(f & same)) {
          c += v.getInt16(p);
          p += 2;
        }
        out.push(c);
      }
      return out;
    };
    const xs = coords(0x2, 0x10);
    const ys = coords(0x4, 0x20);
    const res: Pt[][] = [];
    for (let i = 0, s = 0; i < nc; s = ends[i++] + 1) {
      const c: Pt[] = [];
      for (let k = s; k <= ends[i]; k++) c.push({ x: xs[k], y: ys[k], on: !!(flags[k] & 1) });
      if (c.length) res.push(c);
    }
    return res;
  };

  const cs = contours(gid, 0);
  if (!cs.length) return null;
  const r = (n: number) => String(Math.round(n * 10) / 10);
  const f = (q: Pt) => `${r(q.x)} ${r(-q.y)}`; // font y goes up, svg y goes down
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, on: true });
  let d = '';
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const pts of cs) {
    for (const q of pts) {
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
    }
    const last = pts[pts.length - 1];
    const start = pts[0].on ? pts[0] : last.on ? last : mid(pts[0], last);
    const seq = pts[0].on ? pts.slice(1) : last.on ? pts.slice(0, -1) : pts;
    d += `M${f(start)}`;
    let ctrl: Pt | null = null;
    for (const q of seq) {
      if (q.on) {
        d += ctrl ? `Q${f(ctrl)} ${f(q)}` : `L${f(q)}`;
        ctrl = null;
      } else {
        if (ctrl) d += `Q${f(ctrl)} ${f(mid(ctrl, q))}`;
        ctrl = q;
      }
    }
    if (ctrl) d += `Q${f(ctrl)} ${f(start)}`;
    d += 'Z';
  }
  return x1 > x0 && y1 > y0 ? { d, box: [x0, y0, x1, y1] } : null;
}

/** Glyph for `codePoint` as an <svg> (viewBox = the glyph's own box), or null if the font/glyph can't be read. */
export function fontGlyph(file: string, codePoint: number): SvgNode | null {
  return cached(file, `glyph:${codePoint}`, () => {
    const bytes = readBytes(file, FONT_MAX);
    const g = bytes && parse(bytes, codePoint);
    if (!g) return null;
    const [x0, y0, x1, y1] = g.box;
    const root = mkNode('svg', { viewBox: `${Math.round(x0 * 10) / 10} ${Math.round(-y1 * 10) / 10} ${Math.round((x1 - x0) * 10) / 10} ${Math.round((y1 - y0) * 10) / 10}`, fill: 'currentColor' });
    root.children.push(mkNode('path', { d: g.d }));
    return root;
  });
}
