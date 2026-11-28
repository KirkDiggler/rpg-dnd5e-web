import type { MaterialChannelAdjustment } from '@/rendering/materialChannelTypes';
import { expect, it } from 'vitest';
import { duplicateSelection } from '../world-building/sceneState';
import {
  applyStudioActorArrange,
  applyStudioSceneArrange,
  applyStudioWallArrange,
  projectStudioArrange,
  type StudioArrangeTarget,
} from '../world-building/studioArrange';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';
import { arrangeIntent } from './StudioArrangeFields';

const values = (): MaterialChannelAdjustment[] => [
  {
    targetId: 'body',
    normal: { mode: 'scale', multiplier: 1 },
    emissive: { mode: 'off' },
  },
];
it.each(['prop', 'wall', 'npc'] as const)(
  'routes a detached %s channel edit through the existing Arrange owner',
  (kind) => {
    const doc = createPopulatedStudioDocument();
    const before = structuredClone(doc);
    const target: StudioArrangeTarget =
      kind === 'wall'
        ? { kind: 'wall', id: doc.draft.room.walls![0].id }
        : kind === 'npc'
          ? { kind: 'actor', id: doc.draft.room.monsterDeclarations[0].id }
          : { kind: 'scene', ids: [doc.draft.scene.items[0].id] };
    const selection = projectStudioArrange({
      draft: doc.draft,
      target,
      selectionRevision: 1,
    })!;
    const input = values();
    const intent = arrangeIntent(selection, { materialChannels: input });
    let result: MaterialChannelAdjustment[] | undefined;
    if (intent?.kind === 'wall-edit')
      result = applyStudioWallArrange(doc.draft, intent).appearance
        .materialChannels;
    if (intent?.kind === 'scene-edit')
      result = applyStudioSceneArrange(doc.draft.scene, intent).items[0]
        .materialChannels;
    if (intent?.kind === 'actor-start')
      result = applyStudioActorArrange(doc.draft, intent).room
        .monsterDeclarations[0].materialChannels;
    expect(result).toEqual(values());
    input[0].targetId = 'mutated';
    expect(result).toEqual(values());
    expect(doc).toEqual(before);
  }
);

it('rejects invalid late channel values without applying an earlier prop movement', () => {
  const doc = createPopulatedStudioDocument();
  const before = structuredClone(doc.draft.scene);
  expect(() =>
    applyStudioSceneArrange(doc.draft.scene, {
      kind: 'scene-edit',
      target: { kind: 'scene', ids: [doc.draft.scene.items[0].id] },
      position: { x: 4 },
      materialChannels: [
        { targetId: 'body', normal: { mode: 'scale', multiplier: 0 } },
      ],
    })
  ).toThrow(/materialChannels/);
  expect(doc.draft.scene).toEqual(before);
});

it('keeps channels on unrelated edits and detaches duplicated placements', () => {
  const doc = createPopulatedStudioDocument();
  const item = doc.draft.scene.items[0];
  item.materialChannels = values();
  const moved = applyStudioSceneArrange(doc.draft.scene, {
    kind: 'scene-edit',
    target: { kind: 'scene', ids: [item.id] },
    position: { x: 4 },
  });
  expect(moved.items[0].materialChannels).toEqual(values());
  let serial = 0;
  const duplicated = duplicateSelection(
    moved,
    [item.id],
    () => `channel-copy-${serial++}`
  );
  const copy = duplicated.scene.items.find(
    (row) => row.id === duplicated.idMap.get(item.id)
  )!;
  copy.materialChannels![0].targetId = 'copy-only';
  expect(item.materialChannels).toEqual(values());
  expect(moved.items[0].materialChannels).toEqual(values());
});
