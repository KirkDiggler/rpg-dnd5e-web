/**
 * THE RUN ENDS AT THE DOOR (rpg-project#716, rpg-project#732): an ending's
 * `when: { left: <exit id> }`, its `if` and its `outcome`, read in the
 * engine's sentences and authored in the Endings panel. The fixture is the
 * stack's gate walk, whose two front-door endings are the shape.
 */
import { ENDING_SENTENCES } from '@/author/factionVocabulary';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { factIndexOf } from '../world-building/factIndex';
import {
  validateSiteDispositions,
  validateSiteEndings,
} from '../world-building/siteScope';
import { readDraftYaml } from './draftFile';
import { createFakeStudioSession } from './fixtures/fakeStudioSession';
import gateWalkYaml from './fixtures/stack-sites/gate-walk.yaml?raw';
import { StudioEndings } from './StudioEndings';
import type { EncounterStudioSession } from './studioSession';

afterEach(cleanup);

function gateSession(): EncounterStudioSession {
  const read = readDraftYaml(gateWalkYaml);
  if (!read.ok) throw new Error(read.refusal);
  return {
    ...createFakeStudioSession(),
    document: { draft: read.draft, scope: read.scope },
  };
}
const endings = () => within(screen.getByRole('region', { name: 'Endings' }));

describe('the leave ending reads in the engine’s sentences', () => {
  it('opens the gate walk’s front-door endings as written', () => {
    expect(gateSession().document.scope.endings).toEqual([
      {
        id: 'captain-slain',
        when: { left: 'front-door' },
        if: { down: 'captain' },
        outcome: 'success',
      },
      {
        id: 'captain-lives',
        when: { left: 'front-door' },
        outcome: 'failure',
      },
    ]);
  });

  it('refuses what grammar.endings refuses, word for word', () => {
    const at = (ending: unknown) => () => validateSiteEndings([ending]);
    expect(
      at({ id: 'out', when: { left: 'front-door' }, outcome: 'win' })
    ).toThrow(
      "Site ending at index 0 outcome: `outcome: win`: an ending's outcome is success or failure"
    );
    expect(at({ id: 'out', when: { left: 'front-door' } })).toThrow(
      'Site ending at index 0 outcome: an ending on leaving says what leaving means: `outcome: success` or `outcome: failure`'
    );
    expect(at({ id: 'out', when: { fact: 'x' }, if: { fact: 'y' } })).toThrow(
      'Site ending at index 0 if: only an ending that waits for the party to leave, `when: { left: <exit id> }`, has an `if`'
    );
    expect(
      at({
        id: 'out',
        when: { left: 'front-door' },
        if: { round: 3 },
        outcome: 'success',
      })
    ).toThrow(
      "Site ending at index 0 if: an ending's `if` is { down: <placement id> }, { fact: <id> } or { stance: { between: [a, b], is: hostile|neutral|allied } }, or { not: } one of them, and `round` is none of them"
    );
    expect(at({ id: 'out' })).toThrow(
      `Site ending at index 0 when: ${ENDING_SENTENCES.noWhen()}`
    );
  });

  it('reads not around left as a leave, and not around an if', () => {
    expect(
      validateSiteEndings([
        {
          id: 'postern',
          when: { not: { left: 'front-door' } },
          if: { not: { fact: 'cells-opened' } },
          outcome: 'failure',
        },
      ])
    ).toEqual([
      {
        id: 'postern',
        when: { not: { left: 'front-door' } },
        if: { not: { fact: 'cells-opened' } },
        outcome: 'failure',
      },
    ]);
  });

  it('refuses left anywhere but an ending', () => {
    expect(() =>
      validateSiteDispositions([
        {
          between: ['band', 'party'],
          stance: 'hostile',
          until: { left: 'gate' },
        },
      ])
    ).toThrow(
      'Site disposition at index 0 until.left: `left` waits for the party to walk out, and only an ending waits for that (`endings: [{ id, when: { left: gate }, outcome: success|failure }]`)'
    );
  });

  it('the fact index reads a leave ending’s if', () => {
    const session = gateSession();
    session.document.scope.endings = [
      {
        id: 'freed',
        when: { left: 'front-door' },
        if: { fact: 'cells-opened' },
        outcome: 'success',
      },
    ];
    const row = factIndexOf(session.document).find(
      (r) => r.fact === 'cells-opened'
    );
    expect(row?.readers.map((u) => u.label)).toEqual(['ending freed']);
  });
});

describe('the Endings panel authors a leave', () => {
  it('lists each ending with its outcome and its if, in words', () => {
    render(<StudioEndings session={gateSession()} />);
    const items = within(
      screen.getByRole('list', { name: 'Authored endings' })
    ).getAllByRole('listitem');
    expect(items.map((item) => item.firstChild?.textContent)).toEqual([
      'captain-slain: when the last one standing leaves by front-door, success if Weak Captain is down',
      'captain-lives: when the last one standing leaves by front-door, failure',
    ]);
  });

  it('adds a leave ending by an exit with an outcome and an if', () => {
    const session = gateSession();
    render(<StudioEndings session={session} />);
    fireEvent.click(endings().getByRole('button', { name: 'Add ending' }));
    fireEvent.change(endings().getByLabelText('Ending id'), {
      target: { value: 'king-deposed' },
    });
    fireEvent.change(endings().getByLabelText('Ending fires'), {
      target: { value: 'left' },
    });
    expect(
      (endings().getByLabelText('Ending exit') as HTMLSelectElement).value
    ).toBe('front-door');
    // A leave always says what leaving means: no "(not stated)".
    const outcome = endings().getByLabelText(
      'Ending outcome'
    ) as HTMLSelectElement;
    expect([...outcome.options].map((o) => o.value)).toEqual([
      'success',
      'failure',
    ]);
    fireEvent.change(endings().getByLabelText('Ending if form'), {
      target: { value: 'fact' },
    });
    fireEvent.change(endings().getByLabelText('Ending if fact'), {
      target: { value: 'throne-taken' },
    });
    expect(
      endings().getByText(
        'The run ends when the last one standing leaves by front-door, success if throne-taken is known.'
      )
    ).toBeTruthy();
    fireEvent.click(endings().getByRole('button', { name: 'Apply ending' }));
    expect(session.endings.set).toHaveBeenLastCalledWith([
      ...session.document.scope.endings!,
      {
        id: 'king-deposed',
        when: { left: 'front-door' },
        if: { fact: 'throne-taken' },
        outcome: 'success',
      },
    ]);
  });

  it('by any other way out writes not around left', () => {
    const session = gateSession();
    render(<StudioEndings session={session} />);
    fireEvent.click(
      endings().getByRole('button', { name: 'Edit ending captain-lives' })
    );
    fireEvent.click(endings().getByLabelText('Ending by any other way out'));
    fireEvent.click(endings().getByRole('button', { name: 'Apply ending' }));
    expect(session.endings.set).toHaveBeenLastCalledWith([
      session.document.scope.endings![0],
      {
        id: 'captain-lives',
        when: { not: { left: 'front-door' } },
        outcome: 'failure',
      },
    ]);
  });
});
