import type {
  DicePresentationEvent,
  DicePresentationReleasedEvent,
} from '@/components/ui/dice/dicePresentationEvent';
import type {
  ClockKind,
  Declaration,
  Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { CharacterData } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import type { ReactNode } from 'react';

/** Local interaction state. Provider facts remain in generated messages. */
export interface CombatExperiencePresentationState {
  armedDeclarationId: string | null;
  selectedCandidateMember: string | null;
  changedOptionNotice: string | null;
}

export type CombatExperiencePhase =
  | 'fresh'
  | 'targeting'
  | 'awaiting-roll'
  | 'settled';

export type CombatExperienceLogMode = 'story' | 'debug';

export interface CombatExperienceStoryExchange {
  id: string;
  round: number;
  eyebrow: string;
  headline: string;
  detail: string;
  tone: 'neutral' | 'success' | 'danger' | 'turn';
}

/** Presentation projection of an already-authoritative attack result. */
export interface CombatExperienceAttackOutcome {
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

export interface CombatExperienceMapRenderProps {
  attackableTargets: readonly string[];
  onTargetClick: (targetId: string) => void;
}

export interface CombatExperienceProps {
  viewerMember: string;
  clock: ClockKind;
  round: number;
  participants: readonly Participant[];
  declarations: readonly Declaration[];
  characterData: CharacterData;
  presentationState: CombatExperiencePresentationState;
  phase: CombatExperiencePhase;
  showTurnNotice: boolean;
  logMode: CombatExperienceLogMode;
  streamState: 'live' | 'caught-up';
  story: readonly CombatExperienceStoryExchange[];
  debug: readonly string[];
  result?: CombatExperienceAttackOutcome;
  diceEvents: readonly DicePresentationEvent[];
  location: { name: string; area: string };
  renderMap: (props: CombatExperienceMapRenderProps) => ReactNode;
  onSelectDeclaration: (declaration: Declaration) => void;
  onTargetClick: (targetId: string) => void;
  onEndTurn: (declaration: Declaration) => void;
  onLogModeChange: (mode: CombatExperienceLogMode) => void;
  onDiceReleaseRequest: (event: DicePresentationReleasedEvent) => void;
}
