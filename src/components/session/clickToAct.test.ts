/**
 * What a click on a creature can do, read off the server's offers
 * (rpg-project#872). The Attack row's candidate is the only authority on
 * reach: `available` means in reach now, `approach` means this turn's walk
 * stops in reach there, and neither means out of reach.
 */
import { create } from '@bufbuild/protobuf';
import {
  DeclarationSchema,
  MemberKind,
  Passage,
  ShortfallReason,
  ShortfallSchema,
  Slot,
  SpeakOptionSchema,
  TargetCandidateSchema,
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  attackReachFor,
  clickToActOffers,
  creatureClick,
  creatureVerbs,
  verbEnabled,
  verbLabel,
  type CreatureVerb,
} from './clickToAct';
import type { SightedMember } from './sightingEntities';
import { STANCE_HOSTILE, STANCE_NEUTRAL } from './stanceRing';

const CELL = { x: 8, y: 0 } as never;

function attack(
  over: Partial<{
    id: string;
    slot: Slot;
    available: boolean;
    why: ShortfallReason;
    candidate: 'in-reach' | 'approach' | 'out-of-reach';
  }> = {}
): Declaration {
  const candidate = over.candidate ?? 'in-reach';
  const inReach = candidate === 'in-reach';
  const available = over.available ?? inReach;
  return create(DeclarationSchema, {
    id: over.id ?? 'attack.1',
    verb: Verb.ATTACK,
    slot: over.slot ?? Slot.ACTION,
    available,
    why: available
      ? undefined
      : create(ShortfallSchema, {
          reason: over.why ?? ShortfallReason.NO_TARGET_IN_REACH,
        }),
    targetKind: TargetKind.MEMBER,
    candidates: [
      create(TargetCandidateSchema, {
        member: 'orc-2',
        available: inReach,
        approach: candidate === 'approach' ? CELL : undefined,
      }),
    ],
  });
}

const orc = {
  subject: 'orc-2',
  name: 'Orc',
  kind: MemberKind.MONSTER,
  passage: Passage.STANDABLE,
  stance: STANCE_HOSTILE,
  position: { x: 9, y: 0, z: -9 },
  remembered: false,
} as SightedMember;

describe('attackReachFor: the Attack row’s answer for one candidate', () => {
  it('in reach when the row and the candidate are both available', () => {
    expect(attackReachFor([attack()], 'orc-2')?.kind).toBe('in-reach');
  });

  it('a walk to the server’s cell when the candidate carries one', () => {
    const reach = attackReachFor([attack({ candidate: 'approach' })], 'orc-2');
    expect(reach).toMatchObject({ kind: 'approach', cell: CELL });
  });

  it('out of reach when the candidate carries no cell', () => {
    expect(
      attackReachFor([attack({ candidate: 'out-of-reach' })], 'orc-2')?.kind
    ).toBe('out-of-reach');
  });

  it.each([
    ShortfallReason.NOT_YOUR_TURN,
    ShortfallReason.NO_BUDGET,
    ShortfallReason.DOWNED,
  ])(
    'a row refused for something other than reach (%s) offers nothing',
    (why) => {
      expect(
        attackReachFor(
          [attack({ candidate: 'approach', available: false, why })],
          'orc-2'
        )
      ).toBeNull();
    }
  );

  it('a candidate in reach on a row refused for the turn is not in reach', () => {
    expect(
      attackReachFor(
        [attack({ available: false, why: ShortfallReason.NOT_YOUR_TURN })],
        'orc-2'
      )
    ).toBeNull();
  });

  it('nobody the row names offers nothing', () => {
    expect(attackReachFor([attack()], 'cook-3')).toBeNull();
  });

  it('prefers the action-slot swing over a bonus one', () => {
    const reach = attackReachFor(
      [
        attack({ id: 'offhand', slot: Slot.BONUS }),
        attack({ id: 'main', slot: Slot.ACTION }),
      ],
      'orc-2'
    );
    expect(reach?.kind === 'in-reach' && reach.declaration.id).toBe('main');
  });

  it('in reach on any row beats a walk on another', () => {
    const reach = attackReachFor(
      [
        attack({ id: 'main', candidate: 'approach' }),
        attack({ id: 'offhand', slot: Slot.BONUS }),
      ],
      'orc-2'
    );
    expect(reach?.kind === 'in-reach' && reach.declaration.id).toBe('offhand');
  });
});

