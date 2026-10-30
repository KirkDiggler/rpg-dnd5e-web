/**
 * A disposition's `until` as one step or a list of steps, each one predicate
 * and the stance it turns the pair to (rpg-project#717, rpg-project#732).
 * Every refusal is the engine's (`dungeonspec/predicate.go` `UntilSpec`,
 * `dungeonspec/factions.go` `steps`), word for word. The fixture is the
 * stack's castle, whose garrison turns allied on the captain's word and
 * hostile on recognition, the captain's word first.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { readDraftYaml } from '../encounter-studio/draftFile';
import castleYaml from '../encounter-studio/fixtures/stack-sites/the-mad-king.yaml?raw';
import { dispositionLine } from './predicateSentence';
import { DispositionsPanel } from './SitePolicies';
import {
  UNTIL_LIST_ON_FACTS,
  validateSiteDispositions,
  type SiteScope,
} from './siteScope';

afterEach(cleanup);

function castle() {
  const read = readDraftYaml(castleYaml);
  if (!read.ok) throw new Error(read.refusal);
  return { draft: read.draft, scope: read.scope };
}

const at = (d: unknown) => () => validateSiteDispositions([d]);

describe('until steps (rpg-project#717)', () => {
  it('opens the castle’s garrison with its two steps, as written', () => {
    expect(castle().scope.dispositions?.[0]).toEqual({
      between: ['garrison', 'party'],
      stance: 'neutral',
      until: [
        { fact: 'guards-turned', then: 'allied' },
        { fact: 'party-recognized', then: 'hostile' },
      ],
    });
  });

  it('keeps a single step’s spelling, then and all', () => {
    expect(
      validateSiteDispositions([
        {
          between: ['veteran', 'party'],
          stance: 'neutral',
          until: { fact: 'veteran-joined', then: 'allied' },
        },
        {
          between: ['band', 'party'],
          stance: 'hostile',
          until: { down: 'leader' },
        },
      ])
    ).toEqual([
      {
        between: ['veteran', 'party'],
        stance: 'neutral',
        until: { fact: 'veteran-joined', then: 'allied' },
      },
      {
        between: ['band', 'party'],
        stance: 'hostile',
        until: { down: 'leader' },
      },
    ]);
  });

  it('takes an allied pair whose steps name a then', () => {
    expect(
      at({
        between: ['garrison', 'party'],
        stance: 'allied',
        until: { fact: 'betrayed', then: 'hostile' },
      })()
    ).toHaveLength(1);
  });

  it('refuses what the engine refuses, in its words', () => {
    const pair = { between: ['garrison', 'party'] };
    expect(at({ ...pair, stance: 'neutral', until: [] })).toThrow(
      'Site disposition at index 0 until: this until lists no steps — write a step, or drop the until'
    );
    expect(
      at({ ...pair, stance: 'neutral', until: { fact: 'x', then: 'friendly' } })
    ).toThrow(
      'Site disposition at index 0 until.then: "friendly" is not a stance: hostile, neutral or allied'
    );
    expect(at({ ...pair, stance: 'allied', until: { fact: 'x' } })).toThrow(
      'Site disposition at index 0 until: an allied pair has nothing to become unless `then` names where it goes: name a `then: hostile` or `then: neutral`, drop the until, or make the pair hostile or neutral'
    );
    expect(
      at({ ...pair, stance: 'neutral', until: { fact: 'x', then: 'neutral' } })
    ).toThrow(
      'Site disposition at index 0 until.then: the pair is neutral and `then` turns it neutral, which it already is'
    );
    expect(
      at({
        ...pair,
        stance: 'neutral',
        until: [{ fact: 'x', then: 'allied' }, { down: 'captain' }],
      })
    ).toThrow(`Site disposition at index 0 until[1]: ${UNTIL_LIST_ON_FACTS}`);
  });

  it('says the steps in words, the first that holds winning', () => {
    const document = castle();
    expect(dispositionLine(document.scope.dispositions![0]!, document)).toBe(
      'The garrison and the party are neutral: once Guard Captain, the garrison’s mind, knows guards-turned, allied; once Guard Captain, the garrison’s mind, knows party-recognized, hostile — the first of these that holds wins.'
    );
    expect(dispositionLine(document.scope.dispositions![1]!, document)).toMatch(
      /until .* is down; then neutral\.$/
    );
  });
});

describe('the Dispositions panel edits a list of steps', () => {
  function Panel({ initial }: { initial: SiteScope }) {
    const document = castle();
    const [scope, setScope] = useState(initial);
    return (
      <>
        <DispositionsPanel
          scope={scope}
          room={document.draft.room}
          onChange={setScope}
        />
        <pre data-testid="scope">{JSON.stringify(scope.dispositions)}</pre>
      </>
    );
  }
  const written = () =>
    JSON.parse(screen.getByTestId('scope').textContent ?? '[]');

  it('shows the garrison’s two steps and their thens', () => {
    const document = castle();
    render(<Panel initial={{ ...document.scope }} />);
    expect(
      (screen.getAllByLabelText('Until fact')[0] as HTMLInputElement).value
    ).toBe('guards-turned');
    expect(
      (screen.getByLabelText('Until step 2 fact') as HTMLInputElement).value
    ).toBe('party-recognized');
    expect(
      (screen.getAllByLabelText('Then')[0] as HTMLSelectElement).value
    ).toBe('allied');
    expect(
      (screen.getByLabelText('Then step 2') as HTMLSelectElement).value
    ).toBe('hostile');
    // A list's steps turn on facts only: the fact form alone is offered.
    const form = screen.getByLabelText(
      'Until step 2 form'
    ) as HTMLSelectElement;
    expect([...form.options].map((o) => o.value)).toEqual([
      'none',
      'fact',
      'not',
    ]);
  });

  it('adds a step to a single one and writes the list; removing it writes the mapping back', () => {
    render(
      <Panel
        initial={{
          dispositions: [
            {
              between: ['garrison', 'party'],
              stance: 'neutral',
              until: { fact: 'guards-turned', then: 'allied' },
            },
          ],
        }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add until step' }));
    fireEvent.change(screen.getByLabelText('Until step 2 fact'), {
      target: { value: 'party-recognized' },
    });
    fireEvent.change(screen.getByLabelText('Then step 2'), {
      target: { value: 'hostile' },
    });
    expect(written()[0].until).toEqual([
      { fact: 'guards-turned', then: 'allied' },
      { fact: 'party-recognized', then: 'hostile' },
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove until step 2' })
    );
    expect(written()[0].until).toEqual({
      fact: 'guards-turned',
      then: 'allied',
    });
  });

  it('a then never offers the stance the pair already holds', () => {
    render(
      <Panel
        initial={{
          dispositions: [
            {
              between: ['garrison', 'party'],
              stance: 'neutral',
              until: { fact: 'guards-turned' },
            },
          ],
        }}
      />
    );
    const then = screen.getByLabelText('Then') as HTMLSelectElement;
    expect([...then.options].map((o) => o.value)).toEqual([
      '',
      'hostile',
      'allied',
    ]);
  });
});
