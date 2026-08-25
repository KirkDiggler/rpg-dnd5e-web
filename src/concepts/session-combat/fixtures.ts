import type { SessionCombatFixture } from './sessionCombatTypes';

const freshTurn: SessionCombatFixture = {
  id: 'fresh-turn',
  label: 'Fresh turn',
  description:
    'Aldric begins round two with a full action, bonus action, reaction, and several server-offered choices.',
  round: 2,
  mode: 'turn',
  isViewerTurn: true,
  activeParticipantName: 'Aldric',
  economy: { action: true, bonus: true, reaction: true },
  streamState: 'live',
  resultVisible: false,
  viewer: {
    id: 'aldric',
    name: 'Aldric Vale',
    className: 'Fighter',
    level: 3,
    hp: { current: 22, max: 28 },
    armorClass: 18,
    movementRemainingFeet: 25,
    portrait: 'AV',
  },
  participants: [
    {
      id: 'aldric',
      name: 'Aldric',
      portrait: 'AV',
      active: true,
      you: true,
      standing: 'up',
      disposition: 'party',
    },
    {
      id: 'skeleton-archer',
      name: 'Skeleton Archer',
      portrait: 'SA',
      active: false,
      you: false,
      standing: 'up',
      disposition: 'hostile',
    },
    {
      id: 'mira',
      name: 'Mira',
      portrait: 'MI',
      active: false,
      you: false,
      standing: 'up',
      disposition: 'party',
    },
    {
      id: 'skeleton-guard',
      name: 'Skeleton Guard',
      portrait: 'SG',
      active: false,
      you: false,
      standing: 'up',
      disposition: 'hostile',
    },
  ],
  effects: [
    {
      id: 'blessed',
      label: 'Blessed',
      kind: 'condition',
      detail: '+1d4 to attacks and saves · concentration: Mira',
      icon: '✦',
      tone: 'cool',
    },
    {
      id: 'dueling',
      label: 'Dueling',
      kind: 'feature',
      detail: 'Fighting style · active with longsword and shield',
      icon: '⚔',
      tone: 'warm',
    },
    {
      id: 'second-wind',
      label: 'Second Wind 1/1',
      kind: 'feature',
      detail: 'Available as a bonus action',
      icon: '♥',
      tone: 'danger',
    },
  ],
  offers: [
    {
      id: 'attack:longsword',
      ref: 'dnd5e:actions:longsword-strike',
      label: 'Longsword',
      icon: '⚔',
      source: 'Core',
      cost: 'Action',
      available: true,
      targetMode: 'single',
      candidates: [
        { id: 'skeleton-guard', name: 'Skeleton Guard', available: true },
        {
          id: 'skeleton-archer',
          name: 'Skeleton Archer',
          available: false,
          reason: 'Target is outside this attack’s reach.',
        },
      ],
      rollPresentation: 'd20',
    },
    {
      id: 'dodge',
      ref: 'dnd5e:combat-abilities:dodge',
      label: 'Dodge',
      icon: '◈',
      source: 'Core',
      cost: 'Action',
      available: true,
      targetMode: 'self',
      candidates: [],
    },
    {
      id: 'dash',
      ref: 'dnd5e:combat-abilities:dash',
      label: 'Dash',
      icon: '➜',
      source: 'Core',
      cost: 'Action',
      available: true,
      targetMode: 'none',
      candidates: [],
    },
    {
      id: 'second-wind',
      ref: 'dnd5e:features:second-wind',
      label: 'Second Wind',
      icon: '♥',
      source: 'Features',
      cost: 'Bonus',
      available: true,
      targetMode: 'self',
      candidates: [],
    },
    {
      id: 'action-surge',
      ref: 'dnd5e:features:action-surge',
      label: 'Action Surge',
      icon: '✦',
      source: 'Features',
      cost: 'Free',
      available: false,
      unavailableReason: 'No uses remaining until a short rest.',
      targetMode: 'self',
      candidates: [],
    },
    {
      id: 'healing-potion',
      ref: 'dnd5e:items:potion-of-healing',
      label: 'Healing Potion',
      icon: '⚗',
      source: 'Items',
      cost: 'Action',
      available: true,
      targetMode: 'self',
      candidates: [],
    },
  ],
  story: [
    {
      id: 'round-1-guard',
      round: 1,
      eyebrow: 'Skeleton Guard · Longsword',
      headline: 'Aldric turns the blow aside',
      detail: '9 + 4 = 13 against AC 18 · Miss',
      tone: 'neutral',
    },
    {
      id: 'round-1-mira',
      round: 1,
      eyebrow: 'Mira · Bless',
      headline: 'Aldric and Mira are blessed',
      detail: 'Concentration held · 6 rounds remaining',
      tone: 'success',
    },
    {
      id: 'round-2-turn',
      round: 2,
      eyebrow: 'Round 2',
      headline: 'Your turn',
      detail: 'Choose an action or move up to 25 ft.',
      tone: 'turn',
    },
  ],
  attackOutcome: {
    attackId: 'round-2-aldric-longsword',
    actor: 'Aldric',
    target: 'Skeleton Guard',
    action: 'Longsword',
    d20: 12,
    bonus: 5,
    total: 17,
    against: 13,
    hit: true,
    critical: false,
    damage: 8,
    damageType: 'slashing',
    hpAfter: { current: 2, max: 10 },
  },
  debug: [
    'seq=18 clock=6 turn_ended member=Mira next=Aldric',
    'seq=19 clock=6 kind=TURN_STARTED member=Aldric round=2',
    'afford clock=TURN declarations=6 movement.remaining=25',
  ],
  fieldSources: {
    round: 'session-wire',
    participants: 'session-wire',
    movementRemainingFeet: 'session-wire',
    hp: 'existing-other-wire',
    armorClass: 'existing-other-wire',
    effects: 'provisional',
    offers: 'provisional',
    attackOutcome: 'session-wire',
    storyGrouping: 'presentation',
    dicePresentation: 'presentation',
  },
};