describe('clickToActOffers', () => {
  it('reads every candidate’s answer and every member Speak lists', () => {
    const speak = create(DeclarationSchema, {
      id: 'speak.1',
      verb: Verb.SPEAK,
      available: true,
      targetKind: TargetKind.MEMBER,
      speakOptions: [
        create(SpeakOptionSchema, {
          target: { case: 'memberId', value: 'cook-3' },
          optionId: 'gossip',
          line: 'Heard anything?',
          available: true,
        }),
      ],
    });
    const offers = clickToActOffers([attack({ candidate: 'approach' }), speak]);
    expect(offers.attackReach.get('orc-2')?.kind).toBe('approach');
    expect(offers.speakListed.has('cook-3')).toBe(true);
    expect(offers.speakListed.has('orc-2')).toBe(false);
    expect(offers.speakApproachable).toBe(true);
  });

  it('no Speak offer, nobody to walk to for a word', () => {
    expect(clickToActOffers([attack()]).speakApproachable).toBe(false);
  });
});

describe('creatureVerbs: only what the server offers for him', () => {
  const inReach = attackReachFor([attack()], 'orc-2');

  it('a hostile on the Attack row offers Attack', () => {
    expect(
      creatureVerbs({
        member: orc,
        attack: inReach,
        speakListed: false,
        speakApproachable: false,
        bumpable: false,
      })
    ).toEqual([{ verb: 'attack', reach: 'in-reach' }]);
  });

  it('a creature that is not hostile is not attacked by a click', () => {
    expect(
      creatureVerbs({
        member: { ...orc, stance: STANCE_NEUTRAL },
        attack: inReach,
        speakListed: false,
        speakApproachable: false,
        bumpable: false,
      })
    ).toEqual([]);
  });

  it('a memory offers nothing', () => {
    expect(
      creatureVerbs({
        member: { ...orc, remembered: true },
        attack: inReach,
        speakListed: true,
        speakApproachable: false,
        bumpable: true,
      })
    ).toEqual([]);
  });

  it('lists Attack, Speak and the bump in that order', () => {
    expect(
      creatureVerbs({
        member: orc,
        attack: inReach,
        speakListed: true,
        speakApproachable: false,
        bumpable: true,
      }).map((verb) => verb.verb)
    ).toEqual(['attack', 'speak', 'bump']);
  });
});

describe('Speak beyond reach (rpg-project#872 D3, R4 approach)', () => {
  const approach = attackReachFor([attack({ candidate: 'approach' })], 'orc-2');

  it('a far hostile the Speak row does not list still offers Speak beside Attack', () => {
    const verbs = creatureVerbs({
      member: orc,
      attack: approach,
      speakListed: false,
      speakApproachable: true,
      bumpable: false,
    });
    expect(verbs.map((verb) => verb.verb)).toEqual(['attack', 'speak']);
    expect(creatureClick(verbs)).toBe('menu');
  });

  it('a far blocking body offers Speak beside the bump', () => {
    const verbs = creatureVerbs({
      member: { ...orc, stance: STANCE_NEUTRAL, passage: Passage.BLOCKED },
      attack: null,
      speakListed: false,
      speakApproachable: true,
      bumpable: true,
    });
    expect(verbs.map((verb) => verb.verb)).toEqual(['speak', 'bump']);
  });

  it('with no Speak offer at all a far hostile just swings', () => {
    expect(
      creatureClick(
        creatureVerbs({
          member: orc,
          attack: approach,
          speakListed: false,
          speakApproachable: false,
          bumpable: false,
        })
      )
    ).toBe('strike');
  });
});

describe('creatureClick: one verb acts, more than one shows the choices', () => {
  const strike: CreatureVerb = { verb: 'attack', reach: 'approach' };
  const far: CreatureVerb = { verb: 'attack', reach: 'out-of-reach' };
  const speak: CreatureVerb = { verb: 'speak' };

  it.each([
    [[strike], 'strike'],
    [[{ verb: 'attack', reach: 'in-reach' }], 'strike'],
    [[speak], 'speak'],
    [[{ verb: 'bump' }], 'bump'],
    [[far], 'none'],
    [[], 'none'],
    [[strike, speak], 'menu'],
    [[far, { verb: 'bump' }], 'menu'],
  ] as [CreatureVerb[], string][])('%j → %s', (verbs, click) => {
    expect(creatureClick(verbs)).toBe(click);
  });

  it('names each verb the way the hover reads', () => {
    expect(verbLabel(strike, 'Guard')).toBe('Attack Guard');
    expect(verbLabel(far, 'Guard')).toBe('Out of reach');
    expect(verbLabel(speak, 'Guard')).toBe('Speak to Guard');
    expect(verbLabel({ verb: 'bump' }, 'Guard')).toBe('Walk up to Guard');
    expect(verbEnabled(far)).toBe(false);
    expect(verbEnabled(strike)).toBe(true);
  });
});
