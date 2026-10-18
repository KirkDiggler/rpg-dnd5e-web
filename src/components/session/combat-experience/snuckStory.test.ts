// @vitest-environment node
/**
 * The mover's sneak roll (rpg-project#606, sneaking R5, R12): the `snuck`
 * beat under EVENT_KIND_SNUCK is accepted, keeps its whole roll as identity,
 * and tells its story as a seen roll — naming the watcher only when the beat
 * names one, and "something is watching" when it does not.
 */
import { create } from '@bufbuild/protobuf';
import {
  DiceTraceSchema,
  EventKind,
  EventSchema,
  RollCalculationSchema,
  RollComponentSchema,
  RollSourceSchema,
  SnuckSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { describe, expect, it } from 'vitest';
import {
  emptyPresentation,
  reduceCombatPresentation,
  selectVisibleStory,
} from './presentation';

const config = {
  session: 'castle-run',
  viewerMember: 'aldric',
  memberNames: { aldric: 'Aldric', 'knight-1': 'Knight' },
  rollerRoles: {
    aldric: 'player' as const,
    'knight-1': 'monster' as const,
  },
};

const stealth = (roll: number, modifier: number) =>
  create(RollCalculationSchema, {
    total: roll + modifier,
    components: [
      create(RollComponentSchema, {
        dice: create(DiceTraceSchema, {
          notation: '1d20',
          dieSize: 20,
          originalRolls: [roll],
          finalRolls: [roll],
          subtotal: roll,
        }),
        source: create(RollSourceSchema, { label: 'Stealth', sourceId: '' }),
      }),
      create(RollComponentSchema, {
        modifier,
        source: create(RollSourceSchema, {
          label: 'Dexterity modifier',
          sourceId: '',
        }),
      }),
    ],
  });

function snuck(
  value: {
    watcher?: string;
    dc?: number;
    total?: number;
    beaten?: boolean;
    withCalculation?: boolean;
  } = {},
  kind: EventKind = EventKind.SNUCK,
  seq = 7n
) {
  const total = value.total ?? 17;
  return {
    type: 'stream-event' as const,
    event: create(EventSchema, {
      session: 'castle-run',
      seq,
      kind,
      recipient: 'aldric',
      body: {
        case: 'snuck' as const,
        value: create(SnuckSchema, {
          member: 'aldric',
          watcher: value.watcher ?? '',
          dc: value.dc ?? 13,
          total,
          beaten: value.beaten ?? true,
          ...(value.withCalculation === false
            ? {}
            : { calculation: stealth(total - 3, 3) }),
        }),
      },
    }),
    metadata: { source: 'live' as const },
  };
}

const reduce = (fact: ReturnType<typeof snuck>) =>
  reduceCombatPresentation(emptyPresentation(config), fact);

describe('the snuck beat (rpg-project#606)', () => {
  it('maps EVENT_KIND_SNUCK (48) to the snuck body and accepts it', () => {
    expect(EventKind.SNUCK).toBe(48);
    const state = reduce(snuck({ watcher: 'knight-1' }));
    expect(
      state.diagnostics.filter((line) => line.includes('mismatch'))
    ).toEqual([]);
    expect(state.otherStory).toHaveLength(1);
  });

  it('tells no story for a snuck body under another kind', () => {
    const state = reduce(snuck({ watcher: 'knight-1' }, EventKind.HEARD));
    expect(state.otherStory).toEqual([]);
    expect(selectVisibleStory(state)).toEqual([]);
  });

  it('keeps two rolls that differ only in the die as distinct beats', () => {
    const state = reduce(snuck({ watcher: 'knight-1', total: 17 }));
    const repeated = reduceCombatPresentation(
      state,
      snuck({ watcher: 'knight-1', total: 17 })
    );
    expect(repeated.otherStory[0]?.conflicted).toBe(false);
    const changed = reduceCombatPresentation(
      state,
      snuck({ watcher: 'knight-1', total: 9 })
    );
    expect(changed.otherStory[0]?.conflicted).toBe(true);
  });

  const lineFor = (value: Parameters<typeof snuck>[0]) =>
    selectVisibleStory(reduce(snuck(value)))[0];

  it('names a watcher the mover sees: unseen, with the whole roll in the detail', () => {
    expect(
      lineFor({ watcher: 'knight-1', dc: 13, total: 17, beaten: true })
    ).toMatchObject({
      eyebrow: 'Sneaking',
      headline: 'Stealth 17 vs DC 13 — unseen by Knight',
      detail: '1d20 [14] + 3 Dexterity modifier = 17',
      tone: 'success',
    });
  });

  it('names a watcher the mover sees: spotted', () => {
    expect(
      lineFor({ watcher: 'knight-1', dc: 13, total: 9, beaten: false })
    ).toMatchObject({
      headline: 'Stealth 9 vs DC 13 — spotted by Knight',
      detail: '1d20 [6] + 3 Dexterity modifier = 9',
      tone: 'danger',
    });
  });

  it('an unseen watcher: unseen, something is watching, nobody named', () => {
    const line = lineFor({ watcher: '', dc: 15, total: 18, beaten: true });
    expect(line).toMatchObject({
      headline: 'Stealth 18 vs DC 15 — unseen; something is watching',
      tone: 'success',
    });
    expect(`${line?.headline} ${line?.detail}`).not.toMatch(/Knight|knight-1/);
  });

  it('an unseen watcher: spotted, something is watching, nobody named', () => {
    const line = lineFor({ watcher: '', dc: 15, total: 11, beaten: false });
    expect(line).toMatchObject({
      headline: 'Stealth 11 vs DC 15 — spotted; something is watching',
      detail: '1d20 [8] + 3 Dexterity modifier = 11',
      tone: 'danger',
    });
    expect(`${line?.headline} ${line?.detail}`).not.toMatch(/Knight|knight-1/);
  });

  it('takes the verdict from the server, not from total against dc', () => {
    // A total over the DC that the server judged lost still reads spotted.
    expect(
      lineFor({ watcher: 'knight-1', dc: 13, total: 17, beaten: false })
        ?.headline
    ).toBe('Stealth 17 vs DC 13 — spotted by Knight');
  });

  it('leaves the detail empty when the beat carries no calculation', () => {
    expect(
      lineFor({
        watcher: 'knight-1',
        dc: 13,
        total: 9,
        beaten: false,
        withCalculation: false,
      })
    ).toMatchObject({
      headline: 'Stealth 9 vs DC 13 — spotted by Knight',
      detail: '',
    });
  });
});