function cloneFixture(
  source: SessionCombatFixture,
  overrides: Partial<SessionCombatFixture>
): SessionCombatFixture {
  return {
    ...source,
    viewer: { ...source.viewer, hp: { ...source.viewer.hp } },
    participants: source.participants.map((participant) => ({
      ...participant,
    })),
    effects: source.effects.map((effect) => ({ ...effect })),
    offers: source.offers.map((offer) => ({
      ...offer,
      candidates: offer.candidates.map((candidate) => ({ ...candidate })),
    })),
    story: source.story.map((entry) => ({ ...entry })),
    attackOutcome: {
      ...source.attackOutcome,
      hpAfter: { ...source.attackOutcome.hpAfter },
    },
    debug: [...source.debug],
    fieldSources: { ...source.fieldSources },
    ...overrides,
  };
}

const spentTurn = cloneFixture(freshTurn, {
  id: 'spent-turn',
  label: 'Spent turn',
  description:
    'The action is spent, movement is partial, and the remaining bonus action and reaction stay available.',
  economy: { action: false, bonus: true, reaction: true },
  resultVisible: true,
  viewer: {
    ...freshTurn.viewer,
    hp: { ...freshTurn.viewer.hp },
    movementRemainingFeet: 10,
  },
  offers: freshTurn.offers.map((offer) =>
    offer.cost === 'Action'
      ? {
          ...offer,
          available: false,
          unavailableReason: 'Action: 1 needed, 0 left.',
          candidates: offer.candidates.map((candidate) => ({ ...candidate })),
        }
      : {
          ...offer,
          candidates: offer.candidates.map((candidate) => ({ ...candidate })),
        }
  ),
  debug: [
    ...freshTurn.debug,
    'seq=20 clock=6 struck attacker=Aldric target=Skeleton Guard roll=12 total=17 against=13 damage=8',
    'afford clock=TURN declarations=6 action.left=0 movement.remaining=10',
  ],
});

const spectating = cloneFixture(freshTurn, {
  id: 'spectating',
  label: 'Spectating',
  description:
    'Skeleton Archer owns the turn; Aldric keeps readable state but receives no executable commands.',
  isViewerTurn: false,
  activeParticipantName: 'Skeleton Archer',
  economy: null,
  offers: [],
  viewer: {
    ...freshTurn.viewer,
    hp: { ...freshTurn.viewer.hp },
    movementRemainingFeet: 30,
  },
  participants: freshTurn.participants.map((participant) => ({
    ...participant,
    active: participant.id === 'skeleton-archer',
  })),
  story: [
    ...freshTurn.story,
    {
      id: 'skeleton-archer-turn',
      round: 2,
      eyebrow: 'Skeleton Archer',
      headline: 'Skeleton Archer takes its turn',
      detail: 'Watching the battlefield…',
      tone: 'danger',
    },
  ],
});

const freeRoam = cloneFixture(freshTurn, {
  id: 'free-roam',
  label: 'Free roam',
  description:
    'The fight has ended; turn economy and combat offers disappear while movement returns to the floor.',
  mode: 'free-roam',
  isViewerTurn: false,
  activeParticipantName: null,
  economy: null,
  offers: [],
  viewer: {
    ...freshTurn.viewer,
    hp: { ...freshTurn.viewer.hp },
    movementRemainingFeet: 30,
  },
  participants: freshTurn.participants.map((participant) => ({
    ...participant,
    active: false,
  })),
  story: [
    ...freshTurn.story,
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
});

const reconnected = cloneFixture(freshTurn, {
  id: 'reconnected',
  label: 'Reconnected',
  description:
    'The live stream resumed after GetStory restored the typed events that arrived while this client was away.',
  streamState: 'caught-up',
  story: [
    ...freshTurn.story,
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
});

export const SESSION_COMBAT_FIXTURES: readonly SessionCombatFixture[] =
  Object.freeze([freshTurn, spentTurn, spectating, freeRoam, reconnected]);
