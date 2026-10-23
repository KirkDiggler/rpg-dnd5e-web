import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  AttackOutcome,
  DamageComponentSchema,
  DamageType,
  Family,
  PartyKind,
  RollSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { buildActStory } from './actStory';
import { RecentEventSummary } from './RecentEventSummary';
afterEach(cleanup);
function entry(incoming = false, withDamage = true) {
  const act = create(ActSchema, {
    session: 's',
    id: 'hit',
    family: Family.ACT,
    verb: 'attack',
    body: {
      case: 'attack',
      value: {
        by: { kind: PartyKind.MEMBER, id: incoming ? 'zombie' : 'player' },
        to: { kind: PartyKind.MEMBER, id: incoming ? 'player' : 'zombie' },
        attack: {
          name: 'Maul',
          ref: 'dnd5e:weapons:maul',
          damageType: DamageType.BLUDGEONING,
        },
        outcome: AttackOutcome.HIT,
        damage: 9,
        roll: { expression: '1d20 + 5', total: 18, against: 13 },
        damageComponents: withDamage
          ? [
              {
                source: 'Maul',
                damageType: DamageType.BLUDGEONING,
                roll: { expression: '2d6 + 3', total: 9 },
              },
            ]
          : [],
      },
    },
  });
  return buildActStory(
    [{ act, index: 0, seq: 1n, source: 'live', visible: true }],
    {
      viewerMember: 'player',
      memberNames: { player: 'Stanthony', zombie: 'Zombie' },
    }
  )[0]!;
}
describe('recent result summary', () => {
  it('renders a supplied flat ability contribution as a signed bonus strip, not another roll', () => {
    const value = entry();
    if (value.act?.body.case !== 'attack') throw Error('fixture');
    const attack = value.act.body.value;
    attack.damageComponents[0].source = 'weapon';
    attack.damageComponents[0].roll = create(RollSchema, {
      expression: '2d8',
      dice: [3, 4],
      total: 7,
    });
    attack.damageComponents.push(
      create(DamageComponentSchema, {
        source: 'ability',
        roll: {
          expression: '2',
          total: 2,
          modifiers: [{ source: 'ability', value: 2 }],
        },
      })
    );
    render(<RecentEventSummary entry={value} />);
    const bonus = screen.getByRole('group', { name: 'Damage bonus · ability' });
    expect(bonus).toHaveAttribute('data-kind', 'bonus');
    expect(bonus).toHaveTextContent('+2');
    expect(bonus.querySelector('code')).toBeNull();
    expect(
      screen.getByRole('group', { name: 'Damage roll · weapon' })
    ).toHaveAttribute('data-kind', 'damage');
  });
  it('does not classify by the source name or guess from missing dice detail', () => {
    const value = entry();
    if (value.act?.body.case !== 'attack') throw Error('fixture');
    value.act.body.value.damageComponents[0].source = 'ability';
    value.act.body.value.damageComponents[0].roll = create(RollSchema, {
      expression: '1d6 + 2',
      total: 5,
      modifiers: [{ source: 'ability', value: 2 }],
    });
    render(<RecentEventSummary entry={value} />);
    expect(screen.getByRole('group', { name: 'Damage roll' })).toHaveAttribute(
      'data-kind',
      'damage'
    );
    expect(screen.queryByRole('group', { name: /Damage bonus/ })).toBeNull();
  });
  it('separates headline, outcome and supplied attack/damage rolls', () => {
    render(<RecentEventSummary entry={entry()} />);
    expect(
      screen.getByRole('heading', { name: 'Stanthony strikes Zombie' })
    ).toBeInTheDocument();
    expect(screen.getByText('Maul: hit, 9 bludgeoning damage')).toHaveAttribute(
      'data-tone',
      'success'
    );
    const attack = screen.getByRole('group', { name: 'Attack roll' }),
      damage = screen.getByRole('group', { name: 'Damage roll' });
    expect(attack).toHaveAttribute('data-kind', 'attack');
    expect(attack).toHaveTextContent('1d20 + 5 = 18 > AC 13');
    expect(damage).toHaveAttribute('data-kind', 'damage');
    expect(damage).toHaveAttribute('data-tone', 'success');
    expect(damage).toHaveTextContent('2d6 + 3 = 9');
  });
  it('uses the same incoming damage tone as the player-facing feed', () => {
    render(<RecentEventSummary entry={entry(true)} />);
    expect(screen.getByText('Maul: hit, 9 bludgeoning damage')).toHaveAttribute(
      'data-tone',
      'danger'
    );
    expect(screen.getByRole('group', { name: 'Damage roll' })).toHaveAttribute(
      'data-tone',
      'danger'
    );
  });
  it('keeps a supplied zero roll distinct from a missing roll', () => {
    const value = entry();
    if (value.act?.body.case !== 'attack') throw Error('fixture');
    value.act.body.value.damage = 0;
    value.act.body.value.damageComponents[0].roll!.total = 0;
    render(<RecentEventSummary entry={value} />);
    expect(
      screen.getByText('Maul: hit, 0 bludgeoning damage')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Damage roll' })
    ).not.toHaveTextContent('Not supplied');
  });
  it('does not reverse-engineer a damage roll from the applied total', () => {
    render(<RecentEventSummary entry={entry(false, false)} />);
    expect(
      screen.getByText('Maul: hit, 9 bludgeoning damage')
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Damage roll' })).getByText(
        'Not supplied'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/2d6/)).toBeNull();
  });
  it('preserves component roll totals and supplied multipliers separately from applied damage', () => {
    const value = entry();
    if (value.act?.body.case !== 'attack') throw Error('fixture');
    value.act.body.value.damageComponents[0].roll!.total = 18;
    value.act.body.value.damageComponents[0].roll!.expression = '4d6 + 3';
    value.act.body.value.damageComponents[0].multiplier = 0.5;
    render(<RecentEventSummary entry={value} />);
    const damage = screen.getByRole('group', { name: 'Damage roll' });
    expect(damage).toHaveTextContent('18');
    expect(damage).toHaveTextContent('Applied multiplier ×0.5');
    expect(
      screen.getByText('Maul: hit, 9 bludgeoning damage')
    ).toBeInTheDocument();
  });
});
