import { create } from '@bufbuild/protobuf';
import {
  FieldErrorSchema,
  FieldType,
  ScenarioDescriptorSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ScenariosState } from './authoringRpc';
import {
  addFaction,
  addScenario,
  emptyDungeon,
  paintCell,
  placeAt,
  setScenarioBinding,
  toggleExitAt,
  updateFaction,
  updatePlacement,
  type DungeonDoc,
} from './dungeonYaml';
import { fromOffset, type Axial } from './hexOffset';
import { ScenarioPanel } from './ScenarioPanel';

const p = (col: number, row: number): Axial => fromOffset('pointy', [col, row]);

function dungeon(): DungeonDoc {
  let doc = emptyDungeon();
  for (const c of [0, 1]) doc = paintCell(doc, 'region-1', p(c, 0));
  doc = placeAt(doc, {
    ref: 'dnd5e:props:reliquary',
    at: p(1, 0),
    blocksMovement: false,
    blocksLos: false,
  });
  doc = updatePlacement(doc, 0, { id: 'heirloom', holdable: true });
  doc = toggleExitAt(doc, p(0, 0));
  doc = updateExitId(doc);
  return doc;
}

function updateExitId(doc: DungeonDoc): DungeonDoc {
  return { ...doc, exits: doc.exits.map((e) => ({ ...e, id: 'entrance' })) };
}

/** The rulebook's own descriptor for recover-the-artifact — the words
 * design §3.2 pins, as `ListScenarios` would send them. */
const RECOVER = create(ScenarioDescriptorSchema, {
  id: 'recover-the-artifact',
  name: 'Recover the artifact',
  fields: [
    {
      key: 'artifact',
      label: 'Artifact',
      type: FieldType.ENTITY_REF,
      kind: 'prop',
      guidance:
        'this scenario needs an artifact — which placed thing is the party here to recover',
    },
    {
      key: 'exit',
      label: 'Way out',
      type: FieldType.ENTITY_REF,
      kind: 'exit',
      guidance:
        'this scenario needs a way out — which exit counts as escaping with the artifact',
    },
  ],
});

/** The rulebook's descriptor for the hold-out, as `ListScenarios` sends it
 * — one blank, an entity_ref of kind `faction`. */
const HOLD_OUT = create(ScenarioDescriptorSchema, {
  id: 'hold-out',
  name: 'The hold-out',
  fields: [
    {
      key: 'convince',
      label: 'Convince',
      type: FieldType.ENTITY_REF,
      kind: 'faction',
      guidance:
        'which faction the party must turn — hostile until its mind learns the fact',
    },
  ],
});

const served = (...scenarios: (typeof RECOVER)[]): ScenariosState => ({
  scenarios,
  loading: false,
  error: null,
});

/** The panel reads the DOCUMENT, so a form is on screen because the file
 * binds that scenario — never because the server offers it. */
function bound(doc: DungeonDoc, ...ids: string[]): DungeonDoc {
  return ids.reduce(addScenario, doc);
}

function mount(
  doc: DungeonDoc,
  state: ScenariosState,
  errors: ReturnType<typeof create<typeof FieldErrorSchema>>[] = []
) {
  const onBind = vi.fn();
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  render(
    <ScenarioPanel
      doc={doc}
      state={state}
      errors={errors}
      onBind={onBind}
      onAdd={onAdd}
      onRemove={onRemove}
    />
  );
  return { onBind, onAdd, onRemove };
}

