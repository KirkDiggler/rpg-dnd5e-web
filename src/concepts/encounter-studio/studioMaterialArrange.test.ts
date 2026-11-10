import { describe, expect, it } from 'vitest';
import {
  applyStudioSceneArrange,
  applyStudioWallArrange,
  projectStudioArrange,
} from '../world-building/studioArrange';
import { readDraftYaml } from './draftFile';
import source from './fixtures/the-mad-king-walls-source.yaml?raw';
import { arrangeIntent } from './StudioArrangeFields';
const choice = {
  surfaceId: 'atlas',
  materialRef: 'dnd5e:material:fantasy-kingdom:atlas_04_c',
};
function opened() {
  const value = readDraftYaml(source);
  if (!value.ok) throw Error(value.refusal);
  return value;
}
describe('material pack through existing Arrange transactions', () => {
  it('adds and resets a previously absent wall choice without changing geometry', () => {
    const doc = opened();
    const wall = doc.draft.room.walls![0];
    const before = structuredClone(wall);
    const selection = projectStudioArrange({
      draft: doc.draft,
      target: { kind: 'wall', id: wall.id },
      selectionRevision: 1,
    })!;
    const intent = arrangeIntent(selection, { materialOverrides: [choice] });
    if (intent?.kind !== 'wall-edit') throw Error('Missing wall edit');
    const result = applyStudioWallArrange(doc.draft, intent);
    expect(result.appearance.materialOverrides).toEqual([choice]);
    expect(wall).toEqual(before);
    const stripped = structuredClone(result);
    delete stripped.appearance.materialOverrides;
    expect(stripped).toEqual(before);
    const next = { ...doc.draft, room: { ...doc.draft.room, walls: [result] } };
    const target = projectStudioArrange({
      draft: next,
      target: { kind: 'wall', id: wall.id },
      selectionRevision: 2,
    })!;
    const reset = arrangeIntent(target, { materialOverrides: [] });
    if (reset?.kind !== 'wall-edit') throw Error('Missing reset');
    expect(
      applyStudioWallArrange(next, reset).appearance.materialOverrides
    ).toEqual([]);
  });
  it('updates exactly one selected prop through the existing scene edit', () => {
    const doc = opened(),
      before = structuredClone(doc.draft.scene),
      prop = before.items[0];
    const selected = projectStudioArrange({
      draft: doc.draft,
      target: { kind: 'scene', ids: [prop.id] },
      selectionRevision: 1,
    })!;
    const intent = arrangeIntent(selected, { materialOverrides: [choice] });
    if (intent?.kind !== 'scene-edit') throw Error('Missing scene edit');
    const result = applyStudioSceneArrange(doc.draft.scene, intent);
    expect(result.items[0].materialOverrides).toEqual([choice]);
    expect(result.items.slice(1)).toEqual(before.items.slice(1));
    expect(doc.draft.scene).toEqual(before);
  });
});
