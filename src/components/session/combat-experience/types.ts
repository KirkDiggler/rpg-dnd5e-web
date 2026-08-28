import type {
  DicePresentationEvent,
  DicePresentationReleasedEvent,
} from '@/components/ui/dice/dicePresentationEvent';
import type {
  AttackRef,
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
  | 'released-waiting-event'
  | 'settled';

export type CombatExperienceLogMode = 'story' | 'debug';

export type CombatExperienceLayout = 'review-frame' | 'fill-parent';

export type CombatExperienceStreamState =
  | 'live'
  | 'caught-up'
  | 'reconnecting'
  | 'resyncing';

export interface CombatExperienceStoryExchange {
  id: string;
  round?: number;
  eyebrow: string;
  headline: string;
  detail: string;
  tone: 'neutral' | 'success' | 'danger' | 'turn';
  /** Exact typed provider identity retained beside presentation prose. */
  attack?: Readonly<Pick<AttackRef, 'ref' | 'name' | 'damageType'>>;
}

/** Presentation projection of an already-authoritative typed attack event. */
export interface CombatExperienceAttackOutcome {
  attackId: string;
  session?: string;
  seq?: bigint;
  actor: string;
  target: string;
  action: string;
  attackRef?: string;
  d20: number;
  total: number;
  against: number;
  hit: boolean;
  critical: boolean;
  damage?: number;
  damageType?: string;
  /** Whether the viewer is the one being hit. Resolved from the raw member
   * id at projection time, never by matching display names — two members may
   * share a name, and "was that me?" must not depend on that. */
  targetIsViewer: boolean;
}

export interface CombatExperienceMapRenderProps {
  attackableTargets: readonly string[];
  onTargetClick: (targetId: string) => void;
}

interface CombatExperienceBaseProps {
  /** Review defaults to a fixed visual-gate frame; the production portal fills its definite-height parent. */
  layout?: CombatExperienceLayout;
  viewerMember: string;
  /** Public-roster identity. Never derive this from Turn or CharacterData. */
  viewerName: string;
  /** Public-roster body/class ref id; absent renders an honest neutral label. */
  viewerClassRefId?: string;
  /** Public-roster names used by semantic targets and outcome labels. */
  memberNames: ReadonlyMap<string, string>;
  clock: ClockKind;
  round: number;
  participants: readonly Participant[];
  declarations: readonly Declaration[];
  /** Last confirmed owner-private status; absent never blocks public play. */
  characterData?: CharacterData;
  privateStatus: 'ready' | 'loading' | 'unavailable' | 'stale';
  privateStatusMessage?: string;
  onRetryPrivateStatus?: () => void;
  /** Turn + Afford both succeeded for their newest current generation. */
  authorityFresh: boolean;
  presentationState: CombatExperiencePresentationState;
  phase: CombatExperiencePhase;
  showTurnNotice: boolean;
  logMode: CombatExperienceLogMode;
  streamState: CombatExperienceStreamState;
  story: readonly CombatExperienceStoryExchange[];
  debug: readonly string[];
  result?: CombatExperienceAttackOutcome;
  diceEvents: readonly DicePresentationEvent[];
  diceSemanticFallback?: boolean;
  diceRollerName?: string;
  location: { name: string; area: string };
  /** Presentation-only readable pacing notice; authority is already ingested. */
  pacingNotice?: string | null;
  renderMap: (props: CombatExperienceMapRenderProps) => ReactNode;
  onSelectDeclaration: (declaration: Declaration) => void;
  onTargetClick: (targetId: string) => void;
  onEndTurn: (declaration: Declaration) => void;
  onLogModeChange: (mode: CombatExperienceLogMode) => void;
  onOpenEquipment?: () => void;
  equipmentOpen?: boolean;
  /** Explicit Concepts diagnostic surface; allowed independently of DEV. */
  diagnosticsEnabled?: boolean;
}

export type CombatExperienceProps = CombatExperienceBaseProps &
  (
    | {
        diceWitnessRole: 'roller';
        onDiceReleaseRequest: (event: DicePresentationReleasedEvent) => void;
        onDiceSemanticReleaseRequest: () => void;
      }
    | {
        diceWitnessRole?: 'spectator';
        onDiceReleaseRequest?: never;
        onDiceSemanticReleaseRequest?: never;
      }
  );
