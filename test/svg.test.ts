import { describe, expect, it } from 'vitest';
import { parseSvgDocument } from '../src/parse';
import { CHIP_COLOR, ICON_COLOR, renderPreview, sanitize, serialize, toDataUri } from '../src/svg';

const parse = (s: string) => parseSvgDocument(s)!;
const clean = (s: string) => {
  const n = sanitize(parse(s));
  return n && serialize(n);
};

describe('sanitize', () => {
  it('removes <script>', () => {
    const out = clean('<svg viewBox="0 0 1 1"><script>alert(1)</script><path d="M0 0"/></svg>');
    expect(out).not.toMatch(/script|alert/i);
    expect(out).toContain('<path');
  });

  it('removes event-handler attributes', () => {
    const out = clean('<svg viewBox="0 0 1 1" onload="x()"><path d="M0 0" onclick="x()" onmouseover="y()"/></svg>')!;
    expect(out).not.toMatch(/on\w+=/i);
    expect(out).toContain('d="M0 0"');
  });

  it('removes <foreignObject> and its content', () => {
    const out = clean('<svg viewBox="0 0 1 1"><foreignObject><div>hi</div></foreignObject><path d="M0 0"/></svg>')!;
    expect(out).not.toMatch(/foreignObject|div|hi/);
  });

  it('removes external href / xlink:href but keeps #fragments', () => {
    const out = clean('<svg viewBox="0 0 1 1"><a href="https://evil.test"><path d="M0 0"/></a><use xlink:href="#a"/></svg>')!;
    expect(out).not.toContain('evil.test');
    expect(out).toContain('xlink:href="#a"');
  });

  it('removes external url() references but keeps url(#id)', () => {
    const out = clean('<svg viewBox="0 0 1 1"><path d="M0 0" fill="url(https://evil.test/a)" stroke="url(#g)" style="fill:url(//evil.test/x)"/></svg>')!;
    expect(out).not.toContain('evil.test');
    expect(out).toContain('stroke="url(#g)"');
  });

  it('neutralizes @import / external url() in <style> and drops javascript: values', () => {
    const out = clean('<svg viewBox="0 0 1 1"><style>@import url(https://evil.test/a.css);.a{fill:red;background:url(http://evil.test/i.png)}</style><path class="a" d="M0 0" data-x="javascript:alert(1)"/></svg>')!;
    expect(out).not.toMatch(/evil\.test|javascript/);
    expect(out).toContain('.a{fill:red');
  });

  it('refuses (null) when <use>/<image> points outside the file: dropping it would show a wrong icon', () => {
    expect(clean('<svg viewBox="0 0 1 1"><use href="https://evil.test/s.svg#a"/></svg>')).toBeNull();
    expect(clean('<svg viewBox="0 0 1 1"><image href="https://evil.test/a.png"/></svg>')).toBeNull();
  });

  it('refuses non-svg roots', () => {
    expect(sanitize({ tag: 'div', attrs: {}, children: [] })).toBeNull();
  });

  it('drops foreign namespaces and keeps output valid xml (escapes)', () => {
    const out = clean('<svg viewBox="0 0 1 1" xmlns:inkscape="http://x"><sodipodi:namedview/><path inkscape:label="x" d="M0 0" id="a&amp;b"/></svg>')!;
    expect(out).not.toMatch(/sodipodi|inkscape/);
    expect(out).toContain('id="a&amp;b"');
  });
});

describe('renderPreview', () => {
  const heart = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M1 1"/></svg>';

  it('replaces currentColor with a fixed readable color on a neutral chip', () => {
    const out = renderPreview(parse(heart), 48, 200_000)!;
    expect(out).not.toMatch(/currentColor/i);
    expect(out).toContain(`stroke="${ICON_COLOR}"`);
    expect(out).toContain(CHIP_COLOR);
  });

  it('adds a stroke when a fill:none icon never sets one (stroke-based sets)', () => {
    const out = renderPreview(parse('<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke-width="3"/></svg>'), 48, 200_000)!;
    expect(out).toContain(`stroke="${ICON_COLOR}"`);
  });

  it('scales to fit, keeping aspect ratio: square chip, nested viewBox preserved (meet)', () => {
    const out = renderPreview(parse('<svg width="64" height="32" viewBox="0 0 64 32"><path d="M0 0"/></svg>'), 48, 200_000)!;
    expect(out).toMatch(/^<svg [^>]*width="48" height="48" viewBox="0 0 48 48"/);
    expect(out).toContain('viewBox="0 0 64 32"');
    expect(out).not.toContain('preserveAspectRatio="none"');
  });

  it('clamps the size', () => {
    expect(renderPreview(parse(heart), 9999, 200_000)).toMatch(/width="256" height="256"/);
    expect(renderPreview(parse(heart), 1, 200_000)).toMatch(/width="16" height="16"/);
  });

  it('uses width/height when there is no viewBox, and refuses when there is neither', () => {
    expect(renderPreview(parse('<svg width="20" height="20"><path d="M0 0"/></svg>'), 48, 200_000)).toContain('viewBox="0 0 20 20"');
    expect(renderPreview(parse('<svg><path d="M0 0"/></svg>'), 48, 200_000)).toBeNull();
  });

  it('refuses output larger than maxBytes', () => {
    expect(renderPreview(parse(heart), 48, 100)).toBeNull();
  });

  it('data uri is plain base64 svg', () => {
    const uri = toDataUri('<svg/>');
    expect(uri).toBe('data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64'));
  });
});
