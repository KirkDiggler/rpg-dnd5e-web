import { describe, expect, it } from 'vitest';
import { GENERATED_ITEM_THUMBNAILS } from '../generated/itemThumbnailCatalog';
import { getItemIconUrl } from './itemIcons';

describe('published weapon thumbnails in item icon lookup', () => {
  it('uses the exact published image for a full weapon ref', () => {
    const ref = { module: 'dnd5e', type: 'item', id: 'longsword' };
    expect(getItemIconUrl(ref, '')).toBe(
      GENERATED_ITEM_THUMBNAILS['dnd5e:item:longsword'].url
    );
  });
  it('keeps explicit wire icon precedence', () => {
    expect(
      getItemIconUrl(
        { module: 'dnd5e', type: 'item', id: 'longsword' },
        'icons/custom.png'
      )
    ).toBe('/models/synty/ui/library/icons/custom.png');
  });
  it('does not borrow a thumbnail across modules or from an incomplete ref', () => {
    const thumbnail = GENERATED_ITEM_THUMBNAILS['dnd5e:item:longsword'].url;
    expect(
      getItemIconUrl({ module: 'homebrew', type: 'item', id: 'longsword' }, '')
    ).not.toBe(thumbnail);
    expect(getItemIconUrl({ id: 'longsword' }, '')).not.toBe(thumbnail);
  });
  it('keeps armor and unknown-item fallback behavior', () => {
    expect(
      getItemIconUrl({ module: 'dnd5e', type: 'item', id: 'chain-mail' }, '')
    ).toBe(getItemIconUrl({ id: 'chain-mail' }, ''));
    expect(
      getItemIconUrl({ module: 'dnd5e', type: 'item', id: 'unknown' }, '')
    ).toBeUndefined();
  });
});
