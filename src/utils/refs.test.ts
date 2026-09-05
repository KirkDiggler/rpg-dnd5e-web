import {
  isExactPropRef,
  parseRef,
  refId,
  refLabel,
  refSlug,
} from '@/utils/refs';
import { describe, expect, it } from 'vitest';

describe('parseRef', () => {
  it('reads a three-part ref as module, type, and a single-part id', () => {
    expect(parseRef('dnd5e:props:reliquary')).toEqual({
      module: 'dnd5e',
      type: 'props',
      id: 'reliquary',
      idParts: ['reliquary'],
    });
  });

  it('gives the whole rest of a four-part ref as the id', () => {
    expect(parseRef('dnd5e:props:plushie:skeleton-dog')).toEqual({
      module: 'dnd5e',
      type: 'props',
      id: 'plushie:skeleton-dog',
      idParts: ['plushie', 'skeleton-dog'],
    });
  });

  it('keeps going past four parts — the id has no part limit', () => {
    expect(parseRef('dnd5e:props:plushie:dog:skeleton')).toMatchObject({
      id: 'plushie:dog:skeleton',
      idParts: ['plushie', 'dog', 'skeleton'],
    });
  });

  it('round-trips module:type:id back to the ref it came from', () => {
    for (const ref of [
      'dnd5e:props:reliquary',
      'dnd5e:props:plushie:skeleton-dog',
      'dnd5e:monsters:skeleton-captain',
      'homebrew:conditions:some_effect',
      'dnd5e:props:plushie:dog:skeleton',
    ]) {
      const parsed = parseRef(ref);
      expect(parsed).not.toBeNull();
      expect(`${parsed!.module}:${parsed!.type}:${parsed!.id}`).toBe(ref);
    }
  });

  it('refuses a string with fewer than three parts', () => {
    expect(parseRef('dnd5e:props')).toBeNull();
    expect(parseRef('reliquary')).toBeNull();
    expect(parseRef('')).toBeNull();
  });

  it('refuses an empty part anywhere, including a trailing colon', () => {
    expect(parseRef('dnd5e:props:')).toBeNull();
    expect(parseRef(':props:reliquary')).toBeNull();
    expect(parseRef('dnd5e::reliquary')).toBeNull();
    expect(parseRef('dnd5e:props:plushie::skeleton-dog')).toBeNull();
  });

  it('refuses a part carrying a character outside the grammar', () => {
    expect(parseRef('dnd5e:props:skeleton dog')).toBeNull();
    expect(parseRef('dnd5e:props:plushie/dog')).toBeNull();
  });
});

describe('refId', () => {
  it('is the old last-segment answer for a three-part ref', () => {
    expect(refId('dnd5e:props:tomb-open')).toBe('tomb-open');
  });

  it('is the whole multi-part id, so families no longer collide', () => {
    expect(refId('dnd5e:props:chest:small')).toBe('chest:small');
    expect(refId('dnd5e:props:crate:small')).toBe('crate:small');
    expect(refId('dnd5e:props:chest:small')).not.toBe(
      refId('dnd5e:props:crate:small')
    );
  });

  it('is null for a string that is not a ref', () => {
    expect(refId('weapon')).toBeNull();
  });
});

describe('refLabel', () => {
  it('reads a one-part id as its own words', () => {
    expect(refLabel('dnd5e:props:reliquary')).toBe('reliquary');
    expect(refLabel('dnd5e:props:tomb-open')).toBe('tomb open');
    expect(refLabel('dnd5e:conditions:some_effect')).toBe('some effect');
  });

  it('reads a multi-part id left to right, colons included', () => {
    expect(refLabel('dnd5e:props:plushie:skeleton-dog')).toBe(
      'plushie skeleton dog'
    );
    expect(refLabel('dnd5e:props:chest:small')).toBe('chest small');
  });

  it('never re-cases — the author keeps their own vocabulary', () => {
    expect(refLabel('dnd5e:props:Tomb-Open')).toBe('Tomb Open');
  });

  it('reads a non-ref string as itself under the same rule', () => {
    expect(refLabel('fighting_style_dueling')).toBe('fighting style dueling');
    expect(refLabel('weapon')).toBe('weapon');
    expect(refLabel('')).toBe('');
  });
});

describe('refSlug', () => {
  it('is the lowercased id for a one-part id', () => {
    expect(refSlug('dnd5e:props:pillar')).toBe('pillar');
    expect(refSlug('dnd5e:props:Tomb-Open')).toBe('tomb-open');
  });

  it('joins a multi-part id with hyphens into one token', () => {
    expect(refSlug('dnd5e:props:plushie:skeleton-dog')).toBe(
      'plushie-skeleton-dog'
    );
  });

  it('leaves underscores inside a part alone', () => {
    expect(refSlug('dnd5e:conditions:some_effect')).toBe('some_effect');
  });

  it('is null for a string that is not a ref', () => {
    expect(refSlug('pillar')).toBeNull();
  });
});

describe('isExactPropRef', () => {
  it('is true for a prop ref whose id has two or more parts', () => {
    expect(isExactPropRef('dnd5e:props:plushie:skeleton-dog')).toBe(true);
    expect(isExactPropRef('dnd5e:props:plushie:dog:skeleton')).toBe(true);
  });

  it('is false for a family ref — one id part names no model', () => {
    expect(isExactPropRef('dnd5e:props:plushie')).toBe(false);
  });

  it('is false for a non-prop ref however many parts it has', () => {
    expect(isExactPropRef('dnd5e:monsters:skeleton:captain')).toBe(false);
  });

  it('is false for a string that is not a ref', () => {
    expect(isExactPropRef('dnd5e:props:')).toBe(false);
    expect(isExactPropRef('plushie:skeleton-dog')).toBe(false);
  });
});

describe('the exact ref rpg-project#367 mints, end to end', () => {
  const REF = 'dnd5e:props:plushie:skeleton-dog';

  it('labels, slugs, and is detected as exact through the helper', () => {
    expect(refLabel(REF)).toBe('plushie skeleton dog');
    expect(refSlug(REF)).toBe('plushie-skeleton-dog');
    expect(isExactPropRef(REF)).toBe(true);
  });
});
