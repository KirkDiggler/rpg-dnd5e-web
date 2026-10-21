// @vitest-environment node
/**
 * A Sanctuary-style ward's own d20 reaching the table (rpg-project#630).
 *
 * A warded swing and a warded cast each carry the blocked attacker's or
 * caster's own failed save against the warding caster's DC, so each becomes
 * `kind: 'save'` authority under the same recipient-local act identity
 * `savePresentation.test.ts` covers.
 */
import { create } from '@bufbuild/protobuf';
import { AttackResponseSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  ActSchema,
  AttackOutcome,
  CastOutcome,
  Family,
  PartyKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import {
  emptyPresentation,
  reduceCombatPresentation,
  selectCurrentDiceEvents,
  selectVisibleStory,
  type CombatPresentationState,
} from './presentation';

const member = (id: string) => ({ kind: PartyKind.MEMBER, id });
const save = { dice: [8], total: 10, against: 15, beaten: false };

function configured(): CombatPresentationState {
  return reduceCombatPresentation(emptyPresentation(), {
    type: 'configure',
    session: 'crypt-run',
    viewerMember: 'fighter-1',
    memberNames: { 'fighter-1': 'Vex', 'cleric-1': 'Alder' },
    rollerRoles: { 'fighter-1': 'player', 'cleric-1': 'player' },
  });
}

const wardedSwing = () =>
  create(ActSchema, {
    session: 'crypt-run',
    id: 'id-ward',
    act: 'attack:id-ward',
    verb: 'attack',
    family: Family.ACT,
    body: {
      case: 'attack',
      value: {
        by: member('fighter-1'),
        to: member('cleric-1'),
        outcome: AttackOutcome.WARDED,
        attack: { name: 'Longsword' },
        ward: { source: member('cleric-1'), ability: 'wis', roll: save },
      },
    },
  });

const wardedCast = () =>
  create(ActSchema, {
    session: 'crypt-run',
    id: 'id-cast',
    act: 'cast:id-cast',
    verb: 'cast',
    family: Family.ACT,
    body: {
      case: 'cast',
      value: {
        by: member('fighter-1'),
        spell: { name: 'Fire Bolt' },
        targets: [member('cleric-1')],
        results: [
          {
            target: member('cleric-1'),
            outcome: CastOutcome.WARDED,
            ability: 'wis',
            save,
            source: member('cleric-1'),
          },
        ],
      },
    },
  });

function accept(
  state: CombatPresentationState,
  act: ReturnType<typeof wardedSwing>
): CombatPresentationState {
  return reduceCombatPresentation(state, {
    type: 'stream-act',
    act,
    index: 0,
    seq: 50n,
    metadata: { source: 'live', startIndex: 0 },
  });
}

describe('a warded attack on the table', () => {
  it('rolls the attacker’s own save with a recipient-local identity', () => {
    const [request] = selectCurrentDiceEvents(
      accept(configured(), wardedSwing())
    );
    expect(request).toMatchObject({
      type: 'dice-presentation-requested',
      presentationId: 'session:crypt-run:id-ward.0.0',
      authoritySeq: 50n,
      die: { kind: 'd20', authoritativeResult: 8 },
    });
  });

  it('never marks the beat conflicted', () => {
    const state = accept(configured(), wardedSwing());
    expect(state.diagnostics).toEqual([]);
    expect(state.presentations.every((record) => !record.conflicted)).toBe(
      true
    );
  });

  it('arms the local player’s own die, as their own save would', () => {
    const record = accept(configured(), wardedSwing()).presentations[0];
    expect(record?.localPlayerOwned).toBe(true);
    expect(record?.authority.roller).toBe('fighter-1');
  });

  it('tells the story beside the roll: a save arrives resolved and settles', () => {
    const story = selectVisibleStory(accept(configured(), wardedSwing()));
    expect(story).toHaveLength(1);
    expect(story[0]?.headline).toBe("Vex's attack on Alder is warded");
    expect(story[0]?.detail).toBe("wis save against Alder's ward, 10 vs 15");
  });

  it('does not turn a warded attack response into a miss or an attack die, in either delivery order', () => {
    const fact = {
      type: 'attack-response' as const,
      session: 'crypt-run',
      attacker: 'fighter-1',
      target: 'cleric-1',
      response: create(AttackResponseSchema, {
        warded: true,
        wardedBy: 'cleric-1',
      }),
    };
    const responseFirst = reduceCombatPresentation(configured(), fact);
    expect(responseFirst.presentations).toEqual([]);
    expect(responseFirst.diagnostics).toEqual([]);
    const actFirst = accept(configured(), wardedSwing());
    expect(reduceCombatPresentation(actFirst, fact)).toEqual(actFirst);
    expect(accept(responseFirst, wardedSwing())).toEqual(actFirst);
  });
});

describe('a warded cast on the table', () => {
  it('rolls the caster’s own save the same way', () => {
    const state = accept(configured(), wardedCast());
    const [request] = selectCurrentDiceEvents(state);
    expect(request).toMatchObject({
      type: 'dice-presentation-requested',
      presentationId: 'session:crypt-run:id-cast.0.0',
      die: { kind: 'd20', authoritativeResult: 8 },
    });
    expect(state.presentations[0]?.authority.roller).toBe('fighter-1');
  });
});
