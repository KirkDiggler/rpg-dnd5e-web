import type {
  DicePresentationEvent,
  DicePresentationReleasedEvent,
} from '@/components/ui/dice/dicePresentationEvent';
import type {
  AttackRef,
  ClockKind,
  Declaration,
  Participant,
  ReactChoice,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { CharacterData } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import type { ReactNode } from 'react';
import type { DebugFeedEntry } from '../debugLogLine';

/** Local interaction state. Provider facts remain in generated messages. */
export interface CombatExperiencePresentationState {
  armedDeclarationId: string | null;
  selectedCandidateMember: string | null;
  /** Ordered cast targets; absent on legacy fixtures and unrelated verbs. */
  selectedCandidateMembers?: readonly string[];
  /**
   * The cast whose option menu is open — the selector of a declaration that
   * listed `options`, held while the player answers which of them they mean.
   *
   * A THIRD WAITING STATE, BESIDE ARMING AND TARGETING. Arming holds an offer
   * waiting for a creature or a cell; this holds one waiting for a word, and
   * the two are separate because a Command that names a creature needs both,
   * in that order. Null whenever no menu is open, which is every cast that
   * offers no choice.
   */
  optionDeclarationId?: string | null;
  /**
   * The option id the player picked, echoed verbatim on the cast request.
   *
   * OPAQUE, AND NEVER READ FOR A RULE. It is one of the ids the declaration
   * listed; what the word does is the engine's answer, and a client that
   * branched on it would be authoring 5e.
   */
  selectedOption?: string | null;
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
export interface CombatExperienceAttackModifierSource {
  /** Whether this source granted advantage or imposed disadvantage. */
  kind: 'advantage' | 'disadvantage';
  /** Exact canonical source ref from the resolved strike. */
  sourceRef: string;
  /** Presentation label resolved from the canonical ref. */
  label: string;
  /** Exact member id attributed by the rules owner, when present. */
  sourceMemberId?: string;
  /** Public-roster name for sourceMemberId, never inferred from the ref. */
  sourceMemberName?: string;
  /** The resolved attack's authoritative attacker and target. */
  attackerId: string;
  targetId: string;
  attackerName: string;
  targetName: string;
  sourceIsViewer: boolean;
}

export interface CombatExperienceAttackOutcome {
  attackId: string;
  session?: string;
  seq?: bigint;
  actor: string;
  target: string;
  action: string;
  attackRef?: string;
  /**
   * Display name of the reaction this strike was taken as, verbatim from the
   * wire's `ReactionRef.name`. Absent on an ordinary declared swing.
   */
  reaction?: string;
  d20: number;
  total: number;
  against: number;
  hit: boolean;
  critical: boolean;
  damage?: number;
  damageType?: string;
  /** Typed Struck attribution. Missed cannot supply this on the current wire. */
  modifierSources?: readonly CombatExperienceAttackModifierSource[];
  /** Whether the viewer is the one being hit. Resolved from the raw member
   * id at projection time, never by matching display names — two members may
   * share a name, and "was that me?" must not depend on that. */
  targetIsViewer: boolean;
}

/**
 * What `RollWindowOpened` said, kept beside the offer it was said about
 * (rpg-project#398).
 *
 * THE TARGET'S AC IS ABSENT AND STAYS ABSENT. The wire withholds it so the
 * player decides on the roll rather than on whether the roll already landed;
 * a field for it here would invite somebody to fill it in.
 */
export interface CombatExperienceRollWindow {
  /** `ReactionRef.ref` from the beat — matched against the open declaration's
   * own offer so one window's numbers can never be drawn under another's. */
  offerRef: string;
  /** The face of the d20, which no answer moves. */
  roll: number;
  /** The face plus the attacker's bonuses, and nothing the answer would add. */
  total: number;
  /** Exact Story entry to conceal alongside the pending choice. */
  storyId?: string;
  /** Existing window token, or paired legacy response token; never built from seq. */
  presentationId?: string;
  /** True only while this live locally initiated attack has a die to settle. */
  awaitsDiceSettlement?: boolean;
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
  /** Accepted local Death Save is awaiting an in-bounds settlement. */
  endTurnBlocked?: boolean;
  presentationState: CombatExperiencePresentationState;
  phase: CombatExperiencePhase;
  showTurnNotice: boolean;
  logMode: CombatExperienceLogMode;
  streamState: CombatExperienceStreamState;
  story: readonly CombatExperienceStoryExchange[];
  debug: readonly DebugFeedEntry[];
  result?: CombatExperienceAttackOutcome;
  /** The roll an open post-roll reaction window is asking about. Null when no
   * such beat is outstanding; the panel still poses the question without it. */
  rollWindow?: CombatExperienceRollWindow | null;
  diceEvents: readonly DicePresentationEvent[];
  diceSemanticFallback?: boolean;
  diceRollerName?: string;
  /** Production actor-only checkpoint control. `null` suppresses the default tile. */
  localWorldDieControl?: ReactNode;
  /** The actor-only world die has already reached its visible terminal. */
  localWorldDieSettled?: boolean;
  /** Provider token for that terminal; prevents stale release of a new window. */
  localWorldDieSettledPresentationId?: string;
  location: { name: string; area: string };
  /** Presentation-only readable pacing notice; authority is already ingested. */
  pacingNotice?: string | null;
  renderMap: (props: CombatExperienceMapRenderProps) => ReactNode;
  /** `choice` rides only a VERB_REACT declaration — the answer to an open
   * reaction window, which the verb implies rather than the server offering
   * it as a candidate. */
  onSelectDeclaration: (declaration: Declaration, choice?: ReactChoice) => void;
  /**
   * Answer the open option menu with one of the ids the declaration listed.
   *
   * THE MENU IS DRAWN, NEVER ASSEMBLED. `Declaration.options` carries both the
   * ids and the labels; this hands one id back and the cast goes on from
   * wherever it would have gone had there been no menu at all.
   */
  onSelectCastOption?: (optionId: string) => void;
  /** Close the option menu without casting. Nothing has been sent yet. */
  onCancelCastOption?: () => void;
  onTargetClick: (targetId: string) => void;
  onConfirmTargets?: () => void;
  onEndTurn: (declaration: Declaration) => void;
  onLogModeChange: (mode: CombatExperienceLogMode) => void;
  onOpenEquipment?: () => void;
  equipmentOpen?: boolean;
  /**
   * Search the region the viewer stands in (rpg-project#350/#886).
   * Universally attemptable — no prerequisites, no turn requirement,
   * independent of `clock`/`authorityFresh` — so `undefined` means only
   * "the viewer's region is not known yet," never "not your turn." A
   * find is never learned here: it arrives later as its own reveal beat.
   */
  onSearch?: () => void;
  /** A search RPC is in flight; disables the button without hiding it. */
  searchPending?: boolean;
  /**
   * EVERY downed body within reach, in the order the view reported them
   * (rpg-project#368 P3). One button each, and the panel neither reorders
   * nor annotates them: an affordance that singled one out would say which
   * corpse is worth looting, which is the secret the whole slice keeps.
   * Empty means nothing is down beside the viewer, never "nothing worth
   * taking".
   */
  lootTargets?: readonly { subject: string; name: string }[];
  onLoot?: (subject: string) => void;
  /** A loot RPC is in flight; disables the buttons without hiding them. */
  lootPending?: boolean;
  /**
   * Every NAMED prop within reach — the only props the pick-up verb can
   * target, since it names its target by the author's placement id. Whether
   * one can actually be picked up is the seam's answer, refused by name.
   */
  holdTargets?: readonly { id: string; ref: string }[];
  onHold?: (id: string) => void;
  holdPending?: boolean;
  /**
   * Declare the departure (design R6/R7). Offered wherever the viewer
   * stands, because WHAT A DEPARTURE MEANS is the server's call: at a
   * scenario's bound exit while carrying its artifact it ends the run; from
   * anywhere else it drops what is carried and the run goes on. The client
   * says leave and reads the answer off the beats.
   */
  onLeave?: () => void;
  leavePending?: boolean;
  /**
   * The authored way out the viewer is STANDING ON, if any — the button
   * says so. Never a gate: `AtlasExit`'s own doc comment is explicit that
   * the exits list is "for drawing the way out, not for gating it", because
   * R9 needs a departure from anywhere to be possible.
   */
  leaveExitId?: string;
  /**
   * What the viewer is carrying, as placement ids — so the button can name
   * the COST of leaving from the wrong cell before the click, not after
   * (Kirk's walk, 2026-09-04: he dropped the heirloom and found out
   * afterwards). Empty means nothing to drop, and the button says nothing
   * about dropping; a client that joined after the pickup also shows
   * nothing, which under-claims rather than lying.
   */
  leaveHolding?: readonly string[];
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
