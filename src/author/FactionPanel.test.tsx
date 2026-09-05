/**
 * The Factions and Dispositions sections, the predicate editor, the
 * placement's faction dropdown and the intel form's reveals kind
 * (rpg-project#375 §7) — mounted through the real Inspector and asserted
 * on the DOM it renders, so every test here would FAIL if a section did
 * not put its dropdowns on screen.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConcealmentDerivation } from './dungeonYaml';
import {
  addDisposition,
  addFaction,
  addIntel,
  emptyDungeon,
  paintCell,
  placeAt,
  setIntelReveals,
  updateDisposition,
  updateFaction,
  updatePlacement,
  type DungeonDoc,
  type PredicateDoc,
} from './dungeonYaml';
import { NAME_A_MIND, NO_RECORD_REVEALS_THIS } from './factionRules';
import { fromOffset } from './hexOffset';
import { Inspector } from './Inspector';
import type { Selection } from './types';

const p = (c: number, r: number) => fromOffset('pointy', [c, r]);
const noop = () => {};
const EMPTY_CONCEALMENT: ConcealmentDerivation = {
  regionIds: new Set(),
  doorByRegion: new Map(),
};
const NO_SCENARIOS = { scenarios: [], loading: false, error: null };

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
  h: Handlers = {}
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
      onBindScenario={noop}
      scenarios={NO_SCENARIOS}
      errors={[]}
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
      '"letter" is not in goblins'
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
    expect(optionValues('disposition-0-a')).toEqual(['goblins', 'party']);
    expect(optionValues('disposition-0-b')).toEqual(['goblins', 'party']);
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

  it('a hand-written until on a neutral pair: refused at the stance', () => {
    let doc = camp();
    doc = {
      ...doc,
      dispositions: [{ ...doc.dispositions[0], stance: 'neutral' }],
    };
    mountAt(doc);
    expect(
      screen.getByTestId('disposition-0-stance-refusal').textContent
    ).toContain('`until`');
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
    ).toContain('no faction is called "wolves"');
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
    mountAt(withUntil({ round: 6 }), { kind: 'dungeon' }, { onDisposition });
    const box = screen.getByTestId(
      'disposition-0-until-round'
    ) as HTMLInputElement;
    expect(box.value).toBe('6');
    expect(box.min).toBe('1');
    fireEvent.change(box, { target: { value: '3' } });
    expect(onDisposition).toHaveBeenCalledWith(0, { until: { round: 3 } });
    mountAt(withUntil({ round: 0 }));
    expect(
      screen.getAllByTestId('disposition-0-until-refusal')[0].textContent
    ).toBe('a round is counted from 1');
  });

  it('down: a dropdown of the NAMED monsters', () => {
    const onDisposition = vi.fn();
    mountAt(
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
    mountAt(withUntil({ down: 'nobody' }));
    expect(
      screen.getAllByTestId('disposition-0-until-refusal')[0].textContent
    ).toContain('no placement is called "nobody"');
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
      withUntil({ stance: { between: ['goblins', 'party'], is: 'neutral' } }),
      { kind: 'dungeon' },
      { onDisposition }
    );
    expect(optionValues('disposition-0-until-stance-a')).toEqual([
      'goblins',
      'party',
    ]);
    expect(selectValue('disposition-0-until-stance-b')).toBe('party');
    expect(selectValue('disposition-0-until-stance-is')).toBe('neutral');
    fireEvent.change(screen.getByTestId('disposition-0-until-stance-is'), {
      target: { value: 'allied' },
    });
    expect(onDisposition).toHaveBeenCalledWith(0, {
      until: { stance: { between: ['goblins', 'party'], is: 'allied' } },
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
      until: { stance: { between: ['goblins', 'party'], is: 'neutral' } },
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
    ).toContain('no faction is called "wolves"');
  });

  it('shows an `arrives` the file carries, read-only, with its refusal', () => {
    const doc = updatePlacement(camp(), 2, { arrives: { down: 'nobody' } });
    mountAt(doc, { kind: 'placement', index: 2 });
    expect(screen.getByTestId('arrives-readout').textContent).toContain(
      '{ down: nobody }'
    );
    expect(screen.getByTestId('arrives-refusal').textContent).toContain(
      'no placement is called "nobody"'
    );
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