describe('the form is whatever the server says it is', () => {
  it('renders one form per descriptor, with the rulebook’s own labels', () => {
    mount(bound(dungeon(), 'recover-the-artifact'), served(RECOVER));
    expect(screen.getByTestId('scenario-recover-the-artifact')).toBeTruthy();
    expect(screen.getByLabelText('Artifact')).toBeTruthy();
    expect(screen.getByLabelText('Way out')).toBeTruthy();
  });

  it('shows the rulebook’s guidance sentence, unedited, while a blank is empty', () => {
    mount(bound(dungeon(), 'recover-the-artifact'), served(RECOVER));
    expect(
      screen.getByText(
        'this scenario needs an artifact — which placed thing is the party here to recover'
      )
    ).toBeTruthy();
  });

  it('renders a scenario this client has never heard of', () => {
    // THE TEST. No file in this repo knows what a sigil is, and the form
    // still draws: an id box for the kind it has no picker for, the
    // rulebook's guidance under it.
    const invented = create(ScenarioDescriptorSchema, {
      id: 'light-the-beacons',
      name: 'Light the beacons',
      fields: [
        {
          key: 'sigil',
          label: 'Sigil',
          type: FieldType.ENTITY_REF,
          kind: 'sigil',
          guidance: 'which sigil is lit',
        },
      ],
    });
    mount(bound(dungeon(), 'light-the-beacons'), served(invented));
    expect(screen.getByTestId('scenario-light-the-beacons')).toBeTruthy();
    const blank = screen.getByLabelText('Sigil') as HTMLInputElement;
    expect(blank.tagName).toBe('INPUT');
    expect(screen.getByText('which sigil is lit')).toBeTruthy();
  });

  it('says so when the server offers nothing, and invents no fallback', () => {
    mount(dungeon(), { scenarios: [], loading: false, error: null });
    expect(screen.getByTestId('scenario-panel-none').textContent).toBe(
      'no scenarios offered'
    );
    expect(screen.queryByLabelText('Artifact')).toBeNull();
  });

  it('names the transport failure rather than drawing a form anyway', () => {
    mount(dungeon(), {
      scenarios: [],
      loading: false,
      error: 'Unavailable: connection refused',
    });
    expect(screen.getByTestId('scenario-panel-error').textContent).toContain(
      'connection refused'
    );
    expect(screen.queryByLabelText('Artifact')).toBeNull();
  });
});

describe('the pickers list this dungeon’s own things', () => {
  it('offers the holdable props by id, and the exits by id', () => {
    mount(bound(dungeon(), 'recover-the-artifact'), served(RECOVER));
    const artifact = screen.getByTestId(
      'scenario-recover-the-artifact-artifact'
    ) as HTMLSelectElement;
    expect([...artifact.options].map((o) => o.value)).toEqual(['', 'heirloom']);
    const exit = screen.getByTestId(
      'scenario-recover-the-artifact-exit'
    ) as HTMLSelectElement;
    expect([...exit.options].map((o) => o.value)).toEqual(['', 'entrance']);
  });

  it('binds the picked id under the descriptor’s own key', () => {
    const { onBind } = mount(
      bound(dungeon(), 'recover-the-artifact'),
      served(RECOVER)
    );
    fireEvent.change(
      screen.getByTestId('scenario-recover-the-artifact-artifact'),
      { target: { value: 'heirloom' } }
    );
    expect(onBind).toHaveBeenCalledWith(
      'recover-the-artifact',
      'artifact',
      'heirloom'
    );
  });

  it('unbinds on the empty choice', () => {
    const { onBind } = mount(
      bound(dungeon(), 'recover-the-artifact'),
      served(RECOVER)
    );
    fireEvent.change(
      screen.getByTestId('scenario-recover-the-artifact-artifact'),
      { target: { value: '' } }
    );
    expect(onBind).toHaveBeenCalledWith('recover-the-artifact', 'artifact', '');
  });

  it('says WHY a picker is empty, in words that name the fix', () => {
    let bare = emptyDungeon();
    bare = paintCell(bare, 'region-1', p(0, 0));
    mount(bound(bare, 'recover-the-artifact'), served(RECOVER));
    expect(
      screen.getByText(/nothing in this dungeon can be picked up yet/)
    ).toBeTruthy();
    expect(screen.getByText(/no way out yet/)).toBeTruthy();
  });

  it('keeps showing a bound value that is no longer on offer', () => {
    // The author un-ticked holdable after binding. The file still says
    // `heirloom`, so the form still says `heirloom` — silently reading
    // "(not set)" would hide what the file contains.
    let doc = dungeon();
    doc = updatePlacement(doc, 0, { holdable: false });
    doc = {
      ...doc,
      scenarios: { 'recover-the-artifact': { artifact: 'heirloom' } },
    };
    mount(doc, served(RECOVER));
    const artifact = screen.getByTestId(
      'scenario-recover-the-artifact-artifact'
    ) as HTMLSelectElement;
    expect(artifact.value).toBe('heirloom');
  });
});

