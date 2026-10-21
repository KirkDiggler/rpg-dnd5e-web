import {
  parseDicePresentationEvent,
  type DicePresentationEvent,
  type DicePresentationReleasedEvent,
  type DicePresentationRequestedEvent,
} from '@/components/ui/dice/dicePresentationEvent';
import {
  createDicePresentationRelease,
  isDicePresentationIdentifier,
} from '@/components/ui/dice/dicePresentationRelease';
import { createNeutralVisualThrowProfile } from '@/components/ui/dice/visualThrowProfile';
import { parseRef } from '@/utils/refs';
import { clone } from '@bufbuild/protobuf';
import type {
  AttackResponse,
  DeathSaveResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  DeathSaveContinuation,
  DeathSaveOutcome,
  type AttackRef,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  ActSchema,
  AttackOutcome,
  CastOutcome,
  ClockMark,
  Family,
  Sense,
  type Act,
  type Roll,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import type { ActDeliveryMetadata } from '../actFeed';
import type { DebugFeedEntry } from '../debugLogLine';
import {
  actStoryId,
  attackRefOf,
  buildActAttackOutcome,
  buildActStory,
  type CombatStoryFact,
} from './actStory';
import type {
  CombatExperienceAttackOutcome,
  CombatExperienceStoryExchange,
} from './types';

export const COMBAT_D20_PRESET_ID = 'dice.original.carved.d20';

type RollerRole = 'player' | 'monster';
type AttackSnapshot = Readonly<Pick<AttackRef, 'ref' | 'name' | 'damageType'>>;
/**
 * The kinds of roll this layer animates.
 *
 * A SAVE IS ITS OWN KIND, not an attack with different words. It has a saver
 * rather than an attacker, a DC rather than an AC, and no damage of its own —
 * and, critically, it registers under the same `(session, seq)` key an
 * attack would, so a save arriving as `'other'` typed Story while a d20
 * wanted to roll for it is exactly the `dice response conflicts with typed
 * Story` refusal (design rpg-project#405, folded gap). Giving the save a kind
 * of its own is what makes the identity and the authority agree.
 */
export type DiceInteractionKind = 'attack' | 'death-save' | 'save';

/**
 * Which die a roll is presented with.
 *
 * READ OFF THE FACT RATHER THAN HARD-CODED. Every roll this layer has ever
 * animated was a d20, so `createRequest` asserted one; a save is also a d20,
 * but the assertion was a guess that happened to be right rather than a fact
 * the authority carried. The face range travels with it so the guard refuses
 * an impossible face for the die actually rolled, and the day a damage die is
 * animated it is this descriptor that changes and not the request builder.
 */
interface DieSnapshot {
  /**
   * `d20` ALONE, BECAUSE THE DICE PRESENTATION CONTRACT SAYS SO:
   * `DicePresentationRequestedEvent.die.kind` is literally `'d20'`
   * (`dicePresentationEvent.ts`), and every roll the table animates today is
   * one. Widening this means widening that contract and the runtime behind
   * it, which is the damage-die slice and not this one — Vicious Mockery's
   * 1d4 is narrated with its components rather than rolled.
   */
  readonly kind: 'd20';
  readonly presetId: string;
  readonly minimum: number;
  readonly maximum: number;
}

const COMBAT_D20: DieSnapshot = Object.freeze({
  kind: 'd20',
  presetId: COMBAT_D20_PRESET_ID,
  minimum: 1,
  maximum: 20,
});

/** What a save was forced by, when a spell forced it. */
interface SaveSnapshot {
  readonly ability: string;
  readonly dc: number;
  readonly succeeded: boolean;
  readonly sourceRef: string;
  readonly sourceName: string;
}

interface DeathSaveSnapshot {
  readonly outcome: DeathSaveOutcome;
  readonly successesAdded: number;
  readonly failuresAdded: number;
  readonly successes: number;
  readonly failures: number;
  readonly successesNeeded: number;
  readonly failuresRemaining: number;
  readonly stabilized: boolean;
  readonly dead: boolean;
  readonly recovered: boolean;
  readonly hpRestored: number;
  readonly continuation: DeathSaveContinuation;
}

interface AuthoritySnapshot {
  readonly kind: DiceInteractionKind;
  readonly session: string;
  /** Recipient-local ordering only; never parsed from presentationId. */
  readonly seq: bigint;
  readonly authoritySeq?: bigint;
  /** A record key the authority names itself by (a save, a swing that
   * follows its own roll window); otherwise derived in `authorityKey`. */
  readonly identity?: string;
  readonly presentationId: string;
  readonly roller: string;
  /** Attack compatibility alias. Death Saves use roller directly. */
  readonly attacker: string;
  /** A roll window has no target or outcome facts; absence is not a miss. */
  readonly target?: string;
  readonly roll: number;
  readonly total: number;
  readonly against?: number;
  readonly hit?: boolean;
  readonly critical?: boolean;
  readonly damage?: number;
  readonly attack?: AttackSnapshot;
  readonly deathSave?: DeathSaveSnapshot;
  readonly save?: SaveSnapshot;
  /** The die this roll is shown on. Every roll today is the combat d20. */
  readonly die: DieSnapshot;
}

export interface CombatPresentationConfigFact {
  readonly type: 'configure';
  readonly session: string;
  readonly viewerMember: string;
  readonly memberNames: Readonly<Record<string, string>>;
  readonly rollerRoles: Readonly<Record<string, RollerRole>>;
}

export interface AttackResponseFact {
  readonly type: 'attack-response';
  readonly session: string;
  readonly attacker: string;
  readonly target: string;
  readonly response: AttackResponse;
}

export interface DeathSaveResponseFact {
  readonly type: 'death-save-response';
  readonly session: string;
  readonly member: string;
  readonly response: DeathSaveResponse;
}

export interface CombatStreamFact {
  readonly type: 'stream-act';
  readonly act: Act;
  /** The act's place in its same-id run. */
  readonly index: number;
  /** Recipient-local delivery order, assigned as acts arrive. */
  readonly seq: bigint;
  readonly metadata: ActDeliveryMetadata;
  /** Where this viewer stood as the beat arrived; kept on a `heard` story
   * record only (`CombatStoryFact.listenerAt`). */
  readonly listenerAt?: { readonly x: number; readonly y: number } | null;
}

export interface LocalDiceReleaseFact {
  readonly type: 'local-release';
  readonly event: DicePresentationReleasedEvent;
}

/** Local, result-free reveal intent for an unsafe-ID semantic fallback. */
export interface SemanticDiceReleaseFact {
  readonly type: 'semantic-release';
  readonly presentationKey: string;
}

export interface WitnessDiceSettlementFact {
  readonly type: 'witness-settlement';
  readonly presentationId: string;
}

export type CombatPresentationFact =
  | CombatPresentationConfigFact
  | AttackResponseFact
  | DeathSaveResponseFact
  | CombatStreamFact
  | LocalDiceReleaseFact
  | SemanticDiceReleaseFact
  | WitnessDiceSettlementFact;

export interface CombatPresentationIdentity {
  readonly key: string;
  readonly category: DiceInteractionKind | 'other';
  readonly conflicted: boolean;
  readonly order: number;
}

export interface CombatPresentationRecord {
  readonly key: string;
  readonly presentationId?: string;
  readonly session: string;
  readonly seq: bigint;
  readonly authority: AuthoritySnapshot;
  readonly responseAccepted: boolean;
  readonly eventAccepted: boolean;
  /** Final outcome replaced this provisional response's presentation duties. */
  readonly supersededByOutcome?: string;
  readonly act?: Act;
  /** The act's place in its same-id run. */
  readonly actIndex?: number;
  /** Exact typed attack-body identity, including every nested roll fact. */
  readonly eventFacts?: string;
  readonly eventSource?: 'live' | 'catchup';
  readonly request?: DicePresentationRequestedEvent;
  readonly release?: DicePresentationReleasedEvent;
  readonly settlement: 'unresolved' | 'armed' | 'released' | 'auto';
  readonly semanticFallback: boolean;
  /** Sticky once stable public roster authorizes the viewer as player roller. */
  readonly localPlayerOwned: boolean;
  readonly locallyArmedResponse: boolean;
  readonly conflicted: boolean;
  readonly order: number;
}

export interface OtherStoryRecord {
  readonly key: string;
  readonly fact: CombatStoryFact;
  readonly relevantFacts: string;
  /** The dice records this act made; its row shows once they are visible. */
  readonly authorityKeys: readonly string[];
  readonly conflicted: boolean;
  readonly order: number;
}

export interface CombatPresentationState {
  readonly session: string;
  readonly viewerMember: string;
  readonly memberNames: Readonly<Record<string, string>>;
  readonly rollerRoles: Readonly<Record<string, RollerRole>>;
  /** The canonical registry for every accepted response or event key. */
  readonly identities: readonly CombatPresentationIdentity[];
  readonly presentations: readonly CombatPresentationRecord[];
  readonly otherStory: readonly OtherStoryRecord[];
  /** FIFO keys for local, authoritative player outcomes awaiting reveal. */
  readonly pendingLocalKeys: readonly string[];
  readonly diceEvents: readonly DicePresentationEvent[];
  /** Typed raw stream formatting occurs before Story reconciliation. */
  readonly debug: readonly DebugFeedEntry[];
  /** Monotonic UI keys survive trimming and duplicate wire receipts. */
  readonly nextDebugId: number;
  readonly diagnostics: readonly string[];
  readonly nextOrder: number;
}

export interface EmptyPresentationConfig {
  readonly session?: string;
  readonly viewerMember?: string;
  readonly memberNames?: Readonly<Record<string, string>>;
  readonly rollerRoles?: Readonly<Record<string, RollerRole>>;
}

function freezeRecord<T extends Record<string, unknown>>(
  value: T
): Readonly<T> {
  return Object.freeze(value);
}

export function emptyPresentation(
  config: EmptyPresentationConfig = {}
): CombatPresentationState {
  return Object.freeze({
    session: config.session ?? '',
    viewerMember: config.viewerMember ?? '',
    memberNames: Object.freeze({ ...(config.memberNames ?? {}) }),
    rollerRoles: Object.freeze({ ...(config.rollerRoles ?? {}) }),
    identities: Object.freeze([]),
    presentations: Object.freeze([]),
    otherStory: Object.freeze([]),
    pendingLocalKeys: Object.freeze([]),
    diceEvents: Object.freeze([]),
    debug: Object.freeze([]),
    nextDebugId: 0,
    diagnostics: Object.freeze([]),
    nextOrder: 0,
  });
}

function authorityKey(authority: AuthoritySnapshot): string {
  if (authority.identity) return authority.identity;
  if (authority.kind === 'death-save') {
    return `death-save:${authority.presentationId.length}:${authority.presentationId}`;
  }
  // A swing and the actor's own response are one roll: they share the
  // provider token, which is the only identity both sides hold. A recipient's
  // act carries no seq the response could be matched by.
  // A token unfit for the physical die is still the swing's identity: the
  // die falls back to its semantic reveal, the join does not.
  if (authority.kind === 'attack' && authority.presentationId) {
    return `attack:${authority.presentationId.length}:${authority.presentationId}`;
  }
  return `${authority.session.length}:${authority.session}:${authority.seq}`;
}

function attackSnapshot(
  attack: AttackRef | undefined
): AttackSnapshot | undefined {
  if (!attack) return undefined;
  return freezeRecord({
    ref: attack.ref,
    name: attack.name,
    damageType: attack.damageType,
  });
}

function authorityFromResponse(fact: AttackResponseFact): AuthoritySnapshot {
  const response = fact.response;
  // The provider's opaque token, NOT anything built from seq. seq is per
  // recipient, so an id formatted out of it names this roll to this client
  // alone — see authorityFromEvent, which is the other half of the same swing.
  const presentationId = response.presentationId;
  return freezeRecord({
    kind: 'attack' as const,
    session: fact.session,
    seq: response.seq,
    authoritySeq: response.seq,
    presentationId,
    roller: fact.attacker,
    attacker: fact.attacker,
    target: fact.target,
    roll: response.roll,
    total: response.total,
    against: response.against,
    hit: response.hit,
    critical: response.critical,
    damage: response.damage,
    attack: attackSnapshot(response.attack),
    die: COMBAT_D20,
  });
}

function deathSaveSnapshot(value: DeathSaveSnapshot): DeathSaveSnapshot {
  return freezeRecord({
    outcome: value.outcome,
    successesAdded: value.successesAdded,
    failuresAdded: value.failuresAdded,
    successes: value.successes,
    failures: value.failures,
    successesNeeded: value.successesNeeded,
    failuresRemaining: value.failuresRemaining,
    stabilized: value.stabilized,
    dead: value.dead,
    recovered: value.recovered,
    hpRestored: value.hpRestored,
    continuation: value.continuation,
  });
}

function authorityFromDeathSaveResponse(
  fact: DeathSaveResponseFact
): AuthoritySnapshot {
  const response = fact.response;
  return freezeRecord({
    kind: 'death-save' as const,
    session: fact.session,
    seq: response.seq,
    authoritySeq: response.seq,
    presentationId: response.presentationId,
    roller: fact.member,
    attacker: fact.member,
    target: '',
    roll: response.roll,
    total: 0,
    against: 0,
    hit: false,
    critical: false,
    damage: 0,
    deathSave: deathSaveSnapshot(response),
    die: COMBAT_D20,
  });
}

/** A roll's d20 face: the first kept die, or the total when no dice rode. */
function rollFace(roll: Roll | undefined): number {
  return roll?.dice[0] ?? roll?.total ?? 0;
}

function enumByWord<E extends Record<string, string | number>>(
  table: E,
  word: string,
  fallback: E[keyof E]
): E[keyof E] {
  const value = table[word.toUpperCase() as keyof E];
  return typeof value === 'number' ? value : fallback;
}

function saveAuthority(
  act: Act,
  seq: bigint,
  identity: string,
  presentationId: string,
  saver: string,
  ability: string,
  roll: Roll | undefined,
  succeeded: boolean,
  source: { ref: string; name: string }
): AuthoritySnapshot {
  return freezeRecord({
    kind: 'save' as const,
    session: act.session,
    seq,
    // A save has no verb response to carry the sequence its physical throw
    // is published under; its own recipient-local order is that sequence.
    authoritySeq: seq,
    identity,
    presentationId,
    roller: saver,
    attacker: saver,
    target: saver,
    roll: rollFace(roll),
    total: roll?.total ?? 0,
    against: roll?.against ?? 0,
    hit: succeeded,
    critical: false,
    damage: 0,
    save: freezeRecord({
      ability,
      dc: roll?.against ?? 0,
      succeeded,
      sourceRef: source.ref,
      sourceName: source.name,
    }),
    die: COMBAT_D20,
  });
}

/**
 * The dice authority one act carries (rpg-project#630): a swing's attack
 * roll, a death save, a roll window's paused d20, and every save a cast, an
 * activation or a ward forced. An act with no die carries none.
 *
 * A swing and a death save are joined to the actor's own verb response by
 * their provider presentation token (both carry it). A save carries no
 * token; its animation stays recipient-local under an identity built from
 * the act's own id and place, never from anything another client shares.
 */
export function authoritiesFromAct(
  act: Act,
  index: number,
  seq: bigint
): readonly AuthoritySnapshot[] {
  if (act.refused) return [];
  const row = actStoryId(act, index);
  const saveIdentity = (k: number) => `save:${row}:${k}`;
  const localId = (k: number) => {
    const id = `session:${act.session}:${act.id}.${index}.${k}`;
    return act.session && isDicePresentationIdentifier(id) ? id : '';
  };
  const body = act.body;
  switch (body.case) {
    case 'attack': {
      const a = body.value;
      if (a.outcome === AttackOutcome.WARDED) {
        // The aggressor rolls a saving throw against the ward; it failed.
        if (!a.ward?.roll) return [];
        return [
          saveAuthority(
            act,
            seq,
            saveIdentity(0),
            localId(0),
            a.by?.id ?? '',
            a.ward.ability,
            a.ward.roll,
            false,
            { ref: '', name: 'Ward' }
          ),
        ];
      }
      return [
        freezeRecord({
          kind: 'attack' as const,
          session: act.session,
          seq,
          // Recipient-local, as the v1 beat's own seq was: the number this
          // client publishes its own throw under when it is the roller.
          authoritySeq: seq,
          // A swing with no provider token has no shared identity; it is named
          // by its act id and place, which a re-delivery (a stream restart's
          // catch-up) keeps and this client's delivery counter does not.
          ...(a.presentationId ? {} : { identity: `attack:${row}` }),
          presentationId: a.presentationId,
          roller: a.by?.id ?? '',
          attacker: a.by?.id ?? '',
          target: a.to?.id ?? '',
          roll: rollFace(a.roll),
          total: a.roll?.total ?? 0,
          against: a.roll?.against ?? 0,
          hit: a.outcome === AttackOutcome.HIT,
          critical: a.critical,
          damage: a.outcome === AttackOutcome.HIT ? a.damage : 0,
          attack: attackRefOf(act),
          die: COMBAT_D20,
        }),
      ];
    }
    case 'deathSave': {
      const d = body.value;
      return [
        freezeRecord({
          kind: 'death-save' as const,
          session: act.session,
          seq,
          // As a tokenless swing: an empty token is no identity to share.
          ...(d.presentationId ? {} : { identity: `death-save:${row}` }),
          presentationId: d.presentationId,
          roller: d.by?.id ?? '',
          attacker: d.by?.id ?? '',
          target: '',
          roll: rollFace(d.roll),
          total: 0,
          against: 0,
          hit: false,
          critical: false,
          damage: 0,
          deathSave: deathSaveSnapshot({
            outcome: enumByWord(
              DeathSaveOutcome,
              d.outcome,
              DeathSaveOutcome.UNSPECIFIED
            ),
            successesAdded: d.successesAdded,
            failuresAdded: d.failuresAdded,
            successes: d.successes,
            failures: d.failures,
            successesNeeded: d.successesNeeded,
            failuresRemaining: d.failuresRemaining,
            stabilized: d.stabilized,
            dead: d.dead,
            recovered: d.recovered,
            hpRestored: d.hpRestored,
            continuation: enumByWord(
              DeathSaveContinuation,
              d.continuation,
              DeathSaveContinuation.UNSPECIFIED
            ),
          }),
          die: COMBAT_D20,
        }),
      ];
    }
    case 'clock': {
      const w = body.value.rollWindow;
      // A legacy window with no token stays story only; a current one joins
      // the paused response's physical throw by its token.
      if (
        body.value.mark !== ClockMark.ROLL_WINDOW_OPENED ||
        !w?.presentationId
      ) {
        return [];
      }
      return [
        freezeRecord({
          kind: 'attack' as const,
          session: act.session,
          seq,
          authoritySeq: seq,
          presentationId: w.presentationId,
          roller: w.audience?.id ?? '',
          attacker: w.audience?.id ?? '',
          roll: rollFace(w.roll),
          total: w.roll?.total ?? 0,
          die: COMBAT_D20,
        }),
      ];
    }
    case 'cast': {
      const c = body.value;
      const spell = { ref: c.spell?.ref ?? '', name: c.spell?.name ?? '' };
      const out: AuthoritySnapshot[] = [];
      c.results.forEach((r, k) => {
        if (!r.save) return;
        if (r.outcome === CastOutcome.WARDED) {
          // The caster's spell met a ward: the caster saved, and failed.
          out.push(
            saveAuthority(
              act,
              seq,
              saveIdentity(k),
              localId(k),
              c.by?.id ?? '',
              r.ability,
              r.save,
              false,
              { ref: '', name: 'Ward' }
            )
          );
          return;
        }
        out.push(
          saveAuthority(
            act,
            seq,
            saveIdentity(k),
            localId(k),
            r.target?.id ?? '',
            r.ability,
            r.save,
            r.outcome === CastOutcome.SAVED,
            spell
          )
        );
      });
      return out;
    }
    case 'activate':
      return body.value.saves.map((s, k) =>
        saveAuthority(
          act,
          seq,
          saveIdentity(k),
          localId(k),
          s.saver?.id ?? '',
          s.ability,
          s.roll,
          s.roll?.beaten ?? false,
          { ref: s.source?.ref ?? '', name: s.source?.name ?? '' }
        )
      );
    default:
      return [];
  }
}

function sameAttack(
  first: AttackSnapshot | undefined,
  later: AttackSnapshot | undefined
): boolean {
  if (!first || !later) return first === later;
  return (
    first.ref === later.ref &&
    first.name === later.name &&
    Object.is(first.damageType, later.damageType)
  );
}

function canonicalTypedIdentity(
  value: unknown,
  ancestors = new WeakSet<object>()
): string {
  if (value === undefined) return 'u';
  if (value === null) return 'n';

  switch (typeof value) {
    case 'boolean':
      return value ? 'b1' : 'b0';
    case 'string':
      return `s${value.length}:${value}`;
    case 'number': {
      const token = Number.isNaN(value)
        ? 'NaN'
        : value === Infinity
          ? '+Infinity'
          : value === -Infinity
            ? '-Infinity'
            : Object.is(value, -0)
              ? '-0'
              : String(value);
      return `d${token.length}:${token}`;
    }
    case 'bigint': {
      const token = String(value);
      return `i${token.length}:${token}`;
    }
    case 'object': {
      if (ancestors.has(value)) {
        throw new TypeError('cyclic values cannot form presentation identity');
      }
      ancestors.add(value);
      let identity: string;
      if (Array.isArray(value)) {
        const items = Array.from({ length: value.length }, (_, index) =>
          Object.hasOwn(value, index)
            ? canonicalTypedIdentity(value[index], ancestors)
            : 'h'
        );
        identity = `a${value.length}:[${items.join('')}]`;
      } else if (ArrayBuffer.isView(value)) {
        const name = value.constructor.name;
        const bytes = new Uint8Array(
          value.buffer,
          value.byteOffset,
          value.byteLength
        );
        identity = `v${name.length}:${name}:${bytes.length}:${Array.from(bytes)
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('')}`;
      } else {
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record).sort();
        identity = `o${keys.length}:{${keys
          .map(
            (key) =>
              canonicalTypedIdentity(key, ancestors) +
              canonicalTypedIdentity(record[key], ancestors)
          )
          .join('')}}`;
      }
      ancestors.delete(value);
      return identity;
    }
    case 'function':
    case 'symbol':
      throw new TypeError(
        `${typeof value} values cannot form presentation identity`
      );
  }
  throw new TypeError('unsupported value cannot form presentation identity');
}

