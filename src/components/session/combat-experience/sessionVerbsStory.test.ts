/**
 * What the log says when a hand changes or a member rests (rpg-project#542).
 * Both arms are added to a switch that is not exhaustiveness-enforced, so
 * these tests are what fails when an arm is gone.
 */
import { create } from '@bufbuild/protobuf';
import {
  ConcentrationEndedSchema,
  ConditionRemovedSchema,
  EquipmentChange,
  EquipmentChangedSchema,
  EventKind,
  EventSchema,
  RestedSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  RestKind,
  SpellRefSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { buildCombatStory, type CombatStoryFact } from './story';

const context = {
  viewerMember: 'p1',
  memberNames: { p1: 'Lyric' },
};

function visible(event: CombatStoryFact['event']): CombatStoryFact {
  return { event, source: 'live', visible: true };
}

function equipment(item: string, change: EquipmentChange, seq = 7n) {
  return create(EventSchema, {
    session: 'run',
    seq,
    recipient: 'p1',
    correlation: 'swap-1',
    kind: EventKind.EQUIPMENT_CHANGED,
    body: {
      case: 'equipmentChanged',
      value: create(EquipmentChangedSchema, {
        member: 'p1',
        slot: 'main_hand',
        item,
        change,
      }),
    },
  });
}

describe('the equipment-changed beat', () => {
  it('says a weapon is drawn and stowed', () => {
    const [draw] = buildCombatStory(
      [visible(equipment('dnd5e:weapons:longsword', EquipmentChange.DRAW))],
      context
    );
    const [stow] = buildCombatStory(
      [visible(equipment('dnd5e:weapons:longsword', EquipmentChange.STOW))],
      context
    );
    expect(draw?.headline).toBe('Lyric draws a longsword');
    expect(stow?.headline).toBe('Lyric stows a longsword');
  });

  it('says armour is donned and doffed', () => {
    const [don] = buildCombatStory(
      [visible(equipment('dnd5e:armor:chain-mail', EquipmentChange.DRAW))],
      context
    );
    const [doff] = buildCombatStory(
      [visible(equipment('dnd5e:armor:chain-mail', EquipmentChange.STOW))],
      context
    );
    expect(don?.headline).toBe('Lyric dons the chain mail');
    expect(doff?.headline).toBe('Lyric doffs the chain mail');
  });

  it('renders a swap sharing one correlation as two lines, not one', () => {
    const entries = buildCombatStory(
      [
        visible(equipment('dnd5e:weapons:dagger', EquipmentChange.STOW, 7n)),
        visible(equipment('dnd5e:weapons:longsword', EquipmentChange.DRAW, 8n)),
      ],
      context
    );
    expect(entries.map((entry) => entry.headline)).toEqual([
      'Lyric stows a dagger',
      'Lyric draws a longsword',
    ]);
  });
});

function rested() {
  return create(EventSchema, {
    session: 'run',
    seq: 9n,
    recipient: 'p1',
    kind: EventKind.RESTED,
    body: {
      case: 'rested',
      value: create(RestedSchema, {
        member: 'p1',
        kind: RestKind.SHORT,
        hitPointsRestored: 6,
        hitPoints: 14,
        hitDiceSpent: 2,
        resourcesRefilled: ['dnd5e:features:second-wind'],
        concentrationEnded: [
          create(ConcentrationEndedSchema, {
            caster: 'p1',
            reason: 'rest',
            spell: create(SpellRefSchema, {
              ref: 'dnd5e:spells:bless',
              name: 'Bless',
            }),
          }),
        ],
        ended: [
          create(ConditionRemovedSchema, {
            target: 'p1',
            ref: 'dnd5e:conditions:raging',
            name: 'Raging',
            reason: 'rest',
          }),
        ],
      }),
    },
  });
}

describe('the rested beat', () => {
  it('reads the outcome, what was refilled, and each thing the rest ended', () => {
    const [entry] = buildCombatStory([visible(rested())], context);

    expect(entry?.headline).toBe(
      'Lyric takes a short rest: +6 hit points (spent 2 hit dice), second wind restored'
    );
    expect(entry?.detail.split('\n')).toEqual([
      'Lyric loses concentration on Bless',
      'Lyric is no longer Raging',
    ]);
  });
});

describe('the rest removal reason', () => {
  it('is phrased as a rest, and the long one still is', () => {
    const phrased = (reason: string) =>
      buildCombatStory(
        [
          visible(
            create(EventSchema, {
              session: 'run',
              seq: 3n,
              kind: EventKind.CONCENTRATION_ENDED,
              body: {
                case: 'concentrationEnded',
                value: create(ConcentrationEndedSchema, {
                  caster: 'p1',
                  reason,
                }),
              },
            })
          ),
        ],
        context
      )[0]?.detail;
    expect(phrased('rest')).toBe('a rest.');
    expect(phrased('long rest')).toBe('a long rest.');
  });
});