describe('a refusal renders on the blank it names', () => {
  it('shows the compiler’s sentence under that field, unedited', () => {
    mount(bound(dungeon(), 'recover-the-artifact'), served(RECOVER), [
      create(FieldErrorSchema, {
        path: 'scenarios.recover-the-artifact.artifact',
        message:
          'scenario "recover-the-artifact" binds artifact to "nope", and nothing in this dungeon has that id',
      }),
    ]);
    expect(
      screen.getByTestId('scenario-recover-the-artifact-artifact-refusal')
        .textContent
    ).toBe(
      'scenario "recover-the-artifact" binds artifact to "nope", and nothing in this dungeon has that id'
    );
    // And NOT on the blank beside it.
    expect(
      screen.queryByTestId('scenario-recover-the-artifact-exit-refusal')
    ).toBeNull();
  });

  it('replaces the guidance while it stands', () => {
    mount(bound(dungeon(), 'recover-the-artifact'), served(RECOVER), [
      create(FieldErrorSchema, {
        path: 'scenarios.recover-the-artifact.artifact',
        message: 'a refusal',
      }),
    ]);
    expect(
      screen.queryByText(
        'this scenario needs an artifact — which placed thing is the party here to recover'
      )
    ).toBeNull();
  });
});

describe('the hold-out form (rpg-project#375 §7): convince = a faction picker', () => {
  function camp(): DungeonDoc {
    let doc = dungeon();
    doc = placeAt(doc, { ref: 'dnd5e:monsters:goblin-boss', at: p(0, 0) });
    const chief = doc.place.length - 1;
    doc = updatePlacement(doc, chief, { id: 'chief', faction: 'goblins' });
    doc = addFaction(doc);
    return updateFaction(doc, 'faction-1', { id: 'goblins', mind: 'chief' });
  }

  it('offers the declared factions in a dropdown, and binds one', () => {
    const { onBind } = mount(bound(camp(), 'hold-out'), served(HOLD_OUT));
    const select = screen.getByTestId(
      'scenario-hold-out-convince'
    ) as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect([...select.options].map((o) => o.value)).toEqual(['', 'goblins']);
    expect(
      [...select.options].find((o) => o.value === 'goblins')?.textContent
    ).toBe('goblins — 1 monster');
    fireEvent.change(select, { target: { value: 'goblins' } });
    expect(onBind).toHaveBeenCalledWith('hold-out', 'convince', 'goblins');
  });

  it('with no faction declared, says where to declare one', () => {
    mount(bound(dungeon(), 'hold-out'), served(HOLD_OUT));
    expect(
      screen.getByTestId('scenario-hold-out-convince-blank').textContent
    ).toContain('Factions');
  });

  it('renders the scenario’s refusal under the blank, in the rulebook’s words', () => {
    mount(bound(camp(), 'hold-out'), served(HOLD_OUT), [
      create(FieldErrorSchema, {
        path: 'scenarios.hold-out.convince',
        message: 'a hold-out nobody can win: no record reveals saved-wiseman',
      }),
    ]);
    expect(
      screen.getByTestId('scenario-hold-out-convince-refusal').textContent
    ).toBe('a hold-out nobody can win: no record reveals saved-wiseman');
  });
});

