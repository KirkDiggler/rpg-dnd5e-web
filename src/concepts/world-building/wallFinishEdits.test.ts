// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { setActorName } from './creaturePalette';
import { setRegionLighting } from './regionEdits';
import { setRegionWallFinish } from './regionFinishEdits';
import {
  parseRoomDraftJson,
  reconcileRoomDraft,
  stringifyRoomDraft,
} from './roomDraft';
import { finishRoomFixture, GRAY_REF } from './roomFinishTestFixtures';
import { validateScene } from './serialization';
import { setWallFinishes, wallFinishFor } from './wallFinishEdits';
const small = 'dnd5e:material:test:small_gray';
describe('wall-owned face intent', () => {
  it('sets both, separates a face, clears to inheritance and preserves no-op identity', () => {
    const draft = finishRoomFixture(),
      source = structuredClone(draft.scene);
    expect(
      setWallFinishes(draft.scene, 'north', {
        'positive-z': null,
        'negative-z': null,
      })
    ).toBe(draft.scene);
    const both = setWallFinishes(draft.scene, 'north', {
      'positive-z': GRAY_REF,
      'negative-z': GRAY_REF,
    });
    expect(both.version).toBe(7);
    expect(wallFinishFor(both, 'north')).toEqual({
      'positive-z': GRAY_REF,
      'negative-z': GRAY_REF,
    });
    expect(setWallFinishes(both, 'north', { 'positive-z': GRAY_REF })).toBe(
      both
    );
    const split = setWallFinishes(both, 'north', { 'negative-z': small });
    expect(wallFinishFor(split, 'north')).toEqual({
      'positive-z': GRAY_REF,
      'negative-z': small,
    });
    const cleared = setWallFinishes(split, 'north', { 'positive-z': null });
    expect(wallFinishFor(cleared, 'north')).toEqual({ 'negative-z': small });
    const reset = setWallFinishes(cleared, 'north', { 'negative-z': null });
    expect(reset.wallFinishes).toBeUndefined();
    expect(reset.version).toBe(7);
    expect(draft.scene).toEqual(source);
  });
  it('round trips JSON and keeps7 through region/lighting/actor edits', () => {
    const draft = finishRoomFixture();
    draft.scene = setWallFinishes(draft.scene, 'north', {
      'positive-z': GRAY_REF,
    });
    expect(parseRoomDraftJson(stringifyRoomDraft(draft))).toEqual(draft);
    // No region is wall-bound now (rpg-project#725), so a region finish can
    // only be carried and cleared; clearing one must not demote the scene.
    draft.scene.regionPresentation = {
      left: {
        wallFinish: {
          materialRef: GRAY_REF,
          patternStart: {
            incoming: { wallId: 'west', direction: 'end-to-start' },
            outgoing: { wallId: 'north', direction: 'start-to-end' },
          },
        },
      },
    };
    const cleared = setRegionWallFinish(draft, 'left', null);
    expect(cleared.scene.regionPresentation).toBeUndefined();
    expect(cleared.scene.version).toBe(7);
    expect(setRegionLighting(draft, 'left', 0.5).scene.version).toBe(7);
    expect(setActorName(draft.scene, 'actor', 'Name').version).toBe(7);
  });
  it('prunes only removed walls in the existing reconciliation owner', () => {
    const draft = finishRoomFixture();
    draft.scene = setWallFinishes(
      setWallFinishes(draft.scene, 'north', { 'positive-z': GRAY_REF }),
      'south',
      { 'negative-z': small }
    );
    draft.room.walls = draft.room.walls!.filter((w) => w.id !== 'north');
    const next = reconcileRoomDraft(draft, draft.scene);
    expect(Object.keys(next.scene.wallFinishes!)).toEqual(['south']);
    expect(draft.scene.wallFinishes!.north).toBeDefined();
    expect(parseRoomDraftJson(stringifyRoomDraft(next))).toEqual(next);
  });
  it('rejects old versions, malformed rows and orphan links without discarding unavailable material refs', () => {
    const draft = finishRoomFixture();
    draft.scene = setWallFinishes(draft.scene, 'north', {
      'positive-z': 'dnd5e:material:missing:look',
    });
    expect(validateScene(draft.scene).wallFinishes).toEqual(
      draft.scene.wallFinishes
    );
    expect(() => validateScene({ ...draft.scene, version: 6 })).toThrow(
      /wallFinishes/
    );
    for (const row of [
      null,
      {},
      { front: GRAY_REF },
      { 'positive-z': null },
      { 'positive-z': 'bad' },
    ])
      expect(() =>
        validateScene({ ...draft.scene, wallFinishes: { north: row } })
      ).toThrow();
    expect(() =>
      stringifyRoomDraft({
        ...draft,
        scene: setWallFinishes(draft.scene, 'missing', {
          'positive-z': GRAY_REF,
        }),
      })
    ).toThrow(/wall.*exist/i);
  });
  it('uses own-property-safe identities rather than object prototypes', () => {
    const scene = finishRoomFixture().scene;
    expect(wallFinishFor(scene, 'constructor')).toBeUndefined();
    const next = setWallFinishes(scene, '__proto__', {
      'positive-z': GRAY_REF,
    });
    expect(Object.hasOwn(next.wallFinishes!, '__proto__')).toBe(true);
    expect(wallFinishFor(next, '__proto__')).toEqual({
      'positive-z': GRAY_REF,
    });
    expect(wallFinishFor(next, 'constructor')).toBeUndefined();
    expect(validateScene(next).wallFinishes).toEqual(next.wallFinishes);
  });
});
