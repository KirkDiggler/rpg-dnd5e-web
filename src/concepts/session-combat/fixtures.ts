import { create } from '@bufbuild/protobuf';
import {
  AttackRefSchema,
  ClockKind,
  DamageType,
  DeclarationSchema,
  MemberKind,
  ParticipantSchema,
  ShortfallReason,
  ShortfallSchema,
  Slot,
  Standing,
  TargetCandidateSchema,
  TargetKind,
  Verb,
  type Declaration,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  ArmorClassDisplaySchema,
  CharacterDataSchema,
  ConditionViewSchema,
  FeatureViewSchema,
  HitPointsSchema,
  RefSchema,
  ResourceViewSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import type { SessionCombatFixture } from './sessionCombatTypes';

const shortfall = (text: string) =>
  create(ShortfallSchema, { reason: ShortfallReason.NO_BUDGET, text });

const participantFacts: readonly (readonly [string, string, MemberKind])[] = [
  ['aldric', 'Aldric Vale', MemberKind.PLAYER],
  ['skeleton-archer', 'Skeleton Archer', MemberKind.MONSTER],
  ['mira', 'Mira', MemberKind.PLAYER],
  ['skeleton-guard', 'Skeleton Guard', MemberKind.MONSTER],
];

const participants = (activeMember: string | null): readonly Participant[] =>
  participantFacts.map(([member, name, kind]) =>
    create(ParticipantSchema, {
      member,
      name,
      kind,
      standing: Standing.UP,
      active: member === activeMember,
    })
  );

function declarations(
  actionAvailable: boolean,
  moveAvailable: boolean,
  remaining: number
): readonly Declaration[] {
  return [
    create(DeclarationSchema, {
      id: 'offer:aldric:longsword:action',
      verb: Verb.ATTACK,
      slot: Slot.ACTION,
      available: actionAvailable,
      why: actionAvailable ? undefined : shortfall('Action: 1 needed, 0 left.'),
      attack: create(AttackRefSchema, {
        ref: 'dnd5e:weapons:longsword',
        name: 'Longsword',
        damageType: DamageType.SLASHING,
      }),
      targetKind: TargetKind.MEMBER,
      candidates: [
        create(TargetCandidateSchema, {
          member: 'skeleton-guard',
          available: true,
        }),
        create(TargetCandidateSchema, {
          member: 'skeleton-archer',
          available: false,
          why: create(ShortfallSchema, {
            reason: ShortfallReason.TARGET_OUT_OF_REACH,
            text: 'Target is outside this attack’s reach.',
          }),
        }),
      ],
    }),
    create(DeclarationSchema, {
      id: 'offer:aldric:move',
      verb: Verb.MOVE,
      slot: Slot.NONE,
      available: moveAvailable,
      remaining,
      targetKind: TargetKind.PATH,
    }),
    create(DeclarationSchema, {
      id: 'offer:aldric:end-turn',
      verb: Verb.END_TURN,
      slot: Slot.NONE,
      available: true,
      targetKind: TargetKind.NONE,
    }),
  ];
}

function blockedDeclarations(): readonly Declaration[] {
  const why = create(ShortfallSchema, {
    reason: ShortfallReason.NOT_YOUR_TURN,
    text: 'Not your turn.',
  });
  return [
    create(DeclarationSchema, {
      verb: Verb.ATTACK,
      slot: Slot.ACTION,
      available: false,
      why,
      targetKind: TargetKind.MEMBER,
    }),
    create(DeclarationSchema, {
      verb: Verb.MOVE,
      slot: Slot.NONE,
      available: false,
      why,
      targetKind: TargetKind.PATH,
    }),
    create(DeclarationSchema, {
      verb: Verb.END_TURN,
      slot: Slot.NONE,
      available: false,
      why,
      targetKind: TargetKind.NONE,
    }),
  ];
}

const characterData = create(CharacterDataSchema, {
  classRef: create(RefSchema, {
    module: 'dnd5e',
    type: 'class',
    id: 'fighter',
  }),
  level: 3,
  hitPoints: create(HitPointsSchema, { current: 22, max: 28, temp: 0 }),
  baseSpeedFeet: 30,
  armorClassDetail: create(ArmorClassDisplaySchema, {
    total: 18,
    note: '16 chain mail + 2 shield',
  }),
  features: [
    create(FeatureViewSchema, {
      ref: create(RefSchema, {
        module: 'dnd5e',
        type: 'features',
        id: 'action_surge',
      }),
      name: 'Action Surge',
      detail: '',
      resourceKey: 'action_surge',
    }),
    create(FeatureViewSchema, {
      ref: create(RefSchema, {
        module: 'dnd5e',
        type: 'features',
        id: 'second_wind',
      }),
      name: 'Second Wind',
      detail: '',
      resourceKey: 'second_wind',
    }),
  ],
  conditions: [
    create(ConditionViewSchema, {
      ref: create(RefSchema, {
        module: 'dnd5e',
        type: 'conditions',
        id: 'fighting_style_dueling',
      }),
      name: 'Dueling',
      detail: '',
    }),
  ],
  resources: [
    create(ResourceViewSchema, {
      key: 'action_surge',
      name: 'Action Surge',
      current: 1,
      maximum: 1,
    }),
    create(ResourceViewSchema, {
      key: 'hit_dice',
      name: 'Hit Dice',
      current: 3,
      maximum: 3,
    }),
    create(ResourceViewSchema, {
      key: 'second_wind',
      name: 'Second Wind',
      current: 1,
      maximum: 1,
    }),
  ],
});

const story = Object.freeze([
  {
    id: 'round-1-guard',
    round: 1,
    eyebrow: 'Skeleton Guard · Longsword',
    headline: 'Aldric turns the blow aside',
    detail: 'd20 9 · total 13 against AC 18 · Miss',
    tone: 'neutral' as const,
  },
  {
    id: 'round-1-mira',
    round: 1,
    eyebrow: 'Mira · Reposition',
    headline: 'Mira circles the reliquary',
    detail: 'The party holds the southern aisle.',
    tone: 'success' as const,
  },
  {
    id: 'round-2-turn',
    round: 2,
    eyebrow: 'Round 2',
    headline: 'Your turn',
    detail: 'Choose a declared action or move up to 25 ft.',
    tone: 'turn' as const,
  },
]);

const attackOutcome = Object.freeze({
  attackId: 'round-2-aldric-longsword',
  actor: 'Aldric',
  target: 'Skeleton Guard',
  action: 'Longsword',
  d20: 12,
  total: 17,
  against: 13,
  hit: true,
  critical: false,
  damage: 8,
  damageType: 'slashing',
  targetIsViewer: false,
});

const fieldSources = Object.freeze({
  round: 'session-wire' as const,
  participants: 'session-wire' as const,
  declarations: 'session-wire' as const,
  attackNameRefSlotCandidatesWhy: 'session-wire' as const,
  movementRemainingFeet: 'session-wire' as const,
  hpArmorFeaturesConditionsResources: 'existing-other-wire' as const,
  attackRollTotalAgainstVerdictDamageTypeRef: 'session-wire' as const,
  storyGrouping: 'presentation' as const,
  dicePresentation: 'presentation' as const,
});

const freshTurn: SessionCombatFixture = {
  id: 'fresh-turn',
  label: 'Fresh turn',
  description:
    'Aldric begins round two with server-declared Attack, Move, and End Turn choices.',
  viewerMember: 'aldric',
  viewerName: 'Aldric Vale',
  viewerClassRefId: 'fighter',
  round: 2,
  clock: ClockKind.TURN,
  streamState: 'live',
  resultVisible: false,
  participants: participants('aldric'),
  declarations: declarations(true, true, 25),
  characterData,
  story,
  attackOutcome,
  debug: [
    'seq=18 clock=6 turn_ended member=Mira next=Aldric',
    'seq=19 clock=6 kind=TURN_STARTED member=Aldric round=2',
    'afford clock=TURN declarations=3 movement.remaining=25',
  ],
  fieldSources,
};

const spentTurn: SessionCombatFixture = {
  ...freshTurn,
  id: 'spent-turn',
  label: 'Spent turn',
  description:
    'The action is spent, movement is partial, and the separate End Turn declaration remains available.',
  resultVisible: true,
  declarations: declarations(false, true, 10),
  debug: [
    ...freshTurn.debug,
    'seq=20 clock=6 struck attacker=Aldric target=Skeleton Guard roll=12 total=17 against=13 damage=8',
    'afford clock=TURN declarations=3 action.left=0 movement.remaining=10',
  ],
};

const spectating: SessionCombatFixture = {
  ...freshTurn,
  id: 'spectating',
  label: 'Spectating',
  description:
    'Skeleton Archer owns the turn; Aldric keeps readable state but receives no executable commands.',
  participants: participants('skeleton-archer'),
  declarations: blockedDeclarations(),
  story: [
    ...story,
    {
      id: 'skeleton-archer-turn',
      round: 2,
      eyebrow: 'Skeleton Archer',
      headline: 'Skeleton Archer takes its turn',
      detail: 'Watching the battlefield…',
      tone: 'danger',
    },
  ],
};

const freeRoam: SessionCombatFixture = {
  ...freshTurn,
  id: 'free-roam',
  label: 'Free roam',
  description:
    'The fight has ended; turn declarations disappear while movement returns to the floor.',
  clock: ClockKind.WORLD,
  round: 0,
  participants: participants(null),
  declarations: [],
  story: [
    ...story,
    {
      id: 'fight-ended',
      round: 2,
      eyebrow: 'Fight ended',
      headline: 'The reliquary falls quiet',
      detail: 'Free movement has resumed.',
      tone: 'success',
    },
  ],
  debug: [
    ...freshTurn.debug,
    'seq=20 clock=7 fight_ended cause=DISSOLVE_KIND_BY_DEFEAT',
    'turn clock=WORLD active="" round=0 participants=[]',
  ],
};

const reconnected: SessionCombatFixture = {
  ...freshTurn,
  id: 'reconnected',
  label: 'Reconnected',
  description:
    'The live stream resumed after GetStory restored the typed events that arrived while this client was away.',
  streamState: 'caught-up',
  story: [
    ...story,
    {
      id: 'catch-up-restored',
      round: 2,
      eyebrow: 'Connection restored',
      headline: 'You are caught up',
      detail: '3 missed events restored in order.',
      tone: 'success',
    },
  ],
  debug: [...freshTurn.debug, 'catch_up from_seq=18 entries=3 source=GetStory'],
};

export const SESSION_COMBAT_FIXTURES: readonly SessionCombatFixture[] =
  Object.freeze([freshTurn, spentTurn, spectating, freeRoam, reconnected]);