function actFacts(act: Act): string | undefined {
  return act.body.case === undefined
    ? undefined
    : canonicalTypedIdentity(act.body.value);
}

function sameAuthority(
  first: AuthoritySnapshot,
  later: AuthoritySnapshot
): boolean {
  return (
    first.kind === later.kind &&
    first.session === later.session &&
    first.presentationId === later.presentationId &&
    first.roller === later.roller &&
    first.attacker === later.attacker &&
    Object.is(first.roll, later.roll) &&
    Object.is(first.total, later.total) &&
    // The existing window is roll-only; the paired actor response may also
    // identify the target/attack. Compare final facts only when both have them.
    ((first.kind === 'attack' &&
      (first.against === undefined || later.against === undefined)) ||
      (first.target === later.target &&
        Object.is(first.against, later.against) &&
        first.hit === later.hit &&
        first.critical === later.critical &&
        Object.is(first.damage, later.damage) &&
        sameAttack(first.attack, later.attack))) &&
    canonicalTypedIdentity(first.deathSave) ===
      canonicalTypedIdentity(later.deathSave) &&
    canonicalTypedIdentity(first.save) === canonicalTypedIdentity(later.save) &&
    canonicalTypedIdentity(first.die) === canonicalTypedIdentity(later.die)
  );
}

