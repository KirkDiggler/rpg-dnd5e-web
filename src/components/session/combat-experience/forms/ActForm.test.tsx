import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  ActSchema,
  AttackOutcome,
  ClockMark,
  Family,
  PartyKind,
  Sense,
  StateKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { describeAct, formatRollFormula } from '../describeAct';
import { ActForm } from './ActForm';

afterEach(cleanup);
const context = {
  viewerMember: 'alice',
  memberNames: { alice: 'Alice', 'gate-1': 'Gate Guard' },
};
const alice = { kind: PartyKind.MEMBER, id: 'alice' };
const gate = { kind: PartyKind.MEMBER, id: 'gate-1' };
type Body = MessageInitShape<typeof ActSchema>['body'];
const at = (family: Family, body: Body, verb = '') =>
  create(ActSchema, { session: 's', id: 'id-1', family, verb, body });
const roll = { dice: [12], total: 15, against: 13, beaten: true };

/** One fixture per family; each carries a roll so its formula can show. */
const FAMILIES: Record<string, ReturnType<typeof at>> = {
  act: at(Family.ACT, {
    case: 'attack',
    value: {
      by: alice,
      to: gate,
      attack: { name: 'Longsword' },
      outcome: AttackOutcome.HIT,
      damage: 4,
      roll,
    },
  }),
  reaction: at(Family.REACTION, {
    case: 'attack',
    value: {
      by: gate,
      to: alice,
      attack: { name: 'Halberd' },
      reaction: { name: 'Opportunity Attack' },
      outcome: AttackOutcome.MISS,
      roll: { ...roll, beaten: false },
    },
  }),
  tableAnswer: at(
    Family.TABLE_ANSWER,
    {
      case: 'tableAnswer',
      value: { who: gate, word: 'refuses', roll: { total: 75, of: 100 } },
    },
    'speak'
  ),
  state: at(Family.STATE, {
    case: 'state',
    value: { party: gate, change: StateKind.DOWNED },
  }),
  perception: at(Family.PERCEPTION, {
    case: 'perception',
    value: {
      observer: alice,
      sense: Sense.DISCOVERY,
      discovery: { ability: 'Wisdom', roll },
    },
  }),
  clock: at(Family.CLOCK, {
    case: 'clock',
    value: {
      mark: ClockMark.ROLL_WINDOW_OPENED,
      rollWindow: { audience: alice, offer: { name: 'Bardic Inspiration' } },
    },
  }),
};

describe('one form per family, two sizes', () => {
  for (const [family, act] of Object.entries(FAMILIES)) {
    it(`${family}: the toast is the describer line; the log adds the formula`, () => {
      const text = describeAct(act, context)!.text;
      const toast = render(
        <ActForm act={act} size="toast" context={context} />
      );
      const toastForm = toast.container.querySelector('[data-size="toast"]');
      expect(toastForm?.textContent).toBe(text);
      toast.unmount();

      const log = render(<ActForm act={act} size="log" context={context} />);
      const logForm = log.container.querySelector('[data-size="log"]');
      expect(logForm?.textContent).toContain(text);
      const formula = formatRollFormula(act, context);
      if (formula) {
        expect(screen.getByTestId('act-form-formula').textContent).toBe(
          formula
        );
      } else {
        expect(screen.queryByTestId('act-form-formula')).toBeNull();
      }
      log.unmount();
    });
  }

  it('the families with a roll show a formula at log size', () => {
    const withFormula = Object.entries(FAMILIES)
      .filter(([, act]) => formatRollFormula(act, context))
      .map(([family]) => family);
    expect(withFormula).toEqual([
      'act',
      'reaction',
      'tableAnswer',
      'perception',
    ]);
  });
});

describe('breakdown folded by default', () => {
  it('the breakdown sits in a closed fold under the formula', () => {
    const swing = at(Family.ACT, {
      case: 'attack',
      value: {
        by: alice,
        to: gate,
        attack: { name: 'Longsword' },
        outcome: AttackOutcome.HIT,
        roll: {
          dice: [3],
          modifiers: [{ source: 'Longsword', value: 5 }],
          total: 8,
          against: 8,
          beaten: true,
          terms: [
            { count: 1, dieSize: 20, faces: [3], sourceName: 'Longsword' },
          ],
        },
      },
    });
    render(<ActForm act={swing} size="log" context={context} />);
    const breakdown = screen.getByTestId('story-roll-breakdown');
    expect(breakdown.textContent).toBe(
      '1d20 [3] + 5 (Longsword) = 8 vs 8 · beaten'
    );
    const fold = breakdown.closest('details');
    expect(fold).not.toBeNull();
    expect(fold?.open).toBe(false);
  });

  it('the toast never shows the breakdown', () => {
    render(<ActForm act={FAMILIES.act!} size="toast" context={context} />);
    expect(screen.queryByTestId('story-roll-breakdown')).toBeNull();
    expect(screen.queryByTestId('act-form-formula')).toBeNull();
  });
});
