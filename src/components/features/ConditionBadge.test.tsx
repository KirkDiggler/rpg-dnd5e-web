// @vitest-environment jsdom
import { create } from '@bufbuild/protobuf';
import { ConditionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import { ConditionId } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConditionBadge } from './ConditionBadge';

afterEach(cleanup);

describe('ConditionBadge current Raging', () => {
  it.each([{ barbarian_level: true }, { fixed: 3 }])(
    'shows owned progress and server text without inventing a bonus from %j',
    (damageBonus) => {
      const data = {
        ref: 'dnd5e:conditions:raging',
        member_id: 'hero',
        origin: { ref: 'example:items:ring', entity_id: 'ring-17' },
        bindings: { damage_bonus: damageBonus },
        runtime: {
          state: 'raging',
          bag: {
            turns_active: 3,
            round_activated: 4,
            saw_turn_end: true,
            was_hit_this_turn: false,
            did_attack_this_turn: true,
          },
        },
      };
      const condition = create(ConditionSchema, {
        id: ConditionId.RAGING,
        name: 'Raging',
        source: 'example:items:ring',
        notes: 'Rulebook-authored description',
        conditionData: new TextEncoder().encode(JSON.stringify(data)),
      });
      render(<ConditionBadge condition={condition} />);
      const badge = screen.getByText('Raging').closest('div');
      expect(badge?.getAttribute('title')).toContain('Active for 3 turns');
      expect(badge?.getAttribute('title')).toContain(
        'Rulebook-authored description'
      );
      expect(badge?.getAttribute('title')).not.toContain('+3');
      expect(badge?.getAttribute('title')).not.toContain('undefined');
      expect(screen.queryByText(/^\+/)).toBeNull();
    }
  );
});
