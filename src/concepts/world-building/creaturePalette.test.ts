import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { createPopulatedStudioDocument } from '../encounter-studio/fixtures/studioDocument';
import {
  setActorName,
  setCreaturePalette,
  validateCreaturePalette,
} from './creaturePalette';
import { createMapLabel, renameMapLabel } from './mapLabelEdits';
import { createRoomLabel, setRegionLighting } from './regionEdits';
import {
  parseRoomDocumentJson,
  removeRoomMonster,
  resizeRoomWorkspace,
  stringifyRoomDraft,
} from './roomDraft';
import { validateScene } from './serialization';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from './singleRoomDungeon';
import { scopeFrom } from './siteScope';
const recipe = {
  id: 'guard-recipe',
  name: 'Castle Guard',
  ref: 'dnd5e:monsters:human',
  modelRef: 'dnd5e:npcs:kingdom:soldier-male-01',
};
describe('editor creature palette', () => {
  it('carries actor map names in JSON/YAML and removes only the deleted actor’s label', () => {
    const document = createPopulatedStudioDocument();
    const id = document.draft.room.monsterDeclarations[0].id;
    document.draft.scene = setActorName(
      document.draft.scene,
      id,
      'Standard Guard'
    );
    expect(setActorName(document.draft.scene, id, 'Standard Guard')).toBe(
      document.draft.scene
    );
    const stored = parseRoomDocumentJson(
      stringifyRoomDraft(document.draft, document.scope)
    );
    expect(stored).toEqual(document);
    const decoded = decodeSingleRoomDungeon(
      encodeSingleRoomDungeon({
        key: 'names',
        draft: stored.draft,
        ...stored.scope,
      })
    );
    expect(decoded.draft.scene.actorNames).toEqual({ [id]: 'Standard Guard' });
    const removed = removeRoomMonster(stored.draft, id);
    expect(removed.scene).not.toHaveProperty('actorNames');
    expect(removed.scene.version).toBe(5);
    expect(() => setActorName(document.draft.scene, id, '')).toThrow(
      /nonblank/
    );
    expect(() =>
      validateScene({ ...document.draft.scene, version: 4 })
    ).toThrow(/actorNames/);
  });
  it('persists without creating actors and survives existing label/region/lighting/resize operations', () => {
    const original = createPopulatedStudioDocument();
    let draft = {
      ...original.draft,
      scene: setCreaturePalette(original.draft.scene, [recipe]),
    };
    expect(draft.room.monsterDeclarations).toEqual(
      original.draft.room.monsterDeclarations
    );
    draft = createMapLabel(draft, 'palette-note', 'Note', { x: 0, z: 0 });
    draft = renameMapLabel(draft, 'palette-note', 'Changed');
    draft = createRoomLabel(
      draft,
      'palette-region',
      'palette-region-label',
      'Room',
      { x: 0, z: 0 }
    );
    draft = setRegionLighting(draft, 'palette-region', { background: 0.25 });
    draft = setRegionLighting(draft, 'palette-region', null);
    const document = resizeRoomWorkspace(
      { draft, scope: original.scope },
      64,
      32
    );
    expect(document.draft.scene.version).toBe(5);
    expect(document.draft.scene.creaturePalette).toEqual([recipe]);
    const stored = parseRoomDocumentJson(
      stringifyRoomDraft(document.draft, document.scope)
    );
    expect(stored).toEqual(document);
    const yaml = encodeSingleRoomDungeon({
      key: 'palette',
      draft: stored.draft,
      ...stored.scope,
    });
    const decoded = decodeSingleRoomDungeon(yaml);
    expect(decoded.draft.scene.creaturePalette).toEqual([recipe]);
    expect(
      parse(
        encodeSingleRoomDungeon({
          key: decoded.key,
          draft: decoded.draft,
          ...scopeFrom(decoded),
        })
      )
    ).toEqual(parse(yaml));
    expect(decoded.draft.room.monsterDeclarations).toEqual(
      original.draft.room.monsterDeclarations
    );
  });
  it('keeps old scenes unchanged, exact no-ops stable, and unresolved imported model refs intact', () => {
    const scene = createPopulatedStudioDocument().draft.scene;
    expect(setCreaturePalette(scene, [])).toBe(scene);
    const next = setCreaturePalette(scene, [recipe]);
    expect(setCreaturePalette(next, [recipe])).toBe(next);
    const cleared = setCreaturePalette(next, []);
    expect(cleared.version).toBe(5);
    expect(cleared).not.toHaveProperty('creaturePalette');
    expect(
      validateCreaturePalette([
        { ...recipe, modelRef: 'dnd5e:npcs:future:unknown' },
      ])[0].modelRef
    ).toBe('dnd5e:npcs:future:unknown');
    expect(() =>
      validateScene({ ...scene, creaturePalette: [recipe] })
    ).toThrow(/version 5/);
  });
  it.each([
    null,
    {},
    [recipe, recipe],
    [{ ...recipe, name: '' }],
    [{ ...recipe, ref: 'dnd5e:props:scroll' }],
    [{ ...recipe, modelRef: '' }],
    [{ ...recipe, startingCell: { q: 0, r: 0 } }],
    [{ ...recipe, hp: 20 }],
  ])('refuses malformed recipes without substituting data: %j', (value) => {
    expect(() => validateCreaturePalette(value)).toThrow();
  });
});