describe('the tab is the document, not the registry (rpg-dnd5e-web#945)', () => {
  it('shows the chooser and nothing else when the file binds nothing', () => {
    // The panel used to draw every offered scenario's blanks on every
    // dungeon, which said a dungeon was somehow bound to all of them.
    mount(dungeon(), served(RECOVER, HOLD_OUT));
    expect(screen.getByTestId('scenario-panel-unbound')).toBeTruthy();
    expect(screen.queryByTestId('scenario-recover-the-artifact')).toBeNull();
    expect(screen.queryByTestId('scenario-hold-out')).toBeNull();
    expect(screen.queryByLabelText('Artifact')).toBeNull();
    const pick = screen.getByTestId('scenario-add-pick') as HTMLSelectElement;
    expect([...pick.options].map((o) => o.value)).toEqual([
      '',
      'recover-the-artifact',
      'hold-out',
    ]);
  });

  it('adds the one the author picks, and nothing until they press it', () => {
    const { onAdd } = mount(dungeon(), served(RECOVER, HOLD_OUT));
    const add = screen.getByTestId('scenario-add-do') as HTMLButtonElement;
    // Nothing is picked, so there is nothing to add yet.
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('scenario-add-pick'), {
      target: { value: 'hold-out' },
    });
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    expect(onAdd).toHaveBeenCalledWith('hold-out');
  });

  it('renders what the file binds, in the file’s own order, and offers the rest', () => {
    const doc = bound(dungeon(), 'hold-out');
    mount(doc, served(RECOVER, HOLD_OUT));
    expect(screen.getByTestId('scenario-hold-out')).toBeTruthy();
    expect(screen.queryByTestId('scenario-panel-unbound')).toBeNull();
    // Not the one it does not bind — and that one is what is on offer.
    expect(screen.queryByTestId('scenario-recover-the-artifact')).toBeNull();
    const pick = screen.getByTestId('scenario-add-pick') as HTMLSelectElement;
    expect([...pick.options].map((o) => o.value)).toEqual([
      '',
      'recover-the-artifact',
    ]);
  });

  it('holds several at once — the map is not a radio', () => {
    const doc = bound(dungeon(), 'hold-out', 'recover-the-artifact');
    mount(doc, served(RECOVER, HOLD_OUT));
    expect(screen.getByTestId('scenario-hold-out')).toBeTruthy();
    expect(screen.getByTestId('scenario-recover-the-artifact')).toBeTruthy();
    expect(screen.queryByTestId('scenario-add-pick')).toBeNull();
    expect(screen.getByTestId('scenario-panel-all-bound')).toBeTruthy();
  });

  it('removes one by name, leaving the others alone', () => {
    const doc = bound(dungeon(), 'hold-out', 'recover-the-artifact');
    const { onRemove } = mount(doc, served(RECOVER, HOLD_OUT));
    fireEvent.click(screen.getByTestId('scenario-hold-out-remove'));
    expect(onRemove).toHaveBeenCalledWith('hold-out');
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('shows a bound scenario this build does not offer, read only, and says why', () => {
    // THE TEST FOR FAILING CLOSED. The file is older or newer than the
    // build. Hiding the binding would mean asking an author to delete
    // something they cannot see.
    let doc = setScenarioBinding(dungeon(), 'light-the-beacons', 'sigil', 'a');
    doc = setScenarioBinding(doc, 'light-the-beacons', 'beacon', 'amon-din');
    mount(doc, served(RECOVER));
    expect(
      screen.getByTestId('scenario-light-the-beacons-unoffered').textContent
    ).toBe('this build does not offer light-the-beacons');
    // Its words, exactly as the file carries them, and not editable here.
    const beacon = screen.getByTestId(
      'scenario-light-the-beacons-beacon'
    ) as HTMLInputElement;
    expect(beacon.value).toBe('amon-din');
    expect(beacon.readOnly).toBe(true);
    // And the way out of it is the same Remove every other one has.
    expect(
      screen.getByTestId('scenario-light-the-beacons-remove')
    ).toBeTruthy();
  });

  it('offers the chooser even while a scenario nobody offers is bound', () => {
    const doc = setScenarioBinding(
      dungeon(),
      'light-the-beacons',
      'sigil',
      'a'
    );
    mount(doc, served(RECOVER));
    const pick = screen.getByTestId('scenario-add-pick') as HTMLSelectElement;
    expect([...pick.options].map((o) => o.value)).toEqual([
      '',
      'recover-the-artifact',
    ]);
  });
});
