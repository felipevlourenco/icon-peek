// @ts-nocheck
// Icon font: a name -> character map, drawn from a .ttf. IconPeek reads the glyph outline out of the font file.
import createIconSet from '@expo/vector-icons/createIconSet';
import React from 'react';

import font from '@/assets/fonts/demo-icons.ttf';

const glyphs = {
  cross: 'F',
  camera: 'B',
  search: '\u0057',
  menu: 0x4d,
  scanner: 'A1',
} as const;

const GlyphSet = createIconSet(glyphs, 'demo-icons', font);

export const GlyphIcon = ({ name, size = 24 }) => <GlyphSet name={name} size={size} />;
