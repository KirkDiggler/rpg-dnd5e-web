import type {
  CombatExperienceAttackOutcome,
  CombatExperienceStoryExchange,
} from '@/components/session/combat-experience/types';
import type {
  ClockKind,
  Declaration,
  Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { CharacterData } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';

export type SessionCombatFieldSource =
  | 'session-wire'
  | 'existing-other-wire'
  | 'presentation';

export interface SessionCombatFixture {
  id: string;
  label: string;
  description: string;
  viewerMember: string;
  viewerName: string;
  viewerClassRefId?: string;
  round: number;
  clock: ClockKind;
  streamState: 'live' | 'caught-up';
  resultVisible: boolean;
  /** Explicit visual authority: accepted Death Save is awaiting settlement. */
  endTurnBlocked: boolean;
  participants: readonly Participant[];
  declarations: readonly Declaration[];
  characterData: CharacterData;
  story: readonly CombatExperienceStoryExchange[];
  attackOutcome: CombatExperienceAttackOutcome;
  debug: readonly string[];
  fieldSources: Record<string, SessionCombatFieldSource>;
}
