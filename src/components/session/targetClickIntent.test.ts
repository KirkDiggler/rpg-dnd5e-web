import {
  MemberKind,
  Passage,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import type { SightedMember } from './sightingEntities';
import { STANCE_ALLIED, STANCE_NEUTRAL } from './stanceRing';
import { targetClickIntent, type TargetClickArgs } from './targetClickIntent';

/** The gate guard on his post, as the S1 sighting carries him. */
const guard = {
  subject: 'gate-1',
  name: 'Gate Guard',
  kind: MemberKind.MONSTER,
  passage: Passage.BLOCKED,
  holdsDoor: 'the-mad-king/gate-wall-door',
  stance: STANCE_NEUTRAL,
  monsterRefId: 'gate',
  position: { x: 4, y: 2, z: -6 },
  remembered: false,
} as SightedMember;

const onTheMovePicker: TargetClickArgs = {
  observed: guard,
  isSelf: false,
  memberTargeting: false,
  cellAim: false,
  attackable: false,
  approachArmed: false,
  moveArmed: true,
};
const click = (over: Partial<TargetClickArgs>) =>
  targetClickIntent({ ...onTheMovePicker, ...over });

describe('the move picker on a body (rpg-project#835 R8)', () => {
  it('a blocking body, not attackable, not allied: a Move into him', () => {
    expect(click({})).toBe('bump');
  });

  it('an attackable body is attacked, as before', () => {
    expect(click({ attackable: true })).toBe('attack');
  });

  it('an allied body is not bumped', () => {
    expect(click({ observed: { ...guard, stance: STANCE_ALLIED } })).toBe(
      'none'
    );
  });

  it.each([Passage.STANDABLE, Passage.PASS_THROUGH])(
    'a body that does not block (%s) is unchanged',
    (passage) => {
      expect(click({ observed: { ...guard, passage } })).toBe('none');
    }
  );

  it('a memory of him is not bumped', () => {
    expect(click({ observed: { ...guard, remembered: true } })).toBe('none');
  });

  it('off the move picker the click is unchanged', () => {
    expect(click({ moveArmed: false })).toBe('none');
  });

  it('an armed Speak still approaches him', () => {
    expect(click({ approachArmed: true })).toBe('approach');
  });

  it('a placed world NPC is still interacted with', () => {
    expect(click({ observed: { ...guard, kind: MemberKind.WORLD } })).toBe(
      'interact'
    );
  });

  it('choosing whom to strike or aim at is unchanged', () => {
    expect(click({ memberTargeting: true })).toBe('none');
    expect(click({ memberTargeting: true, attackable: true })).toBe('select');
    expect(click({ cellAim: true })).toBe('aim');
  });
});

describe('click a creature to act (rpg-project#872)', () => {
  const hostile = { ...guard, stance: 'hostile', passage: Passage.STANDABLE };
  const strike = { verb: 'attack', reach: 'approach' } as const;

  it('with the dial off (no verbs) a hostile click is what it was', () => {
    expect(click({ observed: hostile })).toBe('none');
    expect(click({})).toBe('bump');
  });

  it('one verb acts at once', () => {
    expect(click({ observed: hostile, verbs: [strike] })).toBe('strike');
    expect(click({ verbs: [{ verb: 'speak' }] })).toBe('speak');
    expect(click({ verbs: [{ verb: 'bump' }] })).toBe('bump');
  });

  it('more than one shows the choices', () => {
    expect(click({ verbs: [strike, { verb: 'bump' }] })).toBe('menu');
  });

  it('an Attack alone that no walk reaches does nothing', () => {
    expect(
      click({
        observed: hostile,
        verbs: [{ verb: 'attack', reach: 'out-of-reach' }],
      })
    ).toBe('none');
  });

  it('whatever is armed still wins', () => {
    expect(click({ verbs: [strike], attackable: true })).toBe('attack');
    expect(click({ verbs: [strike], approachArmed: true })).toBe('approach');
    expect(click({ verbs: [strike], memberTargeting: true })).toBe('none');
    expect(
      click({
        verbs: [strike],
        observed: { ...guard, kind: MemberKind.WORLD },
      })
    ).toBe('interact');
  });
});
