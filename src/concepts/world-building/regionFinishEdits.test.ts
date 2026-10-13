// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { setActorName, setCreaturePalette } from './creaturePalette';
import { moveMapLabel } from './mapLabelEdits';
import { projectRegionWallBoundaries } from './regionBoundaryGeometry';
import { setExplicitRegionArea, setRegionLighting } from './regionEdits';
import { setRegionWallFinish } from './regionFinishEdits';
import { parseRoomDraftJson, stringifyRoomDraft } from './roomDraft';
import { finishRoomFixture, GRAY_REF } from './roomFinishTestFixtures';
import { validateScene } from './serialization';

describe('saved region wall finish', () => {
  it('chooses once, preserves anchor on material changes and returns the input for no-op/reset', () => {
    const original = finishRoomFixture(),
      snapshot = structuredClone(original);
    expect(setRegionWallFinish(original, 'left', null)).toBe(original);
    const draft = setRegionWallFinish(original, 'left', {
      materialRef: GRAY_REF,
    });
    expect(draft.scene.version).toBe(6);
    const finish = draft.scene.authoringRegions![0].wallFinish!;
    expect(finish.materialRef).toBe(GRAY_REF);
    expect(setRegionWallFinish(draft, 'left', { materialRef: GRAY_REF })).toBe(
      draft
    );
    const changed = setRegionWallFinish(draft, 'left', {
      materialRef: 'dnd5e:material:test:small_gray',
    });
    expect(changed.scene.authoringRegions![0].wallFinish!.patternStart).toEqual(
      finish.patternStart
    );
    expect(setRegionWallFinish(changed, 'left', null).scene.version).toBe(6);
    expect(original).toEqual(snapshot);
  });
  it('persists source identity through JSON, label motion and other scene edits without demotion', () => {
    const draft = setRegionWallFinish(finishRoomFixture(), 'left', {
      materialRef: GRAY_REF,
    });
    expect(parseRoomDraftJson(stringifyRoomDraft(draft))).toEqual(draft);
    const moved = moveMapLabel(draft, 'left-label', { x: 3, z: 2 });
    expect(moved.scene.authoringRegions).toEqual(draft.scene.authoringRegions);
    expect(
      setRegionLighting(draft, 'left', { background: 0.2 }).scene.version
    ).toBe(6);
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
  it('rejects old-version/invalid fields but retains shape-valid unavailable intent on load', () => {
    const draft = setRegionWallFinish(finishRoomFixture(), 'left', {
      materialRef: GRAY_REF,
    });
    expect(() => validateScene({ ...draft.scene, version: 5 })).toThrow(
      /wallFinish/
    );
    const region = draft.scene.authoringRegions![0];
    region.wallFinish!.patternStart.incoming.wallId = 'removed-wall';
    expect(validateScene(draft.scene).authoringRegions![0].wallFinish).toEqual(
      region.wallFinish
    );
    expect(() =>
      setRegionWallFinish(draft, 'left', {
        materialRef: 'dnd5e:material:test:small_gray',
      })
    ).toThrow(/pattern/i);
  });
  it('repairs only to an existing offered corner and refuses explicit/unresolved regions', () => {
    const draft = setRegionWallFinish(finishRoomFixture(), 'left', {
      materialRef: GRAY_REF,
    });
    const boundary = projectRegionWallBoundaries(draft)[0];
    if (boundary.status !== 'resolved') throw new Error(boundary.reason);
    const next = setRegionWallFinish(draft, 'left', {
      patternStart: boundary.corners[1].reference,
    });
    expect(next.scene.authoringRegions![0].wallFinish!.patternStart).toEqual(
      boundary.corners[1].reference
    );
    expect(() =>
      setRegionWallFinish(
        setExplicitRegionArea(draft, 'left', [{ q: 0, r: 0 }]),
        'left',
        { materialRef: GRAY_REF }
      )
    ).toThrow(/wall-bound/);
    expect(() => setRegionWallFinish(draft, 'missing', null)).toThrow(/exists/);
  });
});
