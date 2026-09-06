/**
 * The Factions and Dispositions sections, the predicate editor, the
 * placement's faction dropdown and the intel form's reveals kind
 * (rpg-project#375 §7) — mounted through the real Inspector and asserted
 * on the DOM it renders, so every test here would FAIL if a section did
 * not put its dropdowns on screen.
 */
import { create } from '@bufbuild/protobuf';
import {
  FieldErrorSchema,
  type FieldError,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConcealmentDerivation } from './dungeonYaml';
import {
  addDisposition,
  addEnding,
  addFaction,
  addIntel,
  emptyDungeon,
  paintCell,
  placeAt,
  PREDICATE_SHAPE,
  setIntelReveals,
  setScenarioBinding,
  updateDisposition,
  updateEnding,
  updateFaction,
  updatePlacement,
  type DungeonDoc,
  type PredicateDoc,
} from './dungeonYaml';
import {
  factionRefusals,
  NAME_A_MIND,
  NO_RECORD_REVEALS_THIS,
  refusalsAt,
} from './factionRules';
import { fromOffset } from './hexOffset';
import { Inspector } from './Inspector';
import type { Selection } from './types';

const p = (c: number, r: number) => fromOffset('pointy', [c, r]);
const noop = () => {};
const EMPTY_CONCEALMENT: ConcealmentDerivation = {
  regionIds: new Set(),
  doorByRegion: new Map(),
};

/** The camp of design §1 on a strip: a named prop (the letter), a named
 * chief and scout in `goblins` with the chief as mind, an unnamed goblin
 * on `monsters`, one record revealing `saved-wiseman`, and the hostile
 * disposition waiting on it. */
function camp(): DungeonDoc {
  let doc = emptyDungeon();
  for (let c = 0; c < 5; c += 1) doc = paintCell(doc, 'region-1', p(c, 0));
  doc = placeAt(doc, {
    ref: 'dnd5e:props:scroll',
    at: p(0, 0),
    blocksMovement: false,
    blocksLos: false,
  });
  doc = placeAt(doc, { ref: 'dnd5e:monsters:goblin-boss', at: p(1, 0) });
  doc = placeAt(doc, { ref: 'dnd5e:monsters:goblin', at: p(2, 0) });
  doc = placeAt(doc, { ref: 'dnd5e:monsters:goblin', at: p(3, 0) });
  doc = updatePlacement(doc, 0, { id: 'letter' });
  doc = updatePlacement(doc, 1, { id: 'chief', faction: 'goblins' });
  doc = updatePlacement(doc, 2, { id: 'scout', faction: 'goblins' });
  doc = addFaction(doc);
  doc = updateFaction(doc, 'faction-1', { id: 'goblins', mind: 'chief' });
  doc = addIntel(doc);
  doc = setIntelReveals(doc, 'intel-1', 'fact', 'saved-wiseman');
  doc = addDisposition(doc);
  return updateDisposition(doc, 0, { until: { fact: 'saved-wiseman' } });
}

type Handlers = Partial<{
  onAddEnding: () => void;
  onEnding: (index: number, patch: Record<string, unknown>) => void;
  onRemoveEnding: (index: number) => void;
  onFaction: (id: string, patch: Record<string, unknown>) => void;
  onRemoveFaction: (id: string) => void;
  onAddDisposition: () => void;
  onDisposition: (index: number, patch: Record<string, unknown>) => void;
  onRemoveDisposition: (index: number) => void;
  onPlacement: (index: number, patch: Record<string, unknown>) => void;
  onIntelReveals: (id: string, key: string, value: string) => void;
}>;

