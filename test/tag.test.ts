import { describe, expect, it } from 'vitest';
import { attrValue, bindTag, findTagAt, parseImports } from '../src/parse';

/** `|` marks the cursor. */
const at = (src: string) => {
  const offset = src.indexOf('|');
  const text = src.replace('|', '');
  return { tag: findTagAt(text, offset), text };
};

describe('findTagAt (JSX tag at cursor)', () => {
  it('finds a self-closing component when the cursor is in the name', () => {
    const { tag } = at('<div><Sea|rchIcon className="x" /></div>');
    expect(tag?.name).toBe('SearchIcon');
    expect(tag?.selfClosing).toBe(true);
  });

  it('finds the tag when the cursor is on an attribute value, even across lines', () => {
    const { tag } = at('<Icon\n  className="a"\n  name="sea|rch"\n  size={24}\n/>');
    expect(tag?.name).toBe('Icon');
    expect(attrValue(tag!, 'name')).toBe('search');
  });

  it('prefers the innermost tag: an icon inside another tag attribute', () => {
    const { tag } = at('<Button icon={<Sear|ch />} onClick={() => a > b}>Go</Button>');
    expect(tag?.name).toBe('Search');
  });

  it('still returns the outer tag when the cursor is past the inner one', () => {
    const { tag } = at('<Bu|tton icon={<Search />}>Go</Button>');
    expect(tag?.name).toBe('Button');
    const second = at('<Button icon={<Search />} dis|abled>Go</Button>');
    expect(second.tag?.name).toBe('Button');
  });

  it('survives braces, strings and arrows in attribute expressions', () => {
    const { tag } = at(`<Icon name={cond ? "a}" : 'b'} on={() => { x = '}' }} cl|ass="y" />`);
    expect(tag?.name).toBe('Icon');
  });

  it('returns null outside any opening tag', () => {
    expect(at('<div>he|llo</div>').tag).toBeNull();
    expect(at('<div></di|v>').tag).toBeNull();
    expect(at('const a = b |< c;').tag).toBeNull();
    expect(at('<Foo /> |').tag).toBeNull();
  });

  it('reads static and dynamic attribute values', () => {
    const { tag } = at(`<Icon| name="a" icon={'b'} size={24} flag {...rest} dyn={x} :vue="y" />`);
    expect(attrValue(tag!, 'name')).toBe('a');
    expect(attrValue(tag!, 'icon')).toBe('b');
    expect(attrValue(tag!, 'size')).toBe('24');
    expect(attrValue(tag!, 'flag')).toBe('');
    expect(attrValue(tag!, 'dyn')).toBeNull();
    expect(attrValue(tag!, ':vue')).toBeNull();
  });

  it('handles html: unquoted attrs and void tags', () => {
    const { tag } = at('<p><im|g src=./a.svg alt=x></p>');
    expect(tag?.name).toBe('img');
    expect(attrValue(tag!, 'src')).toBe('./a.svg');
  });
});

describe('parseImports / bindTag', () => {
  const imports = parseImports(`
    import React, { useState } from 'react';
    import type { Foo } from './types';
    import StarIcon from './star.svg?react';
    import { ReactComponent as Heart, type Other } from "./heart.svg";
    import * as Lucide from 'lucide-react';
    import {
      Search,
      House as Home,
    } from 'lucide-react';
  `);

  it('parses default, named, aliased, namespace and multi-line imports', () => {
    const by = (l: string) => imports.find((b) => b.local === l);
    expect(by('StarIcon')).toEqual({ local: 'StarIcon', imported: 'default', source: './star.svg?react' });
    expect(by('Heart')).toEqual({ local: 'Heart', imported: 'ReactComponent', source: './heart.svg' });
    expect(by('Home')).toEqual({ local: 'Home', imported: 'House', source: 'lucide-react' });
    expect(by('Search')?.source).toBe('lucide-react');
    expect(by('Lucide')?.imported).toBe('*');
  });

  it('binds namespace members', () => {
    expect(bindTag('Lucide.Star', imports)).toEqual({ source: 'lucide-react', imported: 'Star' });
    expect(bindTag('Nope.Star', imports)).toBeNull();
    expect(bindTag('Home', imports)).toEqual({ source: 'lucide-react', imported: 'House' });
  });
});
