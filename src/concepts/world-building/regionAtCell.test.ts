// @vitest-environment node
import { cubeToWorld, HEX_SIZE } from '@/components/hex-grid/hexMath';
import { describe, expect, it } from 'vitest';
import type { AuthoringRegion, RegionResolution } from './authoringRegions';
import { regionsAtCell } from './regionAtCell';
import { createRoomDraft, type RoomDraft } from './roomDraft';
import { createEmptyScene } from './sceneState';

function draftWith(regions: AuthoringRegion[]): RoomDraft {
  const draft = createRoomDraft(createEmptyScene('scene'), 'room');
  return {
    ...draft,
    scene: { ...draft.scene, authoringRegions: regions },
  };
}
const region = (id: string): AuthoringRegion => ({
  id,
  labelId: `${id}-label`,
  boundary: { kind: 'automatic' },
});
const square = (
  half: number
): Extract<RegionResolution, { status: 'resolved' }>['area'] => ({
  kind: 'polygon',
  ring: [
    { x: -half, z: -half },
    { x: half, z: -half },
    { x: half, z: half },
    { x: -half, z: half },
  ],
});
const centre = (q: number, r: number) =>
  cubeToWorld({ x: q, y: -q - r, z: r }, HEX_SIZE);

describe('regionsAtCell', () => {
  it('polygon region contains its interior hex', () => {
    const draft = draftWith([region('hall')]);
    const resolutions: RegionResolution[] = [
      { id: 'hall', status: 'resolved', area: square(3) },
    ];
    expect(
      regionsAtCell({ draft, resolutions, cell: { q: 0, r: 0 } }).map(
        (r) => r.id
      )
    ).toEqual(['hall']);
    const far = centre(6, 0);
    expect(Math.abs(far.x)).toBeGreaterThan(3);
    expect(regionsAtCell({ draft, resolutions, cell: { q: 6, r: 0 } })).toEqual(
      []
    );
  });

  it('hex-union region contains listed cells only', () => {
    const draft = draftWith([region('nook')]);
    const resolutions: RegionResolution[] = [
      {
        id: 'nook',
        status: 'resolved',
        area: { kind: 'hex-union', cells: [{ q: 1, r: 1 }] },
      },
    ];
    expect(
      regionsAtCell({ draft, resolutions, cell: { q: 1, r: 1 } }).map(
        (r) => r.id
      )
    ).toEqual(['nook']);
    expect(regionsAtCell({ draft, resolutions, cell: { q: 0, r: 1 } })).toEqual(
      []
    );
  });

  it('unresolved region is never reported', () => {
    const draft = draftWith([region('hall')]);
    const resolutions = [
      { id: 'hall', status: 'unresolved', reason: 'unbound' },
    ] as unknown as RegionResolution[];
    expect(regionsAtCell({ draft, resolutions, cell: { q: 0, r: 0 } })).toEqual(
      []
    );
  });

  it('overlapping regions are both reported in authored order', () => {
    const draft = draftWith([region('outer'), region('inner')]);
    const resolutions: RegionResolution[] = [
      {
        id: 'inner',
        status: 'resolved',
        area: { kind: 'hex-union', cells: [{ q: 0, r: 0 }] },
      },
      { id: 'outer', status: 'resolved', area: square(4) },
    ];
    expect(
      regionsAtCell({ draft, resolutions, cell: { q: 0, r: 0 } }).map(
        (r) => r.id
      )
    ).toEqual(['outer', 'inner']);
  });
});
