import { copyDoorFramePresentation } from '@/rendering/doorFramePresentation';
import { expect, it } from 'vitest';
import { createPopulatedStudioDocument } from '../encounter-studio/fixtures/studioDocument';
import {
  parseRoomDocumentJson,
  stringifyRoomDraft,
  validateRoomDocument,
} from './roomDraft';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from './singleRoomDungeon';
import { setWallAppearance } from './structuralWallEditing';

const values = () => [
  {
    targetId: 'body',
    normal: {
      mode: 'scale' as const,
      multiplier: 1,
      futureChannel: { keep: true },
    },
    emissive: { mode: 'off' as const },
    futureRow: { label: 'retain' },
  },
];
const owners = ['prop', 'wall', 'npc', 'frame'] as const;
function withChannels(owner: (typeof owners)[number], value: unknown) {
  const doc = createPopulatedStudioDocument();
  const wall = doc.draft.room.walls![0];
  if (owner === 'prop')
    Object.assign(doc.draft.scene.items[0], { materialChannels: value });
  if (owner === 'wall')
    Object.assign(wall.appearance, { materialChannels: value });
  if (owner === 'npc')
    Object.assign(doc.draft.room.monsterDeclarations[0], {
      materialChannels: value,
    });
  if (owner === 'frame')
    Object.assign(wall.openings.find((opening) => opening.door)!.door!, {
      framePresentation: {
        span: { before: 2, after: 2 },
        faceFinishes: [],
        materialChannels: value,
      },
    });
  return doc;
}
function channels(
  doc: ReturnType<typeof withChannels>,
  owner: (typeof owners)[number]
) {
  if (owner === 'prop') return doc.draft.scene.items[0].materialChannels;
  if (owner === 'wall')
    return doc.draft.room.walls![0].appearance.materialChannels;
  if (owner === 'npc')
    return doc.draft.room.monsterDeclarations[0].materialChannels;
  return doc.draft.room.walls![0].openings.find((opening) => opening.door)!
    .door!.framePresentation?.materialChannels;
}

it.each(owners)(
  'validates channel shape at the native %s owner rather than treating it as unknown metadata',
  (owner) => {
    for (const invalid of [
      null,
      [{ targetId: 'body', normal: { mode: 'scale', multiplier: 0 } }],
      [{ targetId: 'body', normal: { mode: 'off', multiplier: 1 } }],
    ]) {
      expect(() => validateRoomDocument(withChannels(owner, invalid))).toThrow(
        /materialChannels/
      );
    }
  }
);

it.each(owners)(
  'retains Off, explicit1 and unknown native metadata at %s through save/reload',
  (owner) => {
    const original = values();
    const doc = withChannels(owner, original);
    const validated = validateRoomDocument(doc);
    const restored = parseRoomDocumentJson(
      stringifyRoomDraft(validated.draft, validated.scope)
    );
    expect(channels(restored, owner)).toEqual(original);
    original[0].normal.multiplier = 2;
    original[0].futureRow.label = 'mutated';
    expect(channels(restored, owner)).toEqual(values());
    expect(restored.draft.room.doorBindings).toEqual(
      doc.draft.room.doorBindings
    );
  }
);

it.each(owners)(
  'retains valid unavailable %s intent through the actual native YAML codec',
  (owner) => {
    const doc = withChannels(owner, values());
    const source = encodeSingleRoomDungeon({
      key: 'material-channel-roundtrip',
      draft: doc.draft,
      ...doc.scope,
    });
    const restored = decodeSingleRoomDungeon(source);
    expect(channels({ ...doc, draft: restored.draft }, owner)).toEqual(
      values()
    );
  }
);

it('rejects malformed wall edits without changing the source and detaches valid intent', () => {
  const wall = withChannels('wall', []).draft.room.walls![0];
  expect(() =>
    setWallAppearance(wall, {
      ...wall.appearance,
      materialChannels: [
        { targetId: 'body', normal: { mode: 'scale', multiplier: 0 } },
      ],
    })
  ).toThrow(/materialChannels/);
  const input = values();
  const edited = setWallAppearance(wall, {
    ...wall.appearance,
    materialChannels: input,
  });
  input[0].normal.multiplier = 2;
  expect(edited.appearance.materialChannels).toEqual(values());
  expect(wall.appearance.materialChannels).toEqual([]);
  expect(edited.line).toEqual(wall.line);
  expect(edited.openings).toEqual(wall.openings);
});

it('copies only captured frame intent and never scales dimensionless channel values', () => {
  const frame = copyDoorFramePresentation(
    { span: { before: 2, after: 3 }, materialChannels: values() },
    'frame',
    5
  )!;
  expect(frame.span).toEqual({ before: 10, after: 15 });
  expect(frame.materialChannels).toEqual([
    {
      targetId: 'body',
      normal: { mode: 'scale', multiplier: 1 },
      emissive: { mode: 'off' },
    },
  ]);
});
