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
  emptyDungeon,
  paintCell,
  placeAt,
  toggleExitAt,
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

const served = (...scenarios: (typeof RECOVER)[]): ScenariosState => ({
  scenarios,
  loading: false,
  error: null,
});

function mount(
  doc: DungeonDoc,
  state: ScenariosState,
  errors: ReturnType<typeof create<typeof FieldErrorSchema>>[] = [],
  onBind = vi.fn()
) {
  render(
    <ScenarioPanel doc={doc} state={state} errors={errors} onBind={onBind} />
  );
  return onBind;
}

describe('the form is whatever the server says it is', () => {
  it('renders one form per descriptor, with the rulebook’s own labels', () => {
    mount(dungeon(), served(RECOVER));
    expect(screen.getByTestId('scenario-recover-the-artifact')).toBeTruthy();
    expect(screen.getByLabelText('Artifact')).toBeTruthy();
    expect(screen.getByLabelText('Way out')).toBeTruthy();
  });

  it('shows the rulebook’s guidance sentence, unedited, while a blank is empty', () => {
    mount(dungeon(), served(RECOVER));
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
    mount(dungeon(), served(invented));
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
    mount(dungeon(), served(RECOVER));
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
    const onBind = mount(dungeon(), served(RECOVER));
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
    const onBind = mount(dungeon(), served(RECOVER));
    fireEvent.change(
      screen.getByTestId('scenario-recover-the-artifact-artifact'),
      { target: { value: '' } }
    );
    expect(onBind).toHaveBeenCalledWith('recover-the-artifact', 'artifact', '');
  });

  it('says WHY a picker is empty, in words that name the fix', () => {
    let bare = emptyDungeon();
    bare = paintCell(bare, 'region-1', p(0, 0));
    mount(bare, served(RECOVER));
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
    mount(dungeon(), served(RECOVER), [
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
    mount(dungeon(), served(RECOVER), [
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
