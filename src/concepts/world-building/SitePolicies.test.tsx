/**
 * The site-policy views against the engine's own pinned v4 example
 * (rpg-dnd5e-web#1157 read-only; #1160 makes the site's own facts editable).
 *
 * These are RENDER tests, not grammar tests: the decoder's strictness is
 * covered by `singleRoomDungeon.test.ts` and the fixture's own test, and the
 * edit mechanics by `sitePolicyEdits.test.ts`. What is asserted here is that
 * the document's facts appear as CONTROLS holding the document's values — the
 * faction's id, its mix, its shared table with each entry's weight, say and one
 * word, the disposition's pair and stance — that the add verbs hand the parent
 * a next scope, and that a creature's inherited-vs-overridden split stays a
 * readout with both asymmetries stated.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnswerTableShape } from './answerTableShape';
import { decodeWorldBuilderV4Site } from './fixtures/worldBuilderV4Site';
import {
  CreatureOrders,
  DispositionsPanel,
  FactionsPanel,
} from './SitePolicies';
import type { SiteScope } from './siteScope';
import { TablesPanel } from './TablesPanel';

const fixture = decodeWorldBuilderV4Site();

/** The engine's example scope, which carries both keys. */
const siteScope: SiteScope = {
  factions: fixture.factions,
  dispositions: fixture.dispositions,
};

/** The example's goblin, which overrides all three binding fields. */
const goblin = fixture.draft.room.monsterDeclarations.find(
  (monster) => monster.id === 'goblin-1'
)!;

/** The site's two noun panels, together. They are separate NODES now
 * (rpg-dnd5e-web#1178 follow-up) but they read one scope, so a test of the
 * site's facts renders both. */
function SiteFacts(props: {
  scope: SiteScope;
  room?: Parameters<typeof DispositionsPanel>[0]['room'];
  onChange?: (next: SiteScope) => void;
  onNotice?: (message: string) => void;
}) {
  return (
    <>
      <FactionsPanel
        scope={props.scope}
        onChange={props.onChange ?? (() => {})}
        onNotice={props.onNotice}
      />
      <DispositionsPanel
        scope={props.scope}
        room={props.room ?? fixture.draft.room}
        onChange={props.onChange ?? (() => {})}
      />
    </>
  );
}

