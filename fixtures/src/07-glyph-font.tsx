// @ts-nocheck
import { GlyphIcon } from '@/components/GlyphIcon';

export function GlyphDemo() {
  return (
    <div>
      <GlyphIcon name="cross" />
      <GlyphIcon name="camera" size={32} />
      <GlyphIcon name="search" />
      <GlyphIcon name="menu" />
      <GlyphIcon name="scanner" />
      <GlyphIcon name="camera-plus" size={15} />
      <GlyphIcon name="search-alt" size={30} color="#fff" />
      <GlyphIcon name="missing" />
    </div>
  );
}
