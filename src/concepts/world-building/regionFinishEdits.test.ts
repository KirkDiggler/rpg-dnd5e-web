// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { setActorName, setCreaturePalette } from './creaturePalette';
import { projectRegionWallBoundaries } from './regionBoundaryGeometry';
import { setRegionLighting } from './regionEdits';
import { setRegionWallFinish } from './regionFinishEdits';
import type { RoomWallFinish } from './regionFinishTypes';
import {
  parseRoomDraftJson,
  stringifyRoomDraft,
  type RoomDraft,
} from './roomDraft';
import { finishRoomFixture, GRAY_REF } from './roomFinishTestFixtures';
import { validateScene } from './serialization';

const CARRIED: RoomWallFinish = {
  materialRef: GRAY_REF,
  patternStart: {
    incoming: { wallId: 'west', direction: 'end-to-start' },
    outgoing: { wallId: 'north', direction: 'start-to-end' },
  },
};

/** A saved finish, written straight into the document: no edit can choose
 * one now, because no region is wall-bound (rpg-project#725). */
function carried(): RoomDraft {
  const draft = finishRoomFixture();
  return {
    ...draft,
    scene: {
      ...draft.scene,
      version: 6,
      regionPresentation: { left: { wallFinish: structuredClone(CARRIED) } },
    },
  };
}

describe('saved region wall finish', () => {
  // Regions are their cells and name no wall face (rpg-project#725), so a
  // finish can no longer be chosen; it is refused with the boundary's reason.
  it('refuses to choose a finish for a region that is not wall-bound, leaving the input untouched', () => {
    const original = finishRoomFixture(),
      snapshot = structuredClone(original);
    expect(projectRegionWallBoundaries(original)).toEqual([
      { id: 'room-region', status: 'unresolved', reason: 'not-wall-bound' },
      { id: 'left', status: 'unresolved', reason: 'not-wall-bound' },
    ]);
    expect(setRegionWallFinish(original, 'left', null)).toBe(original);
    expect(() =>
      setRegionWallFinish(original, 'left', { materialRef: GRAY_REF })
    ).toThrow('Wall-bound region required: not-wall-bound.');
    expect(() =>
      setRegionWallFinish(carried(), 'left', {
        patternStart: CARRIED.patternStart,
      })
    ).toThrow('Wall-bound region required: not-wall-bound.');
    expect(original).toEqual(snapshot);
  });

  it('carries a saved finish through JSON and other scene edits without demotion', () => {
    const draft = carried();
    expect(parseRoomDraftJson(stringifyRoomDraft(draft))).toEqual(draft);
    const dimmed = setRegionLighting(draft, 'left', 0.2);
    expect(dimmed.scene.version).toBe(6);
    expect(dimmed.scene.regionPresentation).toEqual(
      draft.scene.regionPresentation
    );
    expect(setActorName(draft.scene, 'actor', 'Name').version).toBe(6);
    expect(
      setCreaturePalette(draft.scene, [
        {
          id: 'recipe',
          name: 'Guard',
          ref: 'dnd5e:monsters:goblin',
          modelRef: 'dnd5e:npcs:test:guard',
        },
      ]).version
    ).toBe(6);
  });

  it('clears a carried finish and keeps the scene version', () => {
    const cleared = setRegionWallFinish(carried(), 'left', null);
    expect(cleared.scene.regionPresentation).toBeUndefined();
    expect(cleared.scene.version).toBe(6);
  });

  it('rejects old-version finishes but retains shape-valid unavailable intent on load', () => {
    const draft = carried();
    expect(() => validateScene({ ...draft.scene, version: 5 })).toThrow(
      /wallFinish/
    );
    const scene = structuredClone(draft.scene);
    scene.regionPresentation!.left.wallFinish!.patternStart.incoming.wallId =
      'removed-wall';
    expect(validateScene(scene).regionPresentation!.left.wallFinish).toEqual(
      scene.regionPresentation!.left.wallFinish
    );
  });

  it('refuses a missing region', () => {
    expect(() => setRegionWallFinish(carried(), 'missing', null)).toThrow(
      /exists/
    );
  });
});