function hash(value: string): number {
  let result = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
}

function eventId(kind: 'request' | 'release', presentationId: string): string {
  return `${kind}:${hash(`${kind}:${presentationId}`).toString(16)}`;
}

function isAuthoritativeLocalPlayer(
  state: Pick<CombatPresentationState, 'viewerMember' | 'rollerRoles'>,
  attacker: string
): boolean {
  return (
    attacker === state.viewerMember && state.rollerRoles[attacker] === 'player'
  );
}

function createRequest(
  state: Pick<CombatPresentationState, 'rollerRoles'>,
  authority: AuthoritySnapshot
): DicePresentationRequestedEvent | undefined {
  const presentationId = authority.presentationId;
  const role = state.rollerRoles[authority.roller];
  // THE DIE COMES FROM THE FACT, and so does the range its face must fall in.
  // A d20's 1..20 used to be written here as a constant; it is now the
  // descriptor's own bounds, so a face impossible on the die actually rolled
  // is refused rather than a face impossible on a d20.
  const die = authority.die;
  if (
    !isDicePresentationIdentifier(presentationId) ||
    !role ||
    !isDicePresentationIdentifier(authority.roller) ||
    !Number.isInteger(authority.roll) ||
    authority.roll < die.minimum ||
    authority.roll > die.maximum
  ) {
    return undefined;
  }
  return Object.freeze({
    schemaVersion: 1,
    type: 'dice-presentation-requested',
    eventId: eventId('request', presentationId),
    presentationId,
    ...(authority.authoritySeq !== undefined
      ? { authoritySeq: authority.authoritySeq }
      : {}),
    roller: Object.freeze({ entityId: authority.roller, role }),
    die: Object.freeze({
      kind: die.kind,
      presetId: die.presetId,
      authoritativeResult: authority.roll,
    }),
  });
}

