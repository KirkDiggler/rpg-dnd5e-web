import { create } from '@bufbuild/protobuf';
import {
  FieldErrorSchema,
  FieldType,
  ScenarioFieldSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { describe, expect, it } from 'vitest';
import {
  emptyDungeon,
  paintCell,
  placeAt,
  setStart,
  toggleExitAt,
  updatePlacement,
  type DungeonDoc,
} from './dungeonYaml';
import { fromOffset, type Axial } from './hexOffset';
import { bindOptions, emptyPickerReason, fieldRefusals } from './scenarioForm';

const p = (col: number, row: number): Axial => fromOffset('pointy', [col, row]);

const entityRef = (kind: string) =>
  create(ScenarioFieldSchema, {
    key: 'artifact',
    label: 'Artifact',
    type: FieldType.ENTITY_REF,
    kind,
    guidance: 'which placed thing is the party here to recover',
  });

/** One room, a holdable named prop, an ordinary named prop, a named
 * monster, and a way out. */
function dungeon(): DungeonDoc {
  let doc = emptyDungeon();
  for (const c of [0, 1, 2, 3]) doc = paintCell(doc, 'region-1', p(c, 0));
  doc = setStart(doc, p(0, 0));
  doc = placeAt(doc, {
    ref: 'dnd5e:props:reliquary',
    at: p(1, 0),
    blocksMovement: false,
    blocksLos: false,
  });
  doc = updatePlacement(doc, 0, { id: 'heirloom', holdable: true });
  doc = placeAt(doc, {
    ref: 'dnd5e:props:pillar',
    at: p(2, 0),
    blocksMovement: true,
    blocksLos: true,
  });
  doc = updatePlacement(doc, 1, { id: 'north-pillar' });
  doc = placeAt(doc, {
    ref: 'dnd5e:monsters:skeleton-captain',
    at: p(3, 0),
  });
  doc = updatePlacement(doc, 2, { id: 'captain' });
  doc = toggleExitAt(doc, p(0, 0));
  return doc;
}

describe('bindOptions — the picker lists this dungeon’s own ids', () => {
  it('lists only HOLDABLE props for kind "prop"', () => {
    // A picker offering the pillars would be offering a refusal.
    const options = bindOptions(dungeon(), entityRef('prop'));
    expect(options?.map((o) => o.id)).toEqual(['heirloom']);
    expect(options?.[0].label).toBe('heirloom — reliquary');
  });

  it('lists exits for kind "exit"', () => {
    expect(bindOptions(dungeon(), entityRef('exit'))?.map((o) => o.id)).toEqual(
      ['exit-1']
    );
  });

  it('lists monsters with an id for kind "monster"', () => {
    expect(
      bindOptions(dungeon(), entityRef('monster'))?.map((o) => o.id)
    ).toEqual(['captain']);
  });

  it('lists doors for kind "door"', () => {
    // A door needs a wall to stand in, so this dungeon has none — the
    // shape of the answer is what matters: a list, not null.
    expect(bindOptions(dungeon(), entityRef('door'))).toEqual([]);
  });

  it('never offers a blank id as an option', () => {
    // A hand-edited file can carry `exits: [{id: "", …}]`. An option whose
    // value is the empty string is indistinguishable from "(not set)", so
    // the author would appear to have bound something and have bound
    // nothing.
    const doc = dungeon();
    const blank = {
      ...doc,
      exits: [...doc.exits, { id: '', at: p(3, 0) }],
      doors: [{ id: '', at: doc.doors[0]?.at ?? ({} as never) }],
    };
    expect(bindOptions(blank, entityRef('exit'))?.map((o) => o.id)).toEqual([
      'exit-1',
    ]);
    expect(bindOptions(blank, entityRef('door'))).toEqual([]);
  });

  it('answers null for a kind this build has never heard of', () => {
    // `kind` is an open string on purpose. Refusing here would make this
    // client the thing that decides what a rulebook may bind; the panel
    // shows a plain id box instead and the package still validates it.
    expect(bindOptions(dungeon(), entityRef('sigil'))).toBeNull();
  });

  it('answers null for a widget type that binds nothing', () => {
    const check = create(ScenarioFieldSchema, {
      key: 'reading',
      type: FieldType.CHECK,
    });
    expect(bindOptions(dungeon(), check)).toBeNull();
    const unspecified = create(ScenarioFieldSchema, { key: 'x' });
    expect(bindOptions(dungeon(), unspecified)).toBeNull();
  });

  it('leaves out a prop that is holdable but unnamed, and a named one that is not', () => {
    let doc = dungeon();
    // Named but not holdable — the pillar, already in the fixture.
    expect(bindOptions(doc, entityRef('prop'))?.map((o) => o.id)).toEqual([
      'heirloom',
    ]);
    // Holdable is refused without an id by the mutator's own rule, so the
    // only way to be holdable is to be named.
    doc = updatePlacement(doc, 0, { id: '' });
    expect(bindOptions(doc, entityRef('prop'))).toEqual([]);
  });
});

describe('emptyPickerReason — an empty list says what to do about it', () => {
  it('names the missing holdable prop', () => {
    expect(emptyPickerReason(entityRef('prop'), [])).toContain('holdable');
  });

  it('names the missing way out and points at the tool', () => {
    expect(emptyPickerReason(entityRef('exit'), [])).toContain('Exit tool');
  });

  it('says nothing when the list is not empty, or when there is no picker', () => {
    expect(
      emptyPickerReason(entityRef('prop'), [{ id: 'a', label: 'a' }])
    ).toBeNull();
    expect(emptyPickerReason(entityRef('sigil'), null)).toBeNull();
  });
});

describe('fieldRefusals — the compiler’s sentence lands on the blank it names', () => {
  const errors = [
    create(FieldErrorSchema, {
      path: 'scenarios.recover-the-artifact.artifact',
      message: 'this scenario needs an artifact',
    }),
    create(FieldErrorSchema, {
      path: 'scenarios.recover-the-artifact.exit',
      message: 'this scenario needs a way out',
    }),
    create(FieldErrorSchema, { path: 'place[3].id', message: 'elsewhere' }),
  ];

  it('picks out the refusals addressed to one blank', () => {
    expect(fieldRefusals(errors, 'recover-the-artifact', 'artifact')).toEqual([
      'this scenario needs an artifact',
    ]);
  });

  it('takes nothing addressed anywhere else', () => {
    expect(fieldRefusals(errors, 'recover-the-artifact', 'nope')).toEqual([]);
    expect(fieldRefusals(errors, 'kill-the-captain', 'artifact')).toEqual([]);
  });
});