describe('SitePolicies — the site’s own facts, editable', () => {
  it('shows a faction’s id, mix and shared table, and the dispositions between sides', () => {
    render(<SiteFacts scope={siteScope} onChange={() => {}} />);

    // Factions and dispositions are peers now, so the faction facts are read
    // from the Factions node and the pair from the Dispositions node.
    const panel = screen.getByTestId('site-factions');
    // The id is a control holding the document's value.
    const idInput = within(panel).getByLabelText(
      'Faction id for goblins'
    ) as HTMLInputElement;
    expect(idInput.value).toBe('goblins');
    // The mix is shown with the words the declaration seals.
    expect(
      within(panel).getByText('temper coward ×2 · soldier ×1 · aggressive ×1')
    ).toBeTruthy();

    // The shared table, trigger by trigger, with each entry's weight, its `say`
    // and the one word it does. THE SOCIAL ROWS CARRY NO CONDITION LEAD: `when`
    // is illegal under a social key (the verdict IS the condition), so "any
    // time" there would assert a timing the row does not have. Only the `time`
    // row leads with its condition. (Corrected in review — the first cut
    // labelled every row, social included.)
    expect(within(panel).getByText('intimidated')).toBeTruthy();
    expect(
      within(panel).getByText(
        'weight 70 · say “Fine! The cellar door is behind the barrels.” · fact goblin-cowed'
      )
    ).toBeTruthy();
    expect(
      within(panel).getByText('weight 30 · say “Boss! BOSS!” · flee')
    ).toBeTruthy();
    expect(within(panel).getByText('time')).toBeTruthy();
    expect(
      within(panel).getByText('when enemy reach · weight 1 · attack enemy')
    ).toBeTruthy();

    // A disposition is the pair, its stance, and the `until` that ends it —
    // read from the DISPOSITIONS node, which is its own top-level node now.
    const dispositionsNode = screen.getByTestId('site-dispositions');
    expect(
      (
        within(dispositionsNode).getByLabelText(
          'Between first faction'
        ) as HTMLSelectElement
      ).value
    ).toBe('goblins');
    expect(
      (
        within(dispositionsNode).getByLabelText(
          'Between second faction'
        ) as HTMLSelectElement
      ).value
    ).toBe('party');
    expect(
      (within(dispositionsNode).getByLabelText('Stance') as HTMLSelectElement)
        .value
    ).toBe('hostile');
    expect(
      within(dispositionsNode).getByText('fact goblin-cowed')
    ).toBeTruthy();

    // It IS editable: the facts are controls now.
    expect(
      panel.querySelectorAll('input, select, button').length
    ).toBeGreaterThan(0);
  });

  it('hands the parent a next scope when a faction or a disposition is added', () => {
    const onChange = vi.fn();
    render(<SiteFacts scope={{}} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add faction' }));
    expect(onChange).toHaveBeenCalled();
    const withFaction = onChange.mock.calls[0]![0] as SiteScope;
    expect(withFaction.factions).toHaveLength(1);
    expect(withFaction.factions?.[0]?.id).toBeTruthy();
  });

  it('says when nothing is authored, and offers the add verb', () => {
    render(<SiteFacts scope={{}} onChange={() => {}} />);
    expect(screen.getByTestId('policies-none').textContent).toMatch(
      /No factions are authored on this site\./
    );
    expect(screen.getByRole('button', { name: 'Add faction' })).toBeTruthy();
    // No faction exists, so there is nothing to declare a stance about.
    expect(
      (
        screen.getByRole('button', {
          name: 'Add disposition',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it('adds a disposition once a faction exists', () => {
    const onChange = vi.fn();
    render(
      <SiteFacts
        scope={{ factions: [{ id: 'goblins' }] }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add disposition' }));
    const withDisposition = onChange.mock.calls[0]![0] as SiteScope;
    expect(withDisposition.dispositions).toEqual([
      { between: ['goblins', 'party'], stance: 'hostile' },
    ]);
  });
});

describe('CreatureOrders — inherited vs overridden for a selected creature', () => {
  it('shows what the goblin’s faction supplies and what its own block overrides', () => {
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        room={fixture.draft.room}
        binding={fixture.draft.room.monsterBindings?.['goblin-1']}
      />
    );
    const creature = screen.getByLabelText('Selected creature');
    expect(within(creature).getByText('goblins')).toBeTruthy();

    // Inherited: the faction's mix and both shared-table triggers.
    expect(
      within(creature).getByText(/coward ×2 · soldier ×1 · aggressive ×1/)
    ).toBeTruthy();
    expect(within(creature).getByText('intimidated')).toBeTruthy();

    // Overridden: its own ONE word, its own `time` table and its actions.
    expect(within(creature).getByText(/^temper coward$/)).toBeTruthy();
    expect(
      within(creature).getByText('when enemy reach · weight 1 · hold')
    ).toBeTruthy();
    expect(
      within(creature).getByText(
        /dnd5e:weapons:scimitar, dnd5e:weapons:shortbow/
      )
    ).toBeTruthy();
  });

  it('states the two asymmetries where the orders are read', () => {
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        room={fixture.draft.room}
        binding={fixture.draft.room.monsterBindings?.['goblin-1']}
      />
    );
    expect(screen.getByTestId('faction-layer-rule').textContent).toMatch(
      /nearest key wins WHOLESALE/
    );
    expect(screen.getByTestId('faction-layer-rule').textContent).toMatch(
      /entry lists are never merged/
    );
    expect(screen.getByTestId('temper-asymmetry').textContent).toMatch(
      /a word or a mix/
    );
    expect(screen.getByTestId('temper-asymmetry').textContent).toMatch(
      /placement’s is one word/
    );
  });

  it('renders an absent faction as the kind’s default, never as a faction named monsters', () => {
    const skeleton = fixture.draft.room.monsterDeclarations.find(
      (monster) => monster.id === 'skeleton-a'
    )!;
    render(
      <CreatureOrders
        scope={siteScope}
        monster={skeleton}
        room={fixture.draft.room}
        binding={fixture.draft.room.monsterBindings?.['skeleton-a']}
      />
    );
    const creature = screen.getByLabelText('Selected creature');
    expect(within(creature).getByText(/keeps its kind’s default/)).toBeTruthy();
    expect(within(creature).queryByText('monsters')).toBeNull();
    // It has no faction to inherit from; it overrides only its actions.
    expect(within(creature).getByTestId('creature-inherits-none')).toBeTruthy();
    expect(within(creature).getByText(/dnd5e:weapons:shortsword/)).toBeTruthy();
  });

  it('says when a placement keeps everything, and when its faction is not declared', () => {
    const { unmount } = render(
      <CreatureOrders
        scope={siteScope}
        monster={{
          id: 'stray',
          ref: 'dnd5e:monsters:zombie',
          startingCell: { location: { q: 0, r: 0 } },
        }}
        room={fixture.draft.room}
      />
    );
    expect(screen.getByTestId('creature-inherits-none')).toBeTruthy();
    expect(screen.getByTestId('creature-overrides-none')).toBeTruthy();
    unmount();

    render(
      <CreatureOrders
        scope={siteScope}
        monster={{
          id: 'stray',
          ref: 'dnd5e:monsters:zombie',
          startingCell: { location: { q: 0, r: 0 } },
        }}
        binding={{ faction: 'ghosts' }}
        room={fixture.draft.room}
      />
    );
    expect(screen.getByTestId('creature-inherits-unknown').textContent).toMatch(
      /declares no faction with the id “ghosts”/
    );
  });
});

describe('CreatureOrders — the creature’s intel and reserve (web#1176)', () => {
  /**
   * THE PRICED CHECKS ARE NO LONGER OFFERED (rpg-dnd5e-web#1201). Kirk ruled
   * they come off the builder — a check is a property of INTERACTING WITH AN
   * NPC, and a hostile monster is not one — so this asserts the ABSENCE, which
   * is the behaviour change. The fields are still READ (see
   * `roomDraft.test.ts`), so a document carrying them still opens.
   */
  it('offers no control for the priced checks, which are no longer the builder’s', () => {
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        room={fixture.draft.room}
        binding={{
          intimidate: [{ ability: 'intimidation', dc: 12 }],
          persuade: [{ ability: 'persuasion', dc: 10 }],
          holds: ['cellar-lie'],
        }}
        onOrdersChange={vi.fn()}
      />
    );
    expect(screen.queryByTestId('creature-intimidate')).toBeNull();
    expect(screen.queryByTestId('creature-persuade')).toBeNull();
    expect(screen.queryByLabelText('Add Intimidate row')).toBeNull();
    // And the block they lived in is now about what it still carries.
    expect(screen.getByText('Reserve and holdings')).toBeTruthy();
  });

  it('gives and takes away a held record from the site’s declared ones', () => {
    const onOrdersChange = vi.fn();
    render(
      <CreatureOrders
        scope={{
          ...siteScope,
          intel: [{ id: 'cellar-lie', reveals: { fact: 'cellar-is-clear' } }],
        }}
        monster={goblin}
        room={fixture.draft.room}
        binding={{ actions: ['dnd5e:weapons:scimitar'] }}
        onOrdersChange={onOrdersChange}
      />
    );
    expect(screen.getByTestId('creature-holds-none')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Give intel record'), {
      target: { value: 'cellar-lie' },
    });
    expect(onOrdersChange.mock.calls[0][0].holds).toEqual(['cellar-lie']);
  });

  it('says when the site has no records to give, rather than showing an empty picker', () => {
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        room={fixture.draft.room}
        binding={{ actions: ['dnd5e:weapons:scimitar'] }}
        onOrdersChange={() => {}}
      />
    );
    expect(screen.getByTestId('creature-holds-no-records')).toBeTruthy();
  });

  it('authors the reserve predicate in the same four forms as an `until`', () => {
    const onOrdersChange = vi.fn();
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        room={fixture.draft.room}
        onOrdersChange={onOrdersChange}
      />
    );
    // Nothing authored: the creature is in the run from the first frame.
    expect(screen.getByTestId('creature-arrives-note').textContent).toMatch(
      /in the run from the first frame/
    );
    fireEvent.change(screen.getByLabelText('Arrives form'), {
      target: { value: 'fact' },
    });
    expect(onOrdersChange.mock.calls[0][0].arrives).toEqual({ fact: '' });

    // And a fact form writes what the author types.
    onOrdersChange.mockClear();
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        room={fixture.draft.room}
        binding={{ arrives: { fact: 'cellar-is-clear' } }}
        onOrdersChange={onOrdersChange}
      />
    );
    expect(
      screen.getAllByTestId('creature-arrives-note')[1].textContent
    ).toMatch(/Held in reserve until fact cellar-is-clear/);
  });

  it('reports the remaining facts read-only when no editor is given', () => {
    render(
      <CreatureOrders
        scope={siteScope}
        monster={goblin}
        room={fixture.draft.room}
        binding={{
          // CARRIED, NOT SHOWN (rpg-dnd5e-web#1201): these still round-trip
          // through the document, and the panel no longer reports them.
          intimidate: [{ ability: 'intimidation', dc: 12 }],
          persuade: [
            { ability: 'persuasion', dc: 10, tool: 'dnd5e:items:lute' },
          ],
          holds: ['cellar-lie'],
          arrives: { fact: 'cellar-is-clear' },
        }}
      />
    );
    const creature = screen.getByLabelText('Selected creature');
    expect(within(creature).getByText('holds cellar-lie')).toBeTruthy();
    expect(
      within(creature).getByText(/held in reserve until fact cellar-is-clear/)
    ).toBeTruthy();
    expect(within(creature).queryByText(/intimidate dc/)).toBeNull();
    expect(screen.getByTestId('creature-interaction-readonly')).toBeTruthy();
  });
});

describe('every entry in a site node collapses to its own line (web#1178 follow-up)', () => {
  it('a disposition reads as its pair, with the stance beside it', () => {
    render(<SiteFacts scope={siteScope} />);
    const summary = screen.getByLabelText(
      'Disposition between goblins and party'
    );
    // THE LINE IS THE PAIR — the form (stance, until) is one expansion behind.
    expect(summary.textContent).toMatch(/between goblins and party/);
    expect(summary.textContent).toMatch(/hostile/);
  });

  it('a faction reads as its id', () => {
    render(<SiteFacts scope={siteScope} />);
    const summary = screen.getByLabelText('Faction goblins');
    expect(summary.textContent?.trim()).toBe('goblins');
    // The shared table is behind the line, not on it: a node can be scanned
    // without opening a single entry.
    expect(summary.textContent).not.toMatch(/intimidated/);
  });

  it('every entry is a details, so the line and the form are the same entry', () => {
    render(<SiteFacts scope={siteScope} />);
    const row = screen.getByTestId('faction-goblins');
    expect(row.tagName.toLowerCase()).toBe('details');
    expect(row.querySelector('summary')).toBeTruthy();
    // Closed by default: the nodes collapse AND each entry inside them does.
    expect((row as HTMLDetailsElement).open).toBe(false);
  });
});

describe('an entry’s `when:` condition is authored, not just read (web#1192)', () => {
  /** THE CONDITION IS AUTHORED ON A NAMED ROOT TABLE NOW (rpg-dnd5e-web#1201).
   *
   * Kirk's ruling removed the creature's inline table — "there should be no
   * inline table defined on a monster anymore" — so the ONE `AnswerEntryRow`
   * these tests drive is reached through `TablesPanel`, which is where a table's
   * grammar is authored. THE GRAMMAR IS UNCHANGED and so is every assertion
   * below: only the panel that owns the row moved. The harness therefore builds
   * a site declaring the table the fixture's goblin authors inline, so each case
   * still starts from the same document content.
   *
   * `onChange` answers the whole next SCOPE, so `next.tables['goblin-drill']`
   * is where the table that used to be `next.on` now lives. */
  const DRILL = 'goblin-drill';
  function editableTable(
    table: AnswerTableShape,
    onChange = vi.fn()
  ): ReturnType<typeof vi.fn> {
    render(
      <TablesPanel
        scope={{ ...siteScope, tables: { [DRILL]: table } }}
        onChange={onChange}
      />
    );
    // The table list is collapsed by default, like every other site noun.
    fireEvent.click(screen.getByLabelText(`Table ${DRILL}`));
    return onChange;
  }

  /** The fixture goblin's own table, which is what these cases were written
   * against: `{when: {enemy: reach}, hold: {}}`. */
  function fixtureTable(): AnswerTableShape {
    return { time: [{ when: { enemy: 'reach' }, hold: {} }] };
  }

  /** The table an `onChange` last answered with. */
  function lastTable(onChange: ReturnType<typeof vi.fn>): AnswerTableShape {
    return onChange.mock.calls.at(-1)![0].tables[DRILL];
  }

  it('reads the document’s condition as the control’s value', () => {
    // The fixture's goblin authors `{when: {enemy: reach}, hold: {}}`, so the
    // picker must open on that band — the form holds the document's value, it
    // does not default to something of its own.
    editableTable(fixtureTable());
    const picker = screen.getByLabelText(
      'When for time entry'
    ) as HTMLSelectElement;
    expect(picker.value).toBe('enemy:reach');
  });

  it('authors an enemy band, handing the parent the whole next table', () => {
    const onChange = editableTable(fixtureTable());
    fireEvent.change(screen.getByLabelText('When for time entry'), {
      target: { value: 'enemy:seen' },
    });
    // The commit is the SITE's tables, carrying the new condition.
    expect(lastTable(onChange).time![0]!.when).toEqual({ enemy: 'seen' });
  });

  it('authors a deed with a span — the case the slice exists for', () => {
    // "change targets when it is attacked": the condition is a DEED, and the
    // span is authored beside it.
    const onChange = editableTable(fixtureTable());
    fireEvent.change(screen.getByLabelText('When for time entry'), {
      target: { value: 'deed:attacked' },
    });
    expect(lastTable(onChange).time![0]!.when).toEqual({
      attacked: { within: 1 },
    });
  });

  it('clears the condition to `(any time)`, which DELETES the key', () => {
    // An empty `when` is a condition naming nothing — refused by name — so the
    // authored state "no condition" is the key's absence, never `{}`.
    const onChange = editableTable(fixtureTable());
    fireEvent.change(screen.getByLabelText('When for time entry'), {
      target: { value: 'any' },
    });
    expect('when' in lastTable(onChange).time![0]!).toBe(false);
  });

  /**
   * A DEED'S SCOPE (rpg-dnd5e-web#1199): `on: ally` is a deed against the
   * creature's own side, `as: actor` is one it did. The scope REFINES the deed
   * — a `when` still names exactly one thing — so the control sits with the
   * span and is offered on a DEED alone.
   *
   * "(the creature itself)" is the third reading and is what OMITTING the key
   * says: selecting it must delete the key rather than write a word, because
   * the engine has no spelling for it.
   */
  it('authors a deed scope, and clears it by deleting the key', () => {
    // MOUNTED ALREADY AUTHORED: the scope control exists only on a DEED, so
    // the table starts as one rather than being switched in place.
    const onChange = editableTable({
      time: [{ when: { attacked: { within: 3 } }, hold: {} }],
    });

    fireEvent.change(screen.getByLabelText('Whose deed for time entry'), {
      target: { value: 'ally' },
    });
    expect(lastTable(onChange).time![0]!.when).toEqual({
      attacked: { within: 3, on: 'ally' },
    });

    // "(the creature itself)" is what OMITTING the key says, so selecting it
    // DELETES the scope rather than writing a word the engine does not read.
    fireEvent.change(screen.getByLabelText('Whose deed for time entry'), {
      target: { value: '__self__' },
    });
    expect(lastTable(onChange).time![0]!.when).toEqual({
      attacked: { within: 3 },
    });
  });

  it('authors `as: actor` — the pause', () => {
    const onChange = editableTable({
      time: [{ when: { attacked: { within: 2 } }, hold: {} }],
    });
    fireEvent.change(screen.getByLabelText('Whose deed for time entry'), {
      target: { value: 'actor' },
    });
    expect(lastTable(onChange).time![0]!.when).toEqual({
      attacked: { within: 2, as: 'actor' },
    });
  });

  it('reads a scope off the document and shows it', () => {
    editableTable({
      time: [{ when: { attacked: { within: 3, on: 'ally' } }, hold: {} }],
    });
    expect(
      (screen.getByLabelText('Whose deed for time entry') as HTMLSelectElement)
        .value
    ).toBe('ally');
  });

  it('offers no scope on an enemy band — a band has no “whose”', () => {
    // The band branch has no `whose`, so the control is ABSENT rather than
    // rendered disabled: the builder does not offer what the engine refuses.
    editableTable({ time: [{ when: { enemy: 'reach' }, hold: {} }] });
    expect(screen.getByLabelText('When for time entry')).toBeTruthy();
    expect(screen.queryByLabelText('Whose deed for time entry')).toBeNull();
  });

  it('opens the trigger picker on `time`, not on a social key', () => {
    // FOUND ON THE WALK: the picker's default was the vocabulary's first key
    // (`intimidated`), so the obvious first click authored a SOCIAL entry —
    // the half this slice is not about — and the `when` editor (legal on `time`
    // alone) never appeared. A table with no triggers opens on `time`.
    //
    // THE ROOT TABLE'S PICKER CARRIES THE SAME FIX (web#1201): it was written
    // from the creature editor's own comment and keeps its default, so the
    // third picker cannot drift back to the social half the faction's did.
    editableTable({});
    const picker = screen.getByLabelText(
      `Add trigger to ${DRILL}`
    ) as HTMLSelectElement;
    expect(picker.value).toBe('time');
  });

  it('opens a FACTION’s picker on `time` too, for the same reason', () => {
    // FOUND IN REVIEW (independent-gate): the creature's picker was fixed and
    // the faction's was not, so a faction author landed on the social half
    // where no condition control can ever appear. Same invisibility, same fix.
    const bare: SiteScope = { factions: [{ id: 'goblins' }] };
    render(<SiteFacts scope={bare} />);
    // The label carries the faction's own id, and the faction list is
    // collapsed by default — so open the faction's row first.
    fireEvent.click(screen.getByLabelText('Faction goblins'));
    const picker = screen.getByLabelText(
      'Add trigger to goblins'
    ) as HTMLSelectElement;
    expect(picker.value).toBe('time');
  });

  it('offers no span the author did not type', () => {
    // FOUND IN REVIEW (independent-gate): clearing the span committed
    // `within: 0` — `Number('')` — a number nobody typed, where a weight's
    // absent IS 1 to the engine but a span has no legal absence. Emptying the
    // field now commits nothing, so the author's own value stands.
    // A DEED row, so the span field exists: the component renders from its
    // `binding` prop, so the row is mounted already authored rather than
    // switched in place (which only calls back and does not re-render here).
    const onChange = editableTable({
      time: [{ when: { attacked: { within: 3 } }, hold: {} }],
    });
    expect(
      (screen.getByLabelText('Within for time entry') as HTMLInputElement).value
    ).toBe('3');

    fireEvent.change(screen.getByLabelText('Within for time entry'), {
      target: { value: '' },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('offers no condition on a social trigger, because the verb IS the condition', () => {
    // `intimidated` already means "the threat landed"; a second condition under
    // it would be asking when a thing that just happened happened. The control
    // is ABSENT rather than disabled — the builder does not offer what the
    // engine refuses.
    editableTable({ intimidated: [{ say: 'Fine!' }] });
    expect(screen.queryByLabelText('When for intimidated entry')).toBeNull();
  });

  it('offers `actor` only once the condition names a deed', () => {
    // `actor` names the actor of a deed, and an entry naming none has no actor
    // to name. The selector list follows the condition rather than offering a
    // choice the engine refuses.
    editableTable({
      time: [{ when: { fled: { within: 3 } }, away: 'actor' }],
    });
    const selector = screen.getByLabelText(
      'away selector for time entry'
    ) as HTMLSelectElement;
    expect(
      Array.from(selector.options).map((option) => option.value)
    ).toContain('actor');
  });

  it('clears an `actor` selector when the deed condition is cleared', () => {
    // The one place this form edits a second field: leaving `actor` behind with
    // no deed would publish a document the engine refuses by name.
    const onChange = editableTable({
      time: [{ when: { fled: { within: 3 } }, away: 'actor' }],
    });
    fireEvent.change(screen.getByLabelText('When for time entry'), {
      target: { value: 'any' },
    });
    const table = lastTable(onChange);
    expect('when' in table.time![0]!).toBe(false);
    expect(table.time![0]!.away).not.toBe('actor');
  });
});
