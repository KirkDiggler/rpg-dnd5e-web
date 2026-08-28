import { create } from '@bufbuild/protobuf';
import {
  DownedSchema,
  EventKind,
  EventSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { DamageType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { createAttackAuthorityFixture } from './presentation.test-fixtures';
import {
  buildCombatAttackOutcome,
  buildCombatStory,
  type CombatStoryFact,
} from './story';

const context = {
  viewerMember: 'aldric',
  memberNames: {
    aldric: 'Aldric',
    'skeleton-guard': 'Skeleton Guard',
  },
};

function visible(
  event: CombatStoryFact['event'],
  source: CombatStoryFact['source'] = 'live'
): CombatStoryFact {
  return { event, source, visible: true };
}

describe('typed combat Story', () => {
  it('groups exactly one Struck/Missed by authoritative session and sequence', () => {
    const first = createAttackAuthorityFixture();
    const conflictingDuplicate = createAttackAuthorityFixture({
      hit: false,
      damage: 0,
      roll: 2,
      total: 7,
    });

    const story = buildCombatStory(
      [visible(first.event), visible(conflictingDuplicate.event)],
      context
    );

    expect(story).toHaveLength(1);
    expect(story[0]?.detail).toContain('12');
    expect(story[0]?.detail).not.toContain('2 →');
  });

  it('uses the provider full AttackRef, display name, and damage type without deriving HP', () => {
    const facts = createAttackAuthorityFixture({
      attackRef: 'dnd5e:weapons:longsword',
      attackName: 'Longsword',
      damageType: DamageType.SLASHING,
      damage: 8,
    });
    const [entry] = buildCombatStory([visible(facts.event)], context);
    const outcome = buildCombatAttackOutcome(facts.event, context);

    expect(entry).toMatchObject({
      eyebrow: 'Aldric · Longsword',
      attack: {
        ref: 'dnd5e:weapons:longsword',
        name: 'Longsword',
        damageType: DamageType.SLASHING,
      },
    });
    expect(entry?.detail).toContain('8 slashing damage');
    expect(outcome).toMatchObject({
      action: 'Longsword',
      attackRef: 'dnd5e:weapons:longsword',
      damage: 8,
      damageType: 'slashing',
    });
    expect(outcome).not.toHaveProperty('bonus');
    expect(outcome).not.toHaveProperty('hpAfter');
  });

  it('renders a Missed event without inventing zero damage', () => {
    const facts = createAttackAuthorityFixture({
      hit: false,
      damage: 0,
      roll: 3,
      total: 8,
    });
    const [entry] = buildCombatStory([visible(facts.event)], context);
    const outcome = buildCombatAttackOutcome(facts.event, context);

    expect(entry?.headline).toBe('Skeleton Guard evades Aldric');
    expect(entry?.detail).toBe('d20 3 · total 8 against AC 13 · Miss');
    expect(outcome).not.toHaveProperty('damage');
    expect(outcome?.hit).toBe(false);
  });

  it('omits a buffered actor event rather than falling back to payload prose', () => {
    const facts = createAttackAuthorityFixture();
    facts.event.payload = new TextEncoder().encode(
      'AUTHORED EARLY SPOILER: Aldric rolled twelve'
    );

    expect(
      buildCombatStory(
        [{ event: facts.event, source: 'live', visible: false }],
        context
      )
    ).toEqual([]);
  });

  it('keeps other Story entries sourced from typed bodies and ignores raw payload', () => {
    const event = create(EventSchema, {
      session: 'crypt-run',
      seq: 24n,
      at: 10n,
      recipient: 'aldric',
      kind: EventKind.DOWNED,
      payload: new TextEncoder().encode('fixture says a dragon explodes'),
      body: {
        case: 'downed',
        value: create(DownedSchema, { member: 'skeleton-guard' }),
      },
    });

    const [entry] = buildCombatStory([visible(event)], context);
    expect(entry?.headline).toBe('Skeleton Guard is downed');
    expect(JSON.stringify(entry)).not.toContain('dragon explodes');
  });
});
