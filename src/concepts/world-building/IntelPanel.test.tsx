/**
 * The Intel site-scope node (rpg-dnd5e-web#1176) — RENDER tests, not grammar
 * tests: the record's shape is covered by `intelEdits.test.ts` and the strict
 * decoder by `singleRoomDungeon.test.ts`. What is asserted here is that the
 * document's records appear as CONTROLS holding the document's values, that the
 * add/remove verbs hand the parent a next scope, and that the panel reports who
 * holds a record without resolving anything itself.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { decodeWorldBuilderV4Site } from './fixtures/worldBuilderV4Site';
import { IntelPanel } from './IntelPanel';
import type { SiteScope } from './siteScope';

const fixture = decodeWorldBuilderV4Site();

/** A site carrying the front room's two records and a thug that holds one —
 * the driving case: a failed persuasion teaches the fact and the thug is
 * called in by it. */
function frontRoomScope(): SiteScope {
  return {
    intel: [
      { id: 'vault-map', reveals: { door: 'vault' } },
      { id: 'cellar-lie', reveals: { fact: 'cellar-is-clear' } },
    ],
  };
}

function roomWithThug() {
  const room = structuredClone(fixture.draft.room);
  room.monsters = [
    { id: 'thug-1', ref: 'dnd5e:monsters:thug', startingCell: { location: { q: 4, r: 0 } } },
  ];
  room.monsterBindings = { 'thug-1': { holds: ['cellar-lie'] } };
  return room;
}

describe('IntelPanel — the site’s knowledge records, editable', () => {
  it('shows each record’s id and the fact it reveals, and REFUSES a door reveal', () => {
    render(
      <IntelPanel
        scope={frontRoomScope()}
        room={roomWithThug()}
        onChange={() => {}}
      />
    );
    const idBox = screen.getByLabelText(
      'Intel id for cellar-lie'
    ) as HTMLInputElement;
    expect(idBox.value).toBe('cellar-lie');

    // The fact record is the driving case and the one target this dialect takes.
    expect(
      (
        screen.getByLabelText(
          'Intel reveals fact for cellar-lie'
        ) as HTMLInputElement
      ).value
    ).toBe('cellar-is-clear');

    // A door reveal is REFUSED, in the engine's own words, at the record's own
    // row — not merely unauthored and not silently carried (rpg-project#488 R3,
    // rpg-toolkit#1855).
    expect(screen.getByTestId('intel-door-vault-map').textContent).toMatch(
      /concealed door on a crossing/
    );
    expect(
      (
        screen.getByLabelText(
          'Intel reveals fact for vault-map'
        ) as HTMLInputElement
      ).disabled
    ).toBe(true);
  });

  it('reports who holds a record, read from the room’s bindings', () => {
    render(
      <IntelPanel
        scope={frontRoomScope()}
        room={roomWithThug()}
        onChange={() => {}}
      />
    );
    expect(screen.getByTestId('intel-held-by-cellar-lie').textContent).toMatch(
      /Held by thug-1/
    );
    // Nobody holds the vault map, and the panel says so rather than staying
    // silent about it.
    expect(screen.getByTestId('intel-held-by-vault-map').textContent).toMatch(
      /Held by nobody yet/
    );
  });

  it('hands the parent a next scope on add, on remove and on a rename', () => {
    const onChange = vi.fn();
    render(
      <IntelPanel
        scope={frontRoomScope()}
        room={roomWithThug()}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText('Add intel record'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].intel).toHaveLength(3);

    onChange.mockClear();
    fireEvent.change(screen.getByLabelText('Intel id for vault-map'), {
      target: { value: 'cellar-map' },
    });
    expect(onChange.mock.calls[0][0].intel[0].id).toBe('cellar-map');

    onChange.mockClear();
    fireEvent.click(screen.getByLabelText('Remove intel vault-map'));
    expect(onChange.mock.calls[0][0].intel).toEqual([
      { id: 'cellar-lie', reveals: { fact: 'cellar-is-clear' } },
    ]);
  });

  it('editing a fact target writes the id the author typed', () => {
    const onChange = vi.fn();
    render(
      <IntelPanel
        scope={frontRoomScope()}
        room={roomWithThug()}
        onChange={onChange}
      />
    );
    fireEvent.change(
      screen.getByLabelText('Intel reveals fact for cellar-lie'),
      {
        target: { value: 'cellar-is-flooded' },
      }
    );
    expect(onChange.mock.calls[0][0].intel[1].reveals).toEqual({
      fact: 'cellar-is-flooded',
    });
  });

  it('an empty site says so instead of showing an empty list', () => {
    render(<IntelPanel scope={{}} room={roomWithThug()} onChange={() => {}} />);
    expect(screen.getByTestId('intel-none')).toBeTruthy();
  });

  it('states the layering rule so the form never reads as resolving a target', () => {
    render(
      <IntelPanel
        scope={frontRoomScope()}
        room={roomWithThug()}
        onChange={() => {}}
      />
    );
    expect(screen.getByTestId('intel-layering-rule').textContent).toMatch(
      /read by the engine when the record changes hands/
    );
  });

  it('carries a concealment reveal read-only, not edited into a fact (rpg-project#490)', () => {
    // A hand-written record may now reveal a CONCEALMENT — the thing "reveals:
    // { concealment }" names under the root `concealments:`. The form only
    // authors `fact` today, so a concealment record is preserved read-only:
    // disabled, labelled a secret, and never silently re-written as a fact on
    // re-save.
    render(
      <IntelPanel
        scope={{
          intel: [{ id: 'vault-map', reveals: { concealment: 'vault' } }],
        }}
        room={roomWithThug()}
        onChange={() => {}}
      />
    );
    const input = screen.getByLabelText(
      'Intel reveals secret for vault-map'
    ) as HTMLInputElement;
    expect(input.value).toBe('vault');
    expect(input.disabled).toBe(true);
    expect(
      screen.getByTestId('intel-concealment-vault-map').textContent
    ).toMatch(/Carried read-only/);
  });
});

describe('an intel record collapses to its id and what it reveals', () => {
  it('reads as the id plus the fact, so a node scans without opening entries', () => {
    render(
      <IntelPanel
        scope={frontRoomScope()}
        room={roomWithThug()}
        onChange={() => {}}
      />
    );
    const summary = screen.getByLabelText('Intel cellar-lie');
    expect(summary.textContent).toMatch(/cellar-lie/);
    expect(summary.textContent).toMatch(/fact cellar-is-clear/);
    // And the entry really is a collapsed details, not a styled div.
    const row = screen.getByTestId('intel-row-cellar-lie');
    expect(row.tagName.toLowerCase()).toBe('details');
    expect((row as HTMLDetailsElement).open).toBe(false);
  });
});