function mountAt(
  doc: DungeonDoc,
  selection: Selection = { kind: 'dungeon' },
  h: Handlers = {},
  errors: FieldError[] = []
) {
  return render(
    <Inspector
      doc={doc}
      concealment={EMPTY_CONCEALMENT}
      selection={selection}
      onDungeon={noop}
      onRegion={noop}
      onRemoveRegion={noop}
      onDoor={noop}
      onRemoveDoor={noop}
      onPlacement={h.onPlacement ?? noop}
      onRemovePlacement={noop}
      onRemoveWall={noop}
      onSetWallHeight={noop}
      onSetWallName={noop}
      onExit={noop}
      onRemoveExit={noop}
      errors={errors}
      onStartFacing={noop}
      onAddIntel={noop}
      onIntel={noop}
      onIntelReveals={h.onIntelReveals ?? noop}
      onIntelHolders={noop}
      onRemoveIntel={noop}
      onAddFaction={noop}
      onFaction={h.onFaction ?? noop}
      onRemoveFaction={h.onRemoveFaction ?? noop}
      onAddDisposition={h.onAddDisposition ?? noop}
      onDisposition={h.onDisposition ?? noop}
      onRemoveDisposition={h.onRemoveDisposition ?? noop}
      onAddEnding={h.onAddEnding ?? noop}
      onEnding={h.onEnding ?? noop}
      onRemoveEnding={h.onRemoveEnding ?? noop}
      onSelect={noop}
    />
  );
}

const optionValues = (id: string) =>
  [...(screen.getByTestId(id) as HTMLSelectElement).options].map(
    (o) => o.value
  );
const selectValue = (id: string) =>
  (screen.getByTestId(id) as HTMLSelectElement).value;

describe('the Factions section (rpg-project#375 §7)', () => {
  it('lists the faction with its id and a mind dropdown of its NAMED members', () => {
    mountAt(camp());
    expect(screen.getByTestId('factions-section')).toBeTruthy();
    expect((screen.getByTestId('faction-0-id') as HTMLInputElement).value).toBe(
      'goblins'
    );
    // The chief and the scout are named goblins; the third goblin is on
    // `monsters` and the letter is a prop — neither can be a mind.
    expect(optionValues('faction-0-mind')).toEqual(['', 'chief', 'scout']);
    expect(selectValue('faction-0-mind')).toBe('chief');
    expect(screen.getByTestId('faction-0-members').textContent).toContain(
      '2 members: chief, scout'
    );
  });

  it('says so when there are none, and offers the verb', () => {
    mountAt(emptyDungeon());
    expect(screen.getByTestId('factions-section').textContent).toContain(
      'none'
    );
    expect(screen.getByTestId('new-faction')).toBeTruthy();
  });

  it('re-minds a faction, and clears the mind', () => {
    const onFaction = vi.fn();
    mountAt(camp(), { kind: 'dungeon' }, { onFaction });
    fireEvent.change(screen.getByTestId('faction-0-mind'), {
      target: { value: 'scout' },
    });
    expect(onFaction).toHaveBeenCalledWith('goblins', { mind: 'scout' });
    fireEvent.change(screen.getByTestId('faction-0-mind'), {
      target: { value: '' },
    });
    expect(onFaction).toHaveBeenLastCalledWith('goblins', { mind: '' });
  });

  it('renames a faction, refuses a blank or a clash in place, and lets `party` through to the refusal', () => {
    const onFaction = vi.fn();
    let doc = addFaction(camp());
    mountAt(doc, { kind: 'dungeon' }, { onFaction });
    fireEvent.change(screen.getByTestId('faction-1-id'), {
      target: { value: 'wolves' },
    });
    expect(onFaction).toHaveBeenCalledWith('faction-2', { id: 'wolves' });
    onFaction.mockClear();
    fireEvent.change(screen.getByTestId('faction-1-id'), {
      target: { value: 'goblins' },
    });
    expect(onFaction).not.toHaveBeenCalled();
    expect(screen.getByTestId('faction-1-id-refusal').textContent).toContain(
      'already called "goblins"'
    );
    fireEvent.change(screen.getByTestId('faction-1-id'), {
      target: { value: '' },
    });
    expect(onFaction).not.toHaveBeenCalled();
    expect(screen.getByTestId('faction-1-id-refusal').textContent).toContain(
      'needs a name'
    );
    // `party` is written and refused by the same sentence a loaded file
    // gets — the design's wording, at the field it names.
    fireEvent.change(screen.getByTestId('faction-1-id'), {
      target: { value: 'party' },
    });
    expect(onFaction).toHaveBeenCalledWith('faction-2', { id: 'party' });
    doc = updateFaction(doc, 'faction-2', { id: 'party' });
    mountAt(doc);
    expect(
      screen.getAllByTestId('faction-1-id-refusal')[0].textContent
    ).toContain('`party` is the players');
  });

  it('a faction of many waiting on a fact with no mind: the refusal is the design’s own sentence, under mind', () => {
    const doc = updateFaction(camp(), 'goblins', { mind: '' });
    mountAt(doc);
    expect(screen.getByTestId('faction-0-mind-refusal').textContent).toBe(
      NAME_A_MIND
    );
  });

  it('a mind outside its faction stays selectable and is refused by name', () => {
    const doc = updateFaction(camp(), 'goblins', { mind: 'letter' });
    mountAt(doc);
    expect(selectValue('faction-0-mind')).toBe('letter');
    expect(screen.getByTestId('faction-0-mind-refusal').textContent).toContain(
      'is a prop — a mind is a monster in the faction'
    );
  });

  it('says what to do when no member is named yet', () => {
    let doc = updatePlacement(camp(), 1, { id: '' });
    doc = updatePlacement(doc, 2, { id: '' });
    doc = updateFaction(doc, 'goblins', { mind: '' });
    mountAt(doc);
    expect(screen.getByTestId('faction-0-no-mind').textContent).toContain(
      'name a monster'
    );
  });

  it('a declared `monsters` faction offers the unauthored monsters as its mind', () => {
    let doc = updatePlacement(camp(), 3, { id: 'stray' });
    doc = addFaction(doc);
    doc = updateFaction(doc, 'faction-2', { id: 'monsters' });
    mountAt(doc);
    // The stray has no faction key; the chief and the scout are goblins.
    expect(optionValues('faction-1-mind')).toEqual(['', 'stray']);
    expect(screen.queryByTestId('faction-1-id-refusal')).toBeNull();
    // And the placement panel does not list the side twice.
    mountAt(doc, { kind: 'placement', index: 3 });
    expect(optionValues('placement-faction')).toEqual(['', 'goblins']);
  });

  it('removes a faction', () => {
    const onRemoveFaction = vi.fn();
    mountAt(camp(), { kind: 'dungeon' }, { onRemoveFaction });
    fireEvent.click(screen.getByTestId('faction-0-remove'));
    expect(onRemoveFaction).toHaveBeenCalledWith('goblins');
  });
});