function createNeutralRelease(
  request: DicePresentationRequestedEvent
): DicePresentationReleasedEvent {
  return Object.freeze({
    schemaVersion: 1,
    type: 'dice-presentation-released',
    eventId: eventId('release', request.presentationId),
    presentationId: request.presentationId,
    release: createDicePresentationRelease({
      presentationId: request.presentationId,
      presetId: request.die.presetId,
      throwProfile: createNeutralVisualThrowProfile(
        hash(request.presentationId)
      ),
    }),
  });
}

function isReleaseCompatible(
  request: DicePresentationRequestedEvent,
  release: DicePresentationReleasedEvent | undefined
): release is DicePresentationReleasedEvent {
  return (
    release !== undefined &&
    release.presentationId === request.presentationId &&
    release.release.presentationId === request.presentationId &&
    release.release.presetId === request.die.presetId
  );
}

function deepFreeze<T>(value: T): T {
  if (
    value === null ||
    typeof value !== 'object' ||
    ArrayBuffer.isView(value) ||
    Object.isFrozen(value)
  ) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function snapshotAct(act: Act): Act {
  return deepFreeze(clone(ActSchema, act));
}

function diceEventsFor(
  presentations: readonly CombatPresentationRecord[]
): readonly DicePresentationEvent[] {
  const events: DicePresentationEvent[] = [];
  for (const record of [...presentations].sort(
    (left, right) => left.order - right.order
  )) {
    if (record.conflicted || record.supersededByOutcome) continue;
    if (record.request) events.push(record.request);
    if (record.release) events.push(record.release);
  }
  return Object.freeze(events);
}

export const COMBAT_DEBUG_MAX_LINES = 500;

function appendDebugLine(
  debug: readonly DebugFeedEntry[],
  line: DebugFeedEntry
): readonly DebugFeedEntry[] {
  const start = Math.max(0, debug.length - COMBAT_DEBUG_MAX_LINES + 1);
  return Object.freeze([...debug.slice(start), line]);
}

function diagnose(
  state: CombatPresentationState,
  message: string
): CombatPresentationState {
  const diagnostic = `combat-presentation: ${message}`;
  return Object.freeze({
    ...state,
    diagnostics: Object.freeze([...state.diagnostics, diagnostic]),
    debug: appendDebugLine(state.debug, diagnostic),
  });
}

function appendRawDebug(
  state: CombatPresentationState,
  fact: CombatStreamFact
): CombatPresentationState {
  const act = fact.act;
  const family = Family[act.family]?.toLowerCase() ?? String(act.family);
  const entry: DebugFeedEntry = Object.freeze({
    id: state.nextDebugId,
    text: `act ${act.id} ${family} ${act.act || '-'}${act.refused ? ` refused: ${act.refusal}` : ''} source=${fact.metadata.source}`,
  });
  return Object.freeze({
    ...state,
    nextDebugId: state.nextDebugId + 1,
    debug: appendDebugLine(state.debug, entry),
  });
}

function identityAt(
  state: CombatPresentationState,
  key: string
): CombatPresentationIdentity | undefined {
  return state.identities.find((identity) => identity.key === key);
}

function addIdentity(
  state: CombatPresentationState,
  key: string,
  category: CombatPresentationIdentity['category']
): readonly CombatPresentationIdentity[] {
  return Object.freeze([
    ...state.identities,
    Object.freeze({
      key,
      category,
      conflicted: false,
      order: state.nextOrder,
    }),
  ]);
}

function markConflicted(
  state: CombatPresentationState,
  key: string,
  message: string
): CombatPresentationState {
  const identities = state.identities.map((identity) =>
    identity.key === key && !identity.conflicted
      ? Object.freeze({ ...identity, conflicted: true })
      : identity
  );
  const presentations = state.presentations.map((record) =>
    record.key === key && !record.conflicted
      ? Object.freeze({
          ...record,
          request: undefined,
          release: undefined,
          settlement: 'auto' as const,
          semanticFallback: false,
          localPlayerOwned: false,
          locallyArmedResponse: false,
          conflicted: true,
        })
      : record
  );
  const otherStory = state.otherStory.map((record) =>
    record.key === key && !record.conflicted
      ? Object.freeze({ ...record, conflicted: true })
      : record
  );
  const conflicted = Object.freeze({
    ...state,
    identities: Object.freeze(identities),
    presentations: Object.freeze(presentations),
    otherStory: Object.freeze(otherStory),
    pendingLocalKeys: Object.freeze(
      state.pendingLocalKeys.filter((pendingKey) => pendingKey !== key)
    ),
    diceEvents: diceEventsFor(presentations),
  });
  return diagnose(conflicted, message);
}

// The provider catalog type identifies spell presentation; no spell rules or
// individual spell IDs are reconstructed here.
function isStreamDeliveredRoll(authority: AuthoritySnapshot): boolean {
  return (
    authority.kind === 'save' ||
    (authority.kind === 'attack' &&
      parseRef(authority.attack?.ref ?? '')?.type === 'spells')
  );
}

function initialRecord(
  state: CombatPresentationState,
  authority: AuthoritySnapshot,
  options: {
    responseAccepted: boolean;
    act?: Act;
    actIndex?: number;
    source?: 'live' | 'catchup';
  }
): { record: CombatPresentationRecord; pending: boolean } {
  const request = createRequest(state, authority);
  const roleKnown = state.rollerRoles[authority.attacker] !== undefined;
  const localPlayer = isAuthoritativeLocalPlayer(state, authority.attacker);
  const historical = options.act !== undefined && options.source === 'catchup';
  // Saves and spell attacks arrive fully resolved on the stream. CastResponse
  // carries no attack result, so there is no dock response to release their dice.
  const pending =
    localPlayer && !historical && !isStreamDeliveredRoll(authority);
  const settlement = historical
    ? ('auto' as const)
    : !roleKnown
      ? ('unresolved' as const)
      : pending || authority.kind === 'death-save'
        ? ('armed' as const)
        : ('auto' as const);
  const release =
    request && settlement === 'auto'
      ? createNeutralRelease(request)
      : undefined;
  return {
    record: Object.freeze({
      key: authorityKey(authority),
      presentationId: authority.presentationId,
      session: authority.session,
      seq: authority.seq,
      authority,
      responseAccepted: options.responseAccepted,
      eventAccepted: options.act !== undefined,
      act: options.act,
      actIndex: options.actIndex,
      eventFacts: options.act ? actFacts(options.act) : undefined,
      eventSource: options.source,
      request,
      release,
      settlement,
      semanticFallback: roleKnown && request === undefined,
      localPlayerOwned: localPlayer,
      locallyArmedResponse:
        options.responseAccepted && pending && settlement === 'armed',
      conflicted: false,
      order: state.nextOrder,
    }),
    pending,
  };
}

function addAttackRecord(
  state: CombatPresentationState,
  authority: AuthoritySnapshot,
  options: {
    responseAccepted: boolean;
    act?: Act;
    actIndex?: number;
    source?: 'live' | 'catchup';
  }
): CombatPresentationState {
  const key = authorityKey(authority);
  const initial = initialRecord(state, authority, options);
  // A post-roll choice has two Story beats but only one physical throw. The
  // paused response's seq names its window; the eventual Struck/Missed has a
  // later seq and may include an inspiration bonus. Its provider token still
  // names the d20 the actor already settled, not a second throw to enqueue.
  const settledResponse =
    options.act &&
    authority.kind === 'attack' &&
    isDicePresentationIdentifier(authority.presentationId)
      ? state.presentations.find(
          (prior) =>
            !prior.conflicted &&
            (prior.responseAccepted || isRollWindowAct(prior.act)) &&
            (!prior.eventAccepted || isRollWindowAct(prior.act)) &&
            (prior.settlement === 'released' || prior.settlement === 'auto') &&
            prior.authority.kind === 'attack' &&
            prior.session === authority.session &&
            prior.presentationId === authority.presentationId &&
            prior.authority.attacker === authority.attacker &&
            (prior.authority.target === undefined ||
              prior.authority.target === authority.target) &&
            prior.authority.roll === authority.roll &&
            (!prior.authority.attack ||
              prior.authority.attack.ref === authority.attack?.ref)
        )
      : undefined;
  const record = settledResponse
    ? Object.freeze({
        ...initial.record,
        request: settledResponse.request,
        release: settledResponse.release,
        settlement: settledResponse.settlement,
        semanticFallback: settledResponse.semanticFallback,
        locallyArmedResponse: false,
      })
    : initial.record;
  const pending = initial.pending && !settledResponse;
  // Retain the original response for duplicate/conflict checks, but retire its
  // provisional presentation duties. It will never get an event at its own
  // seq: without this transition it hides the target as "unresolved" forever,
  // even after the final outcome and the monster's downed state have arrived.
  const presentations = Object.freeze([
    ...state.presentations.map((prior) =>
      prior === settledResponse
        ? Object.freeze({ ...prior, supersededByOutcome: key })
        : prior
    ),
    record,
  ]);
  return Object.freeze({
    ...state,
    identities: addIdentity(state, key, authority.kind),
    presentations,
    pendingLocalKeys: pending
      ? Object.freeze([...state.pendingLocalKeys, key])
      : state.pendingLocalKeys,
    diceEvents: diceEventsFor(presentations),
    nextOrder: state.nextOrder + 1,
  });
}

function replacePresentation(
  state: CombatPresentationState,
  index: number,
  record: CombatPresentationRecord,
  pendingLocalKeys = state.pendingLocalKeys
): CombatPresentationState {
  const presentations = [...state.presentations];
  presentations[index] = Object.freeze(record);
  return Object.freeze({
    ...state,
    presentations: Object.freeze(presentations),
    pendingLocalKeys: Object.freeze([...pendingLocalKeys]),
    diceEvents: diceEventsFor(presentations),
  });
}

function inSession(state: CombatPresentationState, session: string): boolean {
  return !state.session || state.session === session;
}

function acceptResponse(
  state: CombatPresentationState,
  fact: AttackResponseFact | DeathSaveResponseFact
): CombatPresentationState {
  if (!inSession(state, fact.session)) {
    return diagnose(state, `response outside session ${state.session} ignored`);
  }
  let authority: AuthoritySnapshot;
  try {
    // A warded response has no attack roll. Its typed event owns the save.
    if (fact.type === 'attack-response' && fact.response.warded) return state;
    authority =
      fact.type === 'attack-response'
        ? authorityFromResponse(fact)
        : authorityFromDeathSaveResponse(fact);
  } catch (error) {
    return diagnose(
      state,
      `rejected dice response: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const key = authorityKey(authority);
  const identity = identityAt(state, key);
  if (!identity) {
    return addAttackRecord(state, authority, { responseAccepted: true });
  }
  if (identity.category !== authority.kind) {
    return markConflicted(
      state,
      key,
      `dice response conflicts with typed Story for ${key}`
    );
  }

  const index = state.presentations.findIndex((record) => record.key === key);
  const current = state.presentations[index];
  if (!current) {
    return markConflicted(state, key, `missing attack record for ${key}`);
  }
  if (!sameAuthority(current.authority, authority)) {
    return markConflicted(
      state,
      key,
      `conflicting authority for ${key}; response rejected`
    );
  }
  if (current.responseAccepted) return state;
  const upgradedAuthority =
    authority.kind === 'death-save'
      ? Object.freeze({
          ...current.authority,
          authoritySeq: authority.authoritySeq,
        })
      : current.authority.against === undefined
        ? authority
        : // The act made this record first; only the actor's response
          // carries the sequence its physical throw is published under.
          Object.freeze({
            ...current.authority,
            authoritySeq:
              current.authority.authoritySeq ?? authority.authoritySeq,
          });
  const upgradedRequest = createRequest(state, upgradedAuthority);
  return replacePresentation(state, index, {
    ...current,
    authority: upgradedAuthority,
    request: upgradedRequest,
    responseAccepted: true,
    locallyArmedResponse:
      !current.conflicted &&
      current.settlement === 'armed' &&
      state.pendingLocalKeys.includes(key),
  });
}

function settleCatchupPresentation(
  state: CombatPresentationState,
  index: number,
  source: 'live' | 'catchup'
): CombatPresentationState {
  const current = state.presentations[index]!;
  const catchesUpAcceptedDeathSave =
    current.authority.kind === 'death-save' && current.responseAccepted;
  if (
    source !== 'catchup' ||
    current.conflicted ||
    (current.settlement !== 'armed' && current.settlement !== 'unresolved') ||
    (state.pendingLocalKeys.includes(current.key) &&
      !catchesUpAcceptedDeathSave)
  ) {
    return state;
  }
  const release = current.request
    ? createNeutralRelease(current.request)
    : undefined;
  return replacePresentation(
    state,
    index,
    {
      ...current,
      release,
      settlement: 'auto',
      locallyArmedResponse: false,
    },
    catchesUpAcceptedDeathSave
      ? state.pendingLocalKeys.filter((key) => key !== current.key)
      : state.pendingLocalKeys
  );
}

function isRollWindowAct(act: Act | undefined): boolean {
  return (
    act?.body.case === 'clock' &&
    act.body.value.mark === ClockMark.ROLL_WINDOW_OPENED
  );
}

/** Accepts one authority an act carries; answers the record key it landed on. */
function acceptAuthorityAct(
  state: CombatPresentationState,
  fact: CombatStreamFact,
  incoming: AuthoritySnapshot
): { state: CombatPresentationState; key: string } {
  let authority = incoming;
  let key = authorityKey(authority);
  const act = snapshotAct(fact.act);
  const options = {
    responseAccepted: false,
    act,
    actIndex: fact.index,
    source: fact.metadata.source,
  };
  // A POST-ROLL CHOICE HAS TWO ACTS BUT ONE PHYSICAL THROW. The paused
  // response and its roll window share the provider token, and so does the
  // swing that finally lands — which may carry an inspiration bonus. The
  // window owns the token's record; the swing is its own record, joined to
  // the settled throw by `addAttackRecord`, never a second throw.
  const prior = state.presentations.find((record) => record.key === key);
  // The paused response's own window may never reach this client (a window is
  // its roller's alone), so a settled response that saw no act of its own and
  // now meets a swing with its token but other numbers is that outcome too.
  const settledPausedResponse =
    prior !== undefined &&
    prior.act === undefined &&
    prior.responseAccepted &&
    (prior.settlement === 'released' || prior.settlement === 'auto') &&
    !sameAuthority(prior.authority, authority);
  if (
    authority.kind === 'attack' &&
    fact.act.body.case === 'attack' &&
    prior &&
    (isRollWindowAct(prior.act) || settledPausedResponse)
  ) {
    authority = freezeRecord({ ...authority, identity: `${key}:outcome` });
    key = authorityKey(authority);
  }
  const identity = identityAt(state, key);
  if (!identity) {
    return { state: addAttackRecord(state, authority, options), key };
  }
  if (identity.category !== authority.kind) {
    return {
      state: markConflicted(
        state,
        key,
        `dice act conflicts with typed Story for ${key}`
      ),
      key,
    };
  }
  const index = state.presentations.findIndex((record) => record.key === key);
  const current = state.presentations[index];
  if (!current) {
    return {
      state: markConflicted(state, key, `missing attack record for ${key}`),
      key,
    };
  }
  if (!sameAuthority(current.authority, authority)) {
    return {
      state: markConflicted(
        state,
        key,
        `conflicting authority for ${key}; act rejected`
      ),
      key,
    };
  }
  const facts = actFacts(act);
  if (current.eventAccepted) {
    if (current.eventFacts !== facts) {
      return {
        state: markConflicted(
          state,
          key,
          `conflicting typed attack facts for ${key}`
        ),
        key,
      };
    }
    return {
      state: settleCatchupPresentation(state, index, fact.metadata.source),
      key,
    };
  }

  const pending = state.pendingLocalKeys.includes(key);
  const settlement = pending ? 'armed' : current.settlement;
  const release =
    settlement === 'armed' || !current.request
      ? current.release
      : (current.release ?? createNeutralRelease(current.request));
  const accepted = replacePresentation(state, index, {
    ...current,
    eventAccepted: true,
    act,
    actIndex: fact.index,
    eventFacts: facts,
    eventSource: fact.metadata.source,
    release,
    settlement,
    locallyArmedResponse:
      current.responseAccepted && pending && settlement === 'armed',
  });
  // A reconnect catch-up is already-spent provider history. Only the
  // response-first Death Save needs this first-act path.
  return {
    state:
      authority.kind === 'death-save' && current.responseAccepted
        ? settleCatchupPresentation(accepted, index, fact.metadata.source)
        : accepted,
    key,
  };
}

/** Every act takes one story row, gated by the authority records it made. */
function acceptStoryAct(
  state: CombatPresentationState,
  fact: CombatStreamFact,
  authorityKeys: readonly string[]
): CombatPresentationState {
  const key = `act:${actStoryId(fact.act, fact.index)}`;
  const factsIdentity = canonicalTypedIdentity({
    family: fact.act.family,
    act: fact.act.act,
    refused: fact.act.refused,
    body: fact.act.body.value ?? null,
  });
  const identity = identityAt(state, key);
  if (identity) {
    const existing = state.otherStory.find((record) => record.key === key);
    if (!existing || existing.relevantFacts !== factsIdentity) {
      return markConflicted(state, key, `conflicting typed facts for ${key}`);
    }
    return state;
  }
  const act = snapshotAct(fact.act);
  // THE BEARING IS FIXED WHEN THE SOUND IS HEARD (rpg-project#569).
  const heard =
    act.body.case === 'perception' && act.body.value.sense === Sense.HEARING;
  const listenerAt =
    heard && fact.listenerAt
      ? Object.freeze({ x: fact.listenerAt.x, y: fact.listenerAt.y })
      : undefined;
  const record: OtherStoryRecord = Object.freeze({
    key,
    fact: Object.freeze({
      act,
      index: fact.index,
      seq: fact.seq,
      source: fact.metadata.source,
      visible: true,
      ...(listenerAt ? { listenerAt } : {}),
    }),
    relevantFacts: factsIdentity,
    authorityKeys: Object.freeze([...authorityKeys]),
    conflicted: false,
    order: state.nextOrder,
  });
  return Object.freeze({
    ...state,
    identities: addIdentity(state, key, 'other'),
    otherStory: Object.freeze([...state.otherStory, record]),
    nextOrder: state.nextOrder + 1,
  });
}

function acceptStreamAct(
  original: CombatPresentationState,
  fact: CombatStreamFact
): CombatPresentationState {
  const state = appendRawDebug(original, fact);
  if (!inSession(state, fact.act.session)) {
    return diagnose(state, `act outside session ${state.session} ignored`);
  }
  let authorities: readonly AuthoritySnapshot[];
  try {
    authorities = authoritiesFromAct(fact.act, fact.index, fact.seq);
  } catch (error) {
    return diagnose(
      state,
      `rejected typed act: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  let next = state;
  const keys: string[] = [];
  for (const authority of authorities) {
    const accepted = acceptAuthorityAct(next, fact, authority);
    next = accepted.state;
    keys.push(accepted.key);
  }
  return acceptStoryAct(next, fact, keys);
}

function acceptLocalRelease(
  state: CombatPresentationState,
  fact: LocalDiceReleaseFact
): CombatPresentationState {
  const parsed = parseDicePresentationEvent(fact.event);
  if (!parsed || parsed.type !== 'dice-presentation-released') {
    return diagnose(state, 'malformed local dice release ignored');
  }
  const index = state.presentations.findIndex(
    (record) => record.presentationId === parsed.presentationId
  );
  if (index < 0) {
    return diagnose(state, 'release for unknown presentation ignored');
  }
  const current = state.presentations[index]!;
  if (current.release) {
    return canonicalTypedIdentity(current.release) ===
      canonicalTypedIdentity(parsed)
      ? state
      : diagnose(state, `conflicting release for ${parsed.presentationId}`);
  }
  if (
    current.conflicted ||
    state.pendingLocalKeys[0] !== current.key ||
    !current.localPlayerOwned ||
    current.request?.roller.role !== 'player' ||
    current.settlement !== 'armed' ||
    parsed.release.presentationId !== current.request.presentationId ||
    parsed.release.presetId !== current.request.die.presetId
  ) {
    return diagnose(state, `ineligible release for ${parsed.presentationId}`);
  }
  return replacePresentation(
    state,
    index,
    {
      ...current,
      release: parsed,
      settlement: 'released',
      locallyArmedResponse: false,
    },
    state.pendingLocalKeys.slice(1)
  );
}

function acceptSemanticRelease(
  state: CombatPresentationState,
  fact: SemanticDiceReleaseFact
): CombatPresentationState {
  const index = state.presentations.findIndex(
    (record) => record.key === fact.presentationKey
  );
  if (index < 0) {
    return diagnose(state, 'semantic release for unknown presentation ignored');
  }
  const current = state.presentations[index]!;
  if (current.semanticFallback && current.settlement === 'released') {
    return state;
  }
  if (
    current.conflicted ||
    state.pendingLocalKeys[0] !== current.key ||
    !current.semanticFallback ||
    !current.localPlayerOwned ||
    current.settlement !== 'armed'
  ) {
    return diagnose(state, 'ineligible semantic release ignored');
  }
  return replacePresentation(
    state,
    index,
    {
      ...current,
      settlement: 'released',
      locallyArmedResponse: false,
    },
    state.pendingLocalKeys.slice(1)
  );
}

function acceptWitnessSettlement(
  state: CombatPresentationState,
  fact: WitnessDiceSettlementFact
): CombatPresentationState {
  const index = state.presentations.findIndex(
    (record) =>
      record.presentationId === fact.presentationId &&
      record.authority.kind === 'death-save'
  );
  const current = state.presentations[index];
  if (
    !current ||
    current.conflicted ||
    current.localPlayerOwned ||
    current.settlement !== 'armed' ||
    !current.request
  ) {
    return diagnose(
      state,
      `ineligible witness settlement for ${fact.presentationId}`
    );
  }
  return replacePresentation(state, index, {
    ...current,
    release: createNeutralRelease(current.request),
    settlement: 'released',
  });
}

function sameStringRecord(
  first: Readonly<Record<string, string>>,
  later: Readonly<Record<string, string>>
): boolean {
  const firstEntries = Object.entries(first);
  const laterEntries = Object.entries(later);
  return (
    firstEntries.length === laterEntries.length &&
    firstEntries.every(([key, value]) => later[key] === value)
  );
}

function configurePresentation(
  state: CombatPresentationState,
  fact: CombatPresentationConfigFact
): CombatPresentationState {
  if (
    (state.session && state.session !== fact.session) ||
    state.viewerMember !== fact.viewerMember
  ) {
    return emptyPresentation(fact);
  }
  if (
    state.session === fact.session &&
    sameStringRecord(state.memberNames, fact.memberNames) &&
    sameStringRecord(state.rollerRoles, fact.rollerRoles)
  ) {
    return state;
  }

  const configured = {
    ...state,
    session: fact.session,
    memberNames: Object.freeze({ ...fact.memberNames }),
    rollerRoles: Object.freeze({ ...fact.rollerRoles }),
  };
  const pendingLocalKeys: string[] = [];
  const presentations = state.presentations.map((record) => {
    if (record.conflicted) return record;

    const configuredRole = configured.rollerRoles[record.authority.attacker];
    const roleKnown = configuredRole !== undefined;
    const newlyLocal = isAuthoritativeLocalPlayer(
      configured,
      record.authority.attacker
    );

    // Once stable public roster facts arm the local player, a later empty
    // roster/Turn transition cannot revoke ownership or auto-settle it.
    if (record.localPlayerOwned) {
      const request =
        record.request ??
        createRequest(
          {
            ...configured,
            rollerRoles: {
              ...configured.rollerRoles,
              [record.authority.attacker]: 'player',
            },
          },
          record.authority
        );
      if (record.settlement === 'armed') pendingLocalKeys.push(record.key);
      return Object.freeze({
        ...record,
        request,
        release: record.release,
        semanticFallback: record.semanticFallback || request === undefined,
        localPlayerOwned: true,
        locallyArmedResponse:
          record.responseAccepted && record.settlement === 'armed',
      });
    }

    // Unknown roster role stays unresolved and concealed. Late public roster
    // may authorize it exactly once; no role is inferred from attacker id or
    // transient Turn participants.
    if (record.settlement === 'unresolved') {
      if (!roleKnown) return record;
      const request = createRequest(configured, record.authority);
      if (newlyLocal && !isStreamDeliveredRoll(record.authority)) {
        pendingLocalKeys.push(record.key);
        return Object.freeze({
          ...record,
          request,
          release: undefined,
          settlement: 'armed' as const,
          semanticFallback: request === undefined,
          localPlayerOwned: true,
          locallyArmedResponse: record.responseAccepted,
        });
      }
      if (record.authority.kind === 'death-save') {
        return Object.freeze({
          ...record,
          request,
          release: undefined,
          settlement: 'armed' as const,
          semanticFallback: request === undefined,
          localPlayerOwned: false,
          locallyArmedResponse: false,
        });
      }
      return Object.freeze({
        ...record,
        request,
        release: request ? createNeutralRelease(request) : undefined,
        settlement: 'auto' as const,
        semanticFallback: request === undefined,
        localPlayerOwned: false,
        locallyArmedResponse: false,
      });
    }

    const request = roleKnown
      ? createRequest(configured, record.authority)
      : record.request;
    const release =
      request && record.settlement !== 'armed'
        ? isReleaseCompatible(request, record.release) &&
          record.settlement === 'released'
          ? record.release
          : createNeutralRelease(request)
        : undefined;
    return Object.freeze({
      ...record,
      request,
      release,
      semanticFallback:
        roleKnown && request === undefined && record.settlement !== 'auto',
      locallyArmedResponse: false,
    });
  });

  return Object.freeze({
    ...configured,
    presentations: Object.freeze(presentations),
    pendingLocalKeys: Object.freeze(pendingLocalKeys),
    diceEvents: diceEventsFor(presentations),
  });
}

/** Pure state machine; it records authority immediately and gates only projection. */
export function reduceCombatPresentation(
  state: CombatPresentationState,
  fact: CombatPresentationFact
): CombatPresentationState {
  switch (fact.type) {
    case 'configure':
      return configurePresentation(state, fact);
    case 'attack-response':
    case 'death-save-response':
      return acceptResponse(state, fact);
    case 'stream-act':
      return acceptStreamAct(state, fact);
    case 'local-release':
      return acceptLocalRelease(state, fact);
    case 'semantic-release':
      return acceptSemanticRelease(state, fact);
    case 'witness-settlement':
      return acceptWitnessSettlement(state, fact);
  }
}

function isVisible(record: CombatPresentationRecord): boolean {
  return (
    !record.conflicted &&
    record.eventAccepted &&
    record.settlement !== 'armed' &&
    record.settlement !== 'unresolved'
  );
}

function orderedStoryFacts(state: CombatPresentationState): CombatStoryFact[] {
  const records = new Map(state.presentations.map((r) => [r.key, r]));
  const facts: { order: number; fact: CombatStoryFact }[] = [];
  for (const record of state.otherStory) {
    if (record.conflicted) continue;
    const authority = record.authorityKeys.map((key) => records.get(key));
    if (authority.some((r) => r?.conflicted)) continue;
    facts.push({
      order: record.order,
      fact: {
        ...record.fact,
        // An actor's own live roll stays hidden until its die is released.
        visible: authority.every((r) => r === undefined || isVisible(r)),
      },
    });
  }
  facts.sort((left, right) => left.order - right.order);
  return facts.map(({ fact }) => fact);
}

export function selectVisibleStory(
  state: CombatPresentationState
): readonly CombatExperienceStoryExchange[] {
  return buildActStory(orderedStoryFacts(state), {
    viewerMember: state.viewerMember,
    memberNames: state.memberNames,
  });
}

export function selectVisibleResult(
  state: CombatPresentationState
): CombatExperienceAttackOutcome | undefined {
  const record = selectCurrentPresentation(state);
  if (!record?.act || !isVisible(record)) return undefined;
  return buildActAttackOutcome(
    { act: record.act, index: record.actIndex ?? 0, seq: record.seq },
    { viewerMember: state.viewerMember, memberNames: state.memberNames }
  );
}

/**
 * Targets of attacks whose roll has NOT yet been revealed to this viewer.
 *
 * `isVisible` is already the codebase's answer to "has this attack resolved
 * on screen" — it is what gates the Story result. This reuses it rather than
 * growing a second, drifting definition, and reports who each unresolved
 * attack was aimed at so the map can hold that target's downed reveal until
 * the roll lands (`downedReveal.ts`).
 *
 * The set is narrow by construction. `initialRecord` only withholds
 * settlement for the local player's own LIVE attack (`'armed'`, awaiting the
 * dice) or for a record whose roller role is not known yet (`'unresolved'`);
 * a monster's attack, and every catch-up record, settle `'auto'` and are
 * visible immediately. Conflicted records are excluded — they are forced to
 * `'auto'` anyway, and a conflict must never be able to wedge the map.
 */
export function selectUnresolvedAttackTargets(
  state: CombatPresentationState
): ReadonlySet<string> {
  const targets = new Set<string>();
  for (const record of state.presentations) {
    if (
      record.conflicted ||
      record.supersededByOutcome ||
      record.authority.kind !== 'attack' ||
      !record.authority.target
    )
      continue;
    if (isVisible(record)) continue;
    targets.add(record.authority.target);
  }
  return targets;
}

export function selectLiveAnnouncement(
  state: CombatPresentationState
): string | null {
  const current = selectCurrentPresentation(state);
  if (current?.conflicted) return null;
  const fact = orderedStoryFacts(state).at(-1);
  if (!fact || fact.source !== 'live' || !fact.visible) return null;
  const [entry] = buildActStory([fact], {
    viewerMember: state.viewerMember,
    memberNames: state.memberNames,
  });
  return entry ? `${entry.headline}. ${entry.detail}` : null;
}

/** Acts carry no shared sequence; the order they arrived in is the order. */
function isAuthoritativelyNewer(
  candidate: CombatPresentationRecord,
  current: CombatPresentationRecord
): boolean {
  return candidate.order > current.order;
}

export function selectCurrentPresentation(
  state: CombatPresentationState
): CombatPresentationRecord | undefined {
  let pending: CombatPresentationRecord | undefined;
  for (const key of state.pendingLocalKeys) {
    pending = state.presentations.find(
      (record) =>
        record.key === key &&
        !record.conflicted &&
        record.settlement === 'armed'
    );
    if (pending) break;
  }

  let latestConflict: CombatPresentationRecord | undefined;
  for (const record of state.presentations) {
    if (
      record.conflicted &&
      (!latestConflict || isAuthoritativelyNewer(record, latestConflict))
    ) {
      latestConflict = record;
    }
  }

  // Settled witnesses never displace FIFO local work, but newer conflicted
  // authority must fail closed instead of resurrecting an older pending roll.
  if (pending) {
    return latestConflict && isAuthoritativelyNewer(latestConflict, pending)
      ? latestConflict
      : pending;
  }

  let current: CombatPresentationRecord | undefined;
  for (const record of state.presentations) {
    if (!current || isAuthoritativelyNewer(record, current)) current = record;
  }
  return current;
}

export function selectCurrentDiceEvents(
  state: CombatPresentationState
): readonly DicePresentationEvent[] {
  const current = selectCurrentPresentation(state);
  if (!current || current.conflicted) return Object.freeze([]);
  return Object.freeze(
    [current.request, current.release].filter(
      (event): event is DicePresentationEvent => event !== undefined
    )
  );
}

export function selectConcealsDeathSaveTruth(
  state: CombatPresentationState
): boolean {
  const current = selectCurrentPresentation(state);
  return (
    current !== undefined &&
    !current.conflicted &&
    current.authority.kind === 'death-save' &&
    (current.responseAccepted || current.eventSource === 'live') &&
    (current.settlement === 'armed' || current.settlement === 'unresolved')
  );
}

export function selectBlocksManualEndTurn(
  state: CombatPresentationState
): boolean {
  return state.presentations.some(
    (record) =>
      !record.conflicted &&
      record.authority.kind === 'death-save' &&
      record.localPlayerOwned &&
      (record.responseAccepted || record.eventSource === 'live') &&
      (record.settlement === 'armed' || record.settlement === 'unresolved')
  );
}

export interface SettledDeathSave {
  readonly presentationId: string;
  readonly continuation: DeathSaveContinuation;
}

export function selectSettledDeathSave(
  state: CombatPresentationState
): SettledDeathSave | undefined {
  const current = selectCurrentPresentation(state);
  if (
    !current ||
    current.conflicted ||
    current.authority.kind !== 'death-save' ||
    !current.responseAccepted ||
    // Catch-up reports already-spent authority; revealing that projection
    // must not replay its provider-authored continuation mutation.
    current.eventSource === 'catchup' ||
    (current.settlement !== 'released' && current.settlement !== 'auto') ||
    !current.authority.deathSave
  ) {
    return undefined;
  }
  return Object.freeze({
    presentationId: current.authority.presentationId,
    continuation: current.authority.deathSave.continuation,
  });
}

export function deathSaveResponseFact(input: {
  session: string;
  member: string;
  response: DeathSaveResponse;
}): DeathSaveResponseFact {
  return Object.freeze({ type: 'death-save-response', ...input });
}
