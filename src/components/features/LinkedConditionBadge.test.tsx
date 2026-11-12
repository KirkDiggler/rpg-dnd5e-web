// @vitest-environment jsdom
import fixtures from '@/types/__fixtures__/linked-conditions.json';
import { create } from '@bufbuild/protobuf';
import { ConditionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConditionBadge } from './ConditionBadge';

afterEach(cleanup);

describe('linked maintenance badge', () => {
  it('renders server maintenance without calculating a countdown or reading cached payload fields', () => {
    const condition = create(ConditionSchema, {
      name: 'Concentrating on Bless',
      source: 'dnd5e:spells:bless',
      notes: 'Requires concentration. 7 maintainer turn ends remaining.',
      conditionData: new TextEncoder().encode(
        JSON.stringify({ ...fixtures.pendingCoordinator, damage_dice: 99 })
      ),
    });
    render(<ConditionBadge condition={condition} />);
    const title = screen
      .getByText('Concentrating on Bless')
      .closest('div')
      ?.getAttribute('title');
    expect(title).toContain(condition.notes);
    expect(title).not.toContain('10');
    expect(title).not.toContain('99');
    expect(screen.queryByText('99d6')).toBeNull();
  });

  it('renders a recipient without inventing its remote owner countdown', () => {
    const condition = create(ConditionSchema, {
      name: 'Blessed',
      notes: 'Server-owned selected contribution description.',
      source: 'dnd5e:spells:bless',
      conditionData: new TextEncoder().encode(
        JSON.stringify(fixtures.recipient)
      ),
    });
    render(<ConditionBadge condition={condition} />);
    const title = screen
      .getByText('Blessed')
      .closest('div')
      ?.getAttribute('title');
    expect(title).toContain(condition.notes);
    expect(title).not.toContain('remaining');
    expect(title).not.toContain('undefined');
  });
});