describe('the Dispositions section (rpg-project#375 §7)', () => {
  it('renders the pair as two faction dropdowns (party included), the stance, and the until editor', () => {
    mountAt(camp());
    expect(screen.getByTestId('dispositions-section')).toBeTruthy();
    expect(optionValues('disposition-0-a')).toEqual([
      'goblins',
      'party',
      'monsters',
    ]);
    expect(optionValues('disposition-0-b')).toEqual([
      'goblins',
      'party',
      'monsters',
    ]);
    expect(selectValue('disposition-0-a')).toBe('goblins');
    expect(selectValue('disposition-0-b')).toBe('party');
    expect(optionValues('disposition-0-stance')).toEqual([
      'hostile',
      'neutral',
      'allied',
    ]);
    expect(selectValue('disposition-0-stance')).toBe('hostile');
    expect(selectValue('disposition-0-until-form')).toBe('fact');
    expect(
      (screen.getByTestId('disposition-0-until-fact') as HTMLInputElement).value
    ).toBe('saved-wiseman');
  });

  it('cannot add one until a faction exists, and says why', () => {
    mountAt(emptyDungeon());
    expect(
      (screen.getByTestId('new-disposition') as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByTestId('dispositions-none').textContent).toContain(
      'declare a faction first'
    );
    const onAddDisposition = vi.fn();
    mountAt(camp(), { kind: 'dungeon' }, { onAddDisposition });
    const [enabled] = screen
      .getAllByTestId('new-disposition')
      .filter((b) => !(b as HTMLButtonElement).disabled);
    fireEvent.click(enabled);
    expect(onAddDisposition).toHaveBeenCalled();
  });

  it('changes the pair and the stance', () => {
    const onDisposition = vi.fn();
    mountAt(camp(), { kind: 'dungeon' }, { onDisposition });
    fireEvent.change(screen.getByTestId('disposition-0-b'), {
      target: { value: 'goblins' },
    });
    expect(onDisposition).toHaveBeenCalledWith(0, {
      between: ['goblins', 'goblins'],
    });
    fireEvent.change(screen.getByTestId('disposition-0-stance'), {
      target: { value: 'neutral' },
    });
    expect(onDisposition).toHaveBeenLastCalledWith(0, { stance: 'neutral' });
  });

  it('shows the until editor for hostile ONLY', () => {
    const doc = updateDisposition(camp(), 0, { stance: 'allied' });
    mountAt(doc);
    expect(screen.queryByTestId('disposition-0-until')).toBeNull();
  });

  it('a hand-written until on a neutral pair: shown as written, refused at the until', () => {
    let doc = camp();
    doc = {
      ...doc,
      dispositions: [{ ...doc.dispositions[0], stance: 'neutral' }],
    };
    mountAt(doc);
    expect(screen.queryByTestId('disposition-0-until')).toBeNull();
    expect(
      screen.getByTestId('disposition-0-until-readout').textContent
    ).toContain('{ fact: saved-wiseman }');
    expect(
      screen.getByTestId('disposition-0-until-refusal').textContent
    ).toContain('only a hostile pair has something to stop doing');
  });

  it('renders the compiler’s refusals on the lines it addresses them to, beside the client’s, once each', () => {
    const doc = updateFaction(camp(), 'goblins', { mind: '' });
    const composed = refusalsAt(
      factionRefusals(doc),
      'dispositions[0].until'
    )[0];
    mountAt(doc, { kind: 'dungeon' }, {}, [
      create(FieldErrorSchema, {
        path: 'dispositions[0].until',
        message: composed,
      }),
      create(FieldErrorSchema, {
        path: 'dispositions[0].between[1]',
        message: 'faction "party" is not… (a sentence only the compiler makes)',
      }),
      create(FieldErrorSchema, {
        path: 'factions[0].id',
        message: 'a server-only sentence about the id',
      }),
    ]);
    // The same sentence from both sides is one line.
    expect(screen.getAllByTestId('disposition-0-until-refusal')).toHaveLength(
      1
    );
    expect(
      screen.getByTestId('disposition-0-between-refusal').textContent
    ).toContain('only the compiler makes');
    expect(screen.getByTestId('faction-0-id-refusal').textContent).toBe(
      'a server-only sentence about the id'
    );
  });

  it('refuses a second disposition for one pair, at its pair', () => {
    let doc = addDisposition(camp());
    doc = updateDisposition(doc, 1, { between: ['party', 'goblins'] });
    mountAt(doc);
    expect(
      screen.getByTestId('disposition-1-between-refusal').textContent
    ).toContain('already have a disposition');
    expect(screen.queryByTestId('disposition-0-between-refusal')).toBeNull();
  });

  it('keeps a faction the file names that is no longer declared, and refuses it', () => {
    const doc = updateDisposition(camp(), 0, { between: ['wolves', 'party'] });
    mountAt(doc);
    expect(selectValue('disposition-0-a')).toBe('wolves');
    expect(
      screen.getByTestId('disposition-0-between-refusal').textContent
    ).toContain('"wolves" is not a faction in this dungeon');
  });

  it('removes one', () => {
    const onRemoveDisposition = vi.fn();
    mountAt(camp(), { kind: 'dungeon' }, { onRemoveDisposition });
    fireEvent.click(screen.getByTestId('disposition-0-remove'));
    expect(onRemoveDisposition).toHaveBeenCalledWith(0);
  });
});

describe('the predicate editor — one component, four forms (§7)', () => {
  const withUntil = (until: PredicateDoc | undefined) =>
    updateDisposition(camp(), 0, { until });

  it('offers (none) and the four forms', () => {
    mountAt(withUntil(undefined));
    expect(optionValues('disposition-0-until-form')).toEqual([
      '',
      'round',
      'down',
      'fact',
      'stance',
    ]);
    expect(selectValue('disposition-0-until-form')).toBe('');
    expect(screen.getByTestId('disposition-0-until').textContent).toContain(
      'the hostility never ends'
    );
  });

  it('round: a number counted from 1', () => {
    const onDisposition = vi.fn();
    const six = mountAt(
      withUntil({ round: 6 }),
      { kind: 'dungeon' },
      { onDisposition }
    );
    const box = screen.getByTestId(
      'disposition-0-until-round'
    ) as HTMLInputElement;
    expect(box.value).toBe('6');
    expect(box.min).toBe('1');
    fireEvent.change(box, { target: { value: '3' } });
    expect(onDisposition).toHaveBeenCalledWith(0, { until: { round: 3 } });
    // A round on an until is not built yet (R11) — the compiler's one
    // sentence — and the round itself is judged at its own sub-path.
    six.unmount();
    mountAt(withUntil({ round: 0 }));
    expect(
      screen
        .getAllByTestId('disposition-0-until-refusal')
        .map((n) => n.textContent)
    ).toEqual([
      'in this version a disposition turns only on a fact; `until` on a round, a fall, or another stance is not built yet',
    ]);
  });

  it('down: a dropdown of the NAMED monsters', () => {
    const onDisposition = vi.fn();
    const chief = mountAt(
      withUntil({ down: 'chief' }),
      { kind: 'dungeon' },
      { onDisposition }
    );
    // The letter is a prop and the third goblin has no id.
    expect(optionValues('disposition-0-until-down')).toEqual([
      'chief',
      'scout',
    ]);
    fireEvent.change(screen.getByTestId('disposition-0-until-down'), {
      target: { value: 'scout' },
    });
    expect(onDisposition).toHaveBeenCalledWith(0, { until: { down: 'scout' } });
    chief.unmount();
    mountAt(withUntil({ down: 'nobody' }));
    expect(
      screen.getAllByTestId('disposition-0-until-refusal')[0].textContent
    ).toContain('not built yet');
  });

  it('a form picked and not filled in is refused at the form’s own field', () => {
    // The refusal lands at `dispositions[0].until.fact`, a SUB-PATH of the
    // until — the same path set an `arrives` and an ending's `when` read,
    // which is why the disposition renders it too.
    mountAt(withUntil({ fact: '' }));
    expect(
      screen.getAllByTestId('disposition-0-until-refusal')[0].textContent
    ).toBe(`this predicate's \`fact\` says nothing — ${PREDICATE_SHAPE}`);
  });

  it('fact: free text with the revealed facts as suggestions, and the cost note', () => {
    const onDisposition = vi.fn();
    mountAt(
      withUntil({ fact: 'saved-wiseman' }),
      { kind: 'dungeon' },
      {
        onDisposition,
      }
    );
    const list = screen.getByTestId(
      'disposition-0-until-fact-suggestions'
    ) as HTMLDataListElement;
    expect([...list.options].map((o) => o.value)).toEqual(['saved-wiseman']);
    expect(screen.queryByTestId('disposition-0-until-note')).toBeNull();
    fireEvent.change(screen.getByTestId('disposition-0-until-fact'), {
      target: { value: 'chief-is-a-fraud' },
    });
    expect(onDisposition).toHaveBeenCalledWith(0, {
      until: { fact: 'chief-is-a-fraud' },
    });
    // Free text stays legal; an unrevealed fact is shown with its cost.
    mountAt(withUntil({ fact: 'chief-is-a-fraud' }));
    expect(screen.getByTestId('disposition-0-until-note').textContent).toBe(
      NO_RECORD_REVEALS_THIS
    );
  });

  it('stance: two faction dropdowns and the stance it folds to', () => {
    const onDisposition = vi.fn();
    mountAt(
      withUntil({
        stance: { between: ['goblins', 'party'], is: 'neutral' },
      }),
      { kind: 'dungeon' },
      { onDisposition }
    );
    expect(optionValues('disposition-0-until-stance-a')).toEqual([
      'goblins',
      'party',
      'monsters',
    ]);
    expect(selectValue('disposition-0-until-stance-b')).toBe('party');
    expect(selectValue('disposition-0-until-stance-is')).toBe('neutral');
    fireEvent.change(screen.getByTestId('disposition-0-until-stance-is'), {
      target: { value: 'allied' },
    });
    expect(onDisposition).toHaveBeenCalledWith(0, {
      until: {
        stance: { between: ['goblins', 'party'], is: 'allied' },
      },
    });
  });

  it('switching form starts each one with what the dungeon offers', () => {
    const onDisposition = vi.fn();
    mountAt(withUntil(undefined), { kind: 'dungeon' }, { onDisposition });
    const form = screen.getByTestId('disposition-0-until-form');
    fireEvent.change(form, { target: { value: 'round' } });
    expect(onDisposition).toHaveBeenLastCalledWith(0, { until: { round: 1 } });
    fireEvent.change(form, { target: { value: 'down' } });
    expect(onDisposition).toHaveBeenLastCalledWith(0, {
      until: { down: 'chief' },
    });
    fireEvent.change(form, { target: { value: 'fact' } });
    expect(onDisposition).toHaveBeenLastCalledWith(0, { until: { fact: '' } });
    fireEvent.change(form, { target: { value: 'stance' } });
    expect(onDisposition).toHaveBeenLastCalledWith(0, {
      until: {
        stance: { between: ['goblins', 'party'], is: 'neutral' },
      },
    });
    fireEvent.change(form, { target: { value: '' } });
    expect(onDisposition).toHaveBeenLastCalledWith(0, { until: undefined });
  });
});

describe('the placement inspector’s faction (§7)', () => {
  it('a monster gets the dropdown: `monsters` for absent, then the declared factions', () => {
    const onPlacement = vi.fn();
    mountAt(camp(), { kind: 'placement', index: 1 }, { onPlacement });
    expect(optionValues('placement-faction')).toEqual(['', 'goblins']);
    expect(selectValue('placement-faction')).toBe('goblins');
    fireEvent.change(screen.getByTestId('placement-faction'), {
      target: { value: '' },
    });
    expect(onPlacement).toHaveBeenCalledWith(1, { faction: '' });
    // The unauthored goblin shows `monsters`, and the note says what that is.
    mountAt(camp(), { kind: 'placement', index: 3 });
    expect(screen.getAllByTestId('placement-faction')[1]).toBeTruthy();
    expect(
      (screen.getAllByTestId('placement-faction')[1] as HTMLSelectElement).value
    ).toBe('');
    expect(
      screen.getAllByTestId('placement-faction-note')[1].textContent
    ).toContain('`monsters`');
  });

  it('a prop has no faction control', () => {
    mountAt(camp(), { kind: 'placement', index: 0 });
    expect(screen.queryByTestId('placement-faction')).toBeNull();
  });

  it('an unknown faction stays selectable and is refused at the field', () => {
    const doc = updatePlacement(camp(), 2, { faction: 'wolves' });
    mountAt(doc, { kind: 'placement', index: 2 });
    expect(selectValue('placement-faction')).toBe('wolves');
    expect(
      screen.getByTestId('placement-faction-refusal').textContent
    ).toContain('no faction in this dungeon has that id');
  });
});

describe('the arrives editor on the placement inspector (§7, step B)', () => {
  it('is the shared predicate editor, on a monster and on a prop, defaulting to "(none)" = placed at launch', () => {
    const onPlacement = vi.fn();
    mountAt(camp(), { kind: 'placement', index: 2 }, { onPlacement });
    expect(optionValues('placement-arrives-form')).toEqual([
      '',
      'round',
      'down',
      'fact',
      'stance',
    ]);
    expect(selectValue('placement-arrives-form')).toBe('');
    expect(screen.getByTestId('placement-arrives').textContent).toContain(
      'placed at launch'
    );
    fireEvent.change(screen.getByTestId('placement-arrives-form'), {
      target: { value: 'round' },
    });
    expect(onPlacement).toHaveBeenCalledWith(2, { arrives: { round: 1 } });
    // The letter, a prop, gets the same editor.
    mountAt(camp(), { kind: 'placement', index: 0 }, { onPlacement });
    fireEvent.change(screen.getAllByTestId('placement-arrives-form')[1], {
      target: { value: 'down' },
    });
    expect(onPlacement).toHaveBeenLastCalledWith(0, {
      arrives: { down: 'chief' },
    });
  });

  it('shows the authored predicate with the compiler’s refusals at its sub-paths, and the reserve note', () => {
    const doc = updatePlacement(camp(), 2, { arrives: { down: 'nobody' } });
    mountAt(doc, { kind: 'placement', index: 2 });
    expect(selectValue('placement-arrives-form')).toBe('down');
    expect(selectValue('placement-arrives-down')).toBe('nobody');
    expect(screen.getByTestId('placement-arrives-refusal').textContent).toBe(
      '"nobody" is not a placement in this dungeon'
    );
    expect(screen.getByTestId('arrives-note').textContent).toContain(
      'In reserve until this holds'
    );
  });

  it('a placement cannot wait for its own fall', () => {
    const doc = updatePlacement(camp(), 2, { arrives: { down: 'scout' } });
    mountAt(doc, { kind: 'placement', index: 2 });
    expect(
      screen.getByTestId('placement-arrives-refusal').textContent
    ).toContain('cannot wait for its own fall');
  });

  it('a reserved prop with no id is refused at its id', () => {
    const doc = updatePlacement(camp(), 0, { id: '', arrives: { round: 6 } });
    mountAt(doc, { kind: 'placement', index: 0 });
    expect(screen.getByTestId('placement-id-refusal').textContent).toBe(
      '"dnd5e:props:scroll" arrives on a predicate and has no id, and a thing that arrives has to be nameable'
    );
  });
});

describe('the Endings section beside Scenarios (R10, step B)', () => {
  it('says so when there are none, and declares one on the first named monster’s fall', () => {
    const onAddEnding = vi.fn();
    mountAt(camp(), { kind: 'dungeon' }, { onAddEnding });
    expect(screen.getByTestId('endings-section')).toBeTruthy();
    expect(screen.getByTestId('endings-none')).toBeTruthy();
    fireEvent.click(screen.getByTestId('new-ending'));
    expect(onAddEnding).toHaveBeenCalled();
  });

  it('renders each ending with its id and a REQUIRED when editor — no "(none)" on offer', () => {
    const onEnding = vi.fn();
    let doc = addEnding(camp());
    doc = updateEnding(doc, 0, {
      id: 'turned',
      when: { stance: { between: ['goblins', 'party'], is: 'neutral' } },
    });
    mountAt(doc, { kind: 'dungeon' }, { onEnding });
    expect((screen.getByTestId('ending-0-id') as HTMLInputElement).value).toBe(
      'turned'
    );
    expect(optionValues('ending-0-when-form')).toEqual([
      'round',
      'down',
      'fact',
      'stance',
    ]);
    expect(selectValue('ending-0-when-form')).toBe('stance');
    expect(selectValue('ending-0-when-stance-a')).toBe('goblins');
    expect(selectValue('ending-0-when-stance-is')).toBe('neutral');
    fireEvent.change(screen.getByTestId('ending-0-when-form'), {
      target: { value: 'round' },
    });
    expect(onEnding).toHaveBeenCalledWith(0, { when: { round: 1 } });
    fireEvent.change(screen.getByTestId('ending-0-id'), {
      target: { value: 'held-out' },
    });
    expect(onEnding).toHaveBeenLastCalledWith(0, { id: 'held-out' });
  });

  it('refuses a duplicate id in place and renders the compiler’s refusal at the when', () => {
    let doc = addEnding(camp());
    doc = addEnding(doc);
    mountAt(doc, { kind: 'dungeon' }, {}, [
      create(FieldErrorSchema, {
        path: 'endings[1].when',
        message: 'an ending nobody can reach',
      }),
    ]);
    fireEvent.change(screen.getByTestId('ending-1-id'), {
      target: { value: 'ending-1' },
    });
    expect(screen.getByTestId('ending-1-id-refusal').textContent).toContain(
      'already declared'
    );
    expect(screen.getByTestId('ending-1-when-refusal').textContent).toBe(
      'an ending nobody can reach'
    );
  });

  it('shows that the scenario’s `convince` is sugar for a stance ending', () => {
    const doc = setScenarioBinding(camp(), 'hold-out', 'convince', 'goblins');
    const bound = mountAt(doc);
    expect(screen.getByTestId('ending-sugar-hold-out').textContent).toContain(
      'hold-out ends when goblins × party is neutral'
    );
    bound.unmount();
    mountAt(camp());
    expect(screen.queryByTestId('ending-sugar-hold-out')).toBeNull();
  });

  it('removes one', () => {
    const onRemoveEnding = vi.fn();
    mountAt(addEnding(camp()), { kind: 'dungeon' }, { onRemoveEnding });
    fireEvent.click(screen.getByTestId('ending-0-remove'));
    expect(onRemoveEnding).toHaveBeenCalledWith(0);
  });
});

describe('the intel form’s reveals: door | fact (§7)', () => {
  it('a record revealing a fact shows the fact box, and the list row says so', () => {
    mountAt(camp(), { kind: 'intel', id: 'intel-1' });
    expect(selectValue('intel-reveals-kind')).toBe('fact');
    expect(
      (screen.getByTestId('intel-reveals-fact') as HTMLInputElement).value
    ).toBe('saved-wiseman');
    expect(screen.queryByTestId('intel-reveals-door')).toBeNull();
    expect(screen.getByTestId('intel-intel-1').textContent).toContain(
      'fact: saved-wiseman'
    );
  });

  it('a new record starts on door; picking fact opens the box and writes the fact', () => {
    const onIntelReveals = vi.fn();
    let doc = addIntel(camp());
    doc = { ...doc, doors: [] };
    mountAt(doc, { kind: 'intel', id: 'intel-2' }, { onIntelReveals });
    expect(selectValue('intel-reveals-kind')).toBe('door');
    fireEvent.change(screen.getByTestId('intel-reveals-kind'), {
      target: { value: 'fact' },
    });
    const box = screen.getByTestId('intel-reveals-fact') as HTMLInputElement;
    // The other record's fact is offered as a suggestion.
    expect(box.placeholder).toBe('saved-wiseman');
    fireEvent.change(box, { target: { value: 'saved-wiseman' } });
    expect(onIntelReveals).toHaveBeenCalledWith(
      'intel-2',
      'fact',
      'saved-wiseman'
    );
  });

  it('switching kind clears the other key — exactly one', () => {
    const onIntelReveals = vi.fn();
    mountAt(camp(), { kind: 'intel', id: 'intel-1' }, { onIntelReveals });
    fireEvent.change(screen.getByTestId('intel-reveals-kind'), {
      target: { value: 'door' },
    });
    expect(onIntelReveals).toHaveBeenCalledWith('intel-1', 'fact', '');
  });

  it('a compiler refusal addressed to the record’s reveals renders at the field', () => {
    mountAt(camp(), { kind: 'intel', id: 'intel-1' }, {}, [
      create(FieldErrorSchema, {
        path: 'intel[0].reveals',
        message: 'reveals nothing — pick a door or name a fact',
      }),
    ]);
    expect(screen.getByTestId('intel-reveals-refusal').textContent).toBe(
      'reveals nothing — pick a door or name a fact'
    );
    mountAt(camp(), { kind: 'placement', index: 1 }, {}, [
      create(FieldErrorSchema, {
        path: 'place[1].faction',
        message: 'a sentence about the chief’s faction',
      }),
    ]);
    expect(
      screen.getAllByTestId('placement-faction-refusal')[0].textContent
    ).toBe('a sentence about the chief’s faction');
  });

  it('a hand-written record with both keys is refused at the field', () => {
    let doc = camp();
    doc = {
      ...doc,
      intel: [{ id: 'intel-1', reveals: { door: 'x', fact: 'y' } }],
    };
    mountAt(doc, { kind: 'intel', id: 'intel-1' });
    expect(screen.getByTestId('intel-reveals-refusal').textContent).toContain(
      'exactly one thing'
    );
  });
});
