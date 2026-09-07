import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { describe, expect, it } from 'vitest';
import { atlasRegionOwners, regionAt } from './atlasRegion';

function atlas(): Pick<GetAtlasResponse, 'regions'> {
  return {
    regions: [
      {
        id: 'entrance',
        cells: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
      },
      {
        id: 'tomb',
        cells: [{ x: 5, y: 5 }],
      },
    ],
  } as unknown as Pick<GetAtlasResponse, 'regions'>;
}

describe('atlasRegionOwners / regionAt', () => {
  it('maps every authored cell to its region id', () => {
    const owners = atlasRegionOwners(atlas());
    expect(owners.get('0,0')).toBe('entrance');
    expect(owners.get('1,0')).toBe('entrance');
    expect(owners.get('5,5')).toBe('tomb');
    expect(owners.get('9,9')).toBeUndefined();
  });

  it('regionAt resolves the region a position sits in', () => {
    expect(regionAt(atlas(), { x: 1, y: 0 } as never)).toBe('entrance');
    expect(regionAt(atlas(), { x: 5, y: 5 } as never)).toBe('tomb');
  });

  it('regionAt returns undefined for a position outside every region — not yet found, or not yet loaded', () => {
    expect(regionAt(atlas(), { x: 99, y: 99 } as never)).toBeUndefined();
  });

  it('regionAt returns undefined when the atlas or the position is not yet known, without throwing', () => {
    expect(regionAt(null, { x: 0, y: 0 } as never)).toBeUndefined();
    expect(regionAt(undefined, { x: 0, y: 0 } as never)).toBeUndefined();
    expect(regionAt(atlas(), null)).toBeUndefined();
    expect(regionAt(atlas(), undefined)).toBeUndefined();
  });

  it("a concealed region a member has not found simply isn't in this atlas — the lookup adds nothing back", () => {
    // The engine withholds concealed structure at the source (GetAtlas is
    // member-scoped); this lookup only reads what it is given, so a
    // position inside a still-hidden region a non-knower's atlas never
    // listed resolves the same as any other unknown position: undefined.
    const nonKnowerAtlas: Pick<GetAtlasResponse, 'regions'> = {
      regions: [{ id: 'entrance', cells: [{ x: 0, y: 0 }] }],
    } as unknown as Pick<GetAtlasResponse, 'regions'>;
    expect(regionAt(nonKnowerAtlas, { x: 5, y: 5 } as never)).toBeUndefined();
  });
});
