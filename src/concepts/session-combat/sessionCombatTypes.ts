export type SessionCombatFieldSource =
  | 'session-wire'
  | 'existing-other-wire'
  | 'presentation'
  | 'provisional';

export interface SessionCombatViewer {
  id: string;
  name: string;
  className: string;
  level: number;
  hp: { current: number; max: number };
  armorClass: number;
  movementRemainingFeet: number;
  portrait: string;
}

export interface SessionCombatEffect {
  id: string;
  label: string;
  kind: 'feature' | 'condition';
  detail: string;
  icon: string;
  tone: 'warm' | 'cool' | 'danger';
}

export interface SessionCombatParticipant {
  id: string;
  name: string;
  portrait: string;
  active: boolean;
  you: boolean;
  standing: 'up' | 'downed';
  disposition: 'party' | 'hostile';
}

export interface SessionCombatTargetCandidate {
  id: string;
  name: string;
  available: boolean;
  reason?: string;
}

export interface SessionCombatOffer {
  id: string;
  ref: string;
  label: string;
  icon: string;
  source: 'Core' | 'Features' | 'Spells' | 'Items';
  cost: 'Action' | 'Bonus' | 'Reaction' | 'Movement' | 'Free';
  available: boolean;
  unavailableReason?: string;
  targetMode: 'none' | 'self' | 'single';
  candidates: SessionCombatTargetCandidate[];
  rollPresentation?: 'd20';
}

export interface SessionCombatAttackOutcome {
  attackId: string;
  actor: string;
  target: string;
  action: string;
  d20: number;
  bonus: number;
  total: number;
  against: number;
  hit: boolean;
  critical: boolean;
  damage: number;
  damageType: string;
  hpAfter: { current: number; max: number };
}

export interface SessionCombatStoryExchange {
  id: string;
  round: number;
  eyebrow: string;
  headline: string;
  detail: string;
  tone: 'neutral' | 'success' | 'danger' | 'turn';
}

export interface SessionCombatTurnEconomy {
  action: boolean;
  bonus: boolean;
  reaction: boolean;
}

export interface SessionCombatFixture {
  id: string;
  label: string;
  description: string;
  round: number;
  mode: 'turn' | 'free-roam';
  isViewerTurn: boolean;
  activeParticipantName: string | null;
  economy: SessionCombatTurnEconomy | null;
  streamState: 'live' | 'caught-up';
  resultVisible: boolean;
  viewer: SessionCombatViewer;
  participants: SessionCombatParticipant[];
  effects: SessionCombatEffect[];
  offers: SessionCombatOffer[];
  story: SessionCombatStoryExchange[];
  attackOutcome: SessionCombatAttackOutcome;
  debug: string[];
  fieldSources: Record<string, SessionCombatFieldSource>;
}
