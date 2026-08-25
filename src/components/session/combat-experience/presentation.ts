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
import { clone } from '@bufbuild/protobuf';
import {
  EventKind,
  EventSchema,
  type Event,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import type { AttackResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import type { AttackRef } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { formatDebugLine } from '../debugLogLine';
import type { SessionEventDeliveryMetadata } from '../useSessionEventStream';
import {
  buildCombatAttackOutcome,
  buildCombatStory,
  type CombatStoryFact,
} from './story';
import type {
  CombatExperienceAttackOutcome,
  CombatExperienceStoryExchange,
} from './types';

export const COMBAT_D20_PRESET_ID = 'dice.original.carved.d20';

type RollerRole = 'player' | 'monster';
type AttackSnapshot = Readonly<Pick<AttackRef, 'ref' | 'name' | 'damageType'>>;

interface AuthoritySnapshot {
  readonly session: string;
  readonly seq: bigint;
  readonly attacker: string;
  readonly target: string;
  readonly roll: number;
  readonly total: number;
  readonly against: number;
  readonly hit: boolean;
  readonly critical: boolean;
  readonly damage: number;
  readonly attack?: AttackSnapshot;
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

export interface CombatStreamFact {
  readonly type: 'stream-event';
  readonly event: Event;
  readonly metadata: SessionEventDeliveryMetadata;
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

export type CombatPresentationFact =
  | CombatPresentationConfigFact
  | AttackResponseFact
  | CombatStreamFact
  | LocalDiceReleaseFact
  | SemanticDiceReleaseFact;

export interface CombatPresentationIdentity {
  readonly key: string;
  readonly category: 'attack' | 'other';
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
  readonly event?: Event;
  readonly eventSource?: 'live' | 'catchup';
  readonly request?: DicePresentationRequestedEvent;
  readonly release?: DicePresentationReleasedEvent;
  readonly settlement: 'armed' | 'released' | 'auto';
  readonly semanticFallback: boolean;
  readonly locallyArmedResponse: boolean;
  readonly conflicted: boolean;
  readonly order: number;
}

export interface OtherStoryRecord {
  readonly key: string;
  readonly fact: CombatStoryFact;
  readonly relevantFacts: string;
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
  readonly debug: readonly string[];
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
    diagnostics: Object.freeze([]),
    nextOrder: 0,
  });
}

function authorityKey(session: string, seq: bigint): string {
  return `${session.length}:${session}:${seq}`;
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
  return freezeRecord({
    session: fact.session,
    seq: response.seq,
    attacker: fact.attacker,
    target: fact.target,
    roll: response.roll,
    total: response.total,
    against: response.against,
    hit: response.hit,
    critical: response.critical,
    damage: response.damage,
    attack: attackSnapshot(response.attack),
  });
}

function authorityFromEvent(event: Event): AuthoritySnapshot | undefined {
  if (event.body.case === 'struck' && event.kind === EventKind.STRUCK) {
    const struck = event.body.value;
    return freezeRecord({
      session: event.session,
      seq: event.seq,
      attacker: struck.attacker,
      target: struck.target,
      roll: struck.roll,
      total: struck.total,
      against: struck.against,
      hit: true,
      critical: struck.critical,
      damage: struck.damage,
      attack: attackSnapshot(struck.attack),
    });
  }
  if (event.body.case === 'missed' && event.kind === EventKind.MISSED) {
    const missed = event.body.value;
    return freezeRecord({
      session: event.session,
      seq: event.seq,
      attacker: missed.attacker,
      target: missed.target,
      roll: missed.roll,
      total: missed.total,
      against: missed.against,
      hit: false,
      critical: false,
      damage: 0,
      attack: attackSnapshot(missed.attack),
    });
  }
  return undefined;
}

function sameAttack(
  first: AttackSnapshot | undefined,
  later: AttackSnapshot | undefined
): boolean {
  if (!first || !later) return first === later;
  return (
    first.ref === later.ref &&
    first.name === later.name &&
    first.damageType === later.damageType
  );
}

function sameAuthority(
  first: AuthoritySnapshot,
  later: AuthoritySnapshot
): boolean {
  return (
    first.session === later.session &&
    first.seq === later.seq &&
    first.attacker === later.attacker &&
    first.target === later.target &&
    first.roll === later.roll &&
    first.total === later.total &&
    first.against === later.against &&
    first.hit === later.hit &&
    first.critical === later.critical &&
    first.damage === later.damage &&
    sameAttack(first.attack, later.attack)
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

/** Exact authoritative identity; unsafe wire strings get no dice identifier. */
export function combatPresentationId(
  session: string,
  seq: bigint
): string | undefined {
  if (!session || seq < 0n) return undefined;
  const id = `session:${session}:${seq}`;
  return isDicePresentationIdentifier(id) ? id : undefined;
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
  const presentationId = combatPresentationId(authority.session, authority.seq);
  const role = state.rollerRoles[authority.attacker];
  if (
    !presentationId ||
    !role ||
    !isDicePresentationIdentifier(authority.attacker) ||
    !Number.isInteger(authority.roll) ||
    authority.roll < 1 ||
    authority.roll > 20
  ) {
    return undefined;
  }
  return Object.freeze({
    schemaVersion: 1,
    type: 'dice-presentation-requested',
    eventId: eventId('request', presentationId),
    presentationId,
    roller: Object.freeze({ entityId: authority.attacker, role }),
    die: Object.freeze({
      kind: 'd20',
      presetId: COMBAT_D20_PRESET_ID,
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

function snapshotEvent(event: Event): Event {
  return deepFreeze(clone(EventSchema, event));
}

function diceEventsFor(
  presentations: readonly CombatPresentationRecord[]
): readonly DicePresentationEvent[] {
  const events: DicePresentationEvent[] = [];
  for (const record of [...presentations].sort(
    (left, right) => left.order - right.order
  )) {
    if (record.conflicted) continue;
    if (record.request) events.push(record.request);
    if (record.release) events.push(record.release);
  }
  return Object.freeze(events);
}

function diagnose(
  state: CombatPresentationState,
  message: string
): CombatPresentationState {
  const diagnostic = `combat-presentation: ${message}`;
  return Object.freeze({
    ...state,
    diagnostics: Object.freeze([...state.diagnostics, diagnostic]),
    debug: Object.freeze([...state.debug, diagnostic]),
  });
}

function appendRawDebug(
  state: CombatPresentationState,
  fact: CombatStreamFact
): CombatPresentationState {
  let text: string;
  try {
    const names = new Map(Object.entries(state.memberNames));
    text = `${formatDebugLine(fact.event, names).text} source=${fact.metadata.source}`;
  } catch (error) {
    text = `raw event formatting failed: ${error instanceof Error ? error.message : String(error)} source=${fact.metadata.source}`;
  }
  return Object.freeze({
    ...state,
    debug: Object.freeze([...state.debug, text]),
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

function initialRecord(
  state: CombatPresentationState,
  authority: AuthoritySnapshot,
  options: {
    responseAccepted: boolean;
    event?: Event;
    source?: 'live' | 'catchup';
  }
): { record: CombatPresentationRecord; pending: boolean } {
  const request = createRequest(state, authority);
  const roleKnown = state.rollerRoles[authority.attacker] !== undefined;
  const localPlayer = isAuthoritativeLocalPlayer(state, authority.attacker);
  const pending =
    localPlayer &&
    !(options.event !== undefined && options.source === 'catchup');
  const settlement = pending ? ('armed' as const) : ('auto' as const);
  const release =
    request && !pending ? createNeutralRelease(request) : undefined;
  return {
    record: Object.freeze({
      key: authorityKey(authority.session, authority.seq),
      presentationId: combatPresentationId(authority.session, authority.seq),
      session: authority.session,
      seq: authority.seq,
      authority,
      responseAccepted: options.responseAccepted,
      eventAccepted: options.event !== undefined,
      event: options.event,
      eventSource: options.source,
      request,
      release,
      settlement,
      semanticFallback: roleKnown && request === undefined,
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
    event?: Event;
    source?: 'live' | 'catchup';
  }
): CombatPresentationState {
  const key = authorityKey(authority.session, authority.seq);
  const { record, pending } = initialRecord(state, authority, options);
  const presentations = Object.freeze([...state.presentations, record]);
  return Object.freeze({
    ...state,
    identities: addIdentity(state, key, 'attack'),
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
  fact: AttackResponseFact
): CombatPresentationState {
  if (!inSession(state, fact.session)) {
    return diagnose(state, `response outside session ${state.session} ignored`);
  }
  let authority: AuthoritySnapshot;
  try {
    authority = authorityFromResponse(fact);
  } catch (error) {
    return diagnose(
      state,
      `rejected attack response: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const key = authorityKey(authority.session, authority.seq);
  const identity = identityAt(state, key);
  if (!identity) {
    return addAttackRecord(state, authority, { responseAccepted: true });
  }
  if (identity.category !== 'attack') {
    return markConflicted(
      state,
      key,
      `attack response conflicts with typed Story for ${key}`
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
  return replacePresentation(state, index, {
    ...current,
    responseAccepted: true,
    locallyArmedResponse:
      !current.conflicted &&
      current.settlement === 'armed' &&
      state.pendingLocalKeys.includes(key),
  });
}

function settleCatchupDuplicate(
  state: CombatPresentationState,
  index: number,
  source: 'live' | 'catchup'
): CombatPresentationState {
  const current = state.presentations[index]!;
  if (
    source !== 'catchup' ||
    current.conflicted ||
    current.settlement !== 'armed' ||
    state.pendingLocalKeys.includes(current.key)
  ) {
    return state;
  }
  const release = current.request
    ? createNeutralRelease(current.request)
    : undefined;
  return replacePresentation(state, index, {
    ...current,
    release,
    settlement: 'auto',
    locallyArmedResponse: false,
  });
}

function acceptAttackEvent(
  state: CombatPresentationState,
  fact: CombatStreamFact,
  authority: AuthoritySnapshot
): CombatPresentationState {
  const key = authorityKey(authority.session, authority.seq);
  const identity = identityAt(state, key);
  const event = snapshotEvent(fact.event);
  if (!identity) {
    return addAttackRecord(state, authority, {
      responseAccepted: false,
      event,
      source: fact.metadata.source,
    });
  }
  if (identity.category !== 'attack') {
    return markConflicted(
      state,
      key,
      `attack event conflicts with typed Story for ${key}`
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
      `conflicting authority for ${key}; event rejected`
    );
  }
  if (current.eventAccepted) {
    return settleCatchupDuplicate(state, index, fact.metadata.source);
  }

  const pending = state.pendingLocalKeys.includes(key);
  const settlement = pending ? 'armed' : current.settlement;
  const release =
    settlement === 'armed' || !current.request
      ? current.release
      : (current.release ?? createNeutralRelease(current.request));
  return replacePresentation(state, index, {
    ...current,
    eventAccepted: true,
    event,
    eventSource: fact.metadata.source,
    release,
    settlement,
    locallyArmedResponse:
      current.responseAccepted && pending && settlement === 'armed',
  });
}

type RelevantOtherEvent = Readonly<Record<string, unknown>>;

const EXPECTED_OTHER_KIND = {
  turnEnded: EventKind.TURN_ENDED,
  downed: EventKind.DOWNED,
  fightStarted: EventKind.FIGHT_STARTED,
  fightEnded: EventKind.FIGHT_ENDED,
  moved: EventKind.MOVED,
  joined: EventKind.JOINED,
  exited: EventKind.EXITED,
  ended: EventKind.ENDED,
  door: EventKind.DOOR,
} as const;

const TYPED_EVENT_KINDS = new Set<number>([
  EventKind.TURN_ENDED,
  EventKind.DOWNED,
  EventKind.FIGHT_STARTED,
  EventKind.FIGHT_ENDED,
  EventKind.MOVED,
  EventKind.JOINED,
  EventKind.EXITED,
  EventKind.ENDED,
  EventKind.DOOR,
  EventKind.STRUCK,
  EventKind.MISSED,
]);

function relevantOtherEvent(event: Event): RelevantOtherEvent | undefined {
  const bodyCase = event.body.case;
  if (bodyCase === undefined) {
    if (TYPED_EVENT_KINDS.has(event.kind)) return undefined;
    return Object.freeze({ kind: event.kind, bodyCase: 'none' });
  }
  if (bodyCase === 'struck' || bodyCase === 'missed') return undefined;
  if (event.kind !== EXPECTED_OTHER_KIND[bodyCase]) return undefined;

  switch (bodyCase) {
    case 'turnEnded':
      return Object.freeze({
        kind: event.kind,
        bodyCase,
        member: event.body.value.member,
        next: event.body.value.next,
      });
    case 'downed':
      return Object.freeze({
        kind: event.kind,
        bodyCase,
        member: event.body.value.member,
      });
    case 'fightStarted':
      return Object.freeze({
        kind: event.kind,
        bodyCase,
        members: Object.freeze([...event.body.value.members]),
      });
    case 'fightEnded':
      return Object.freeze({
        kind: event.kind,
        bodyCase,
        cause: event.body.value.cause,
      });
    case 'moved':
      return Object.freeze({
        kind: event.kind,
        bodyCase,
        member: event.body.value.member,
        to: event.body.value.to
          ? Object.freeze({
              x: event.body.value.to.x,
              y: event.body.value.to.y,
            })
          : null,
      });
    case 'joined':
    case 'exited':
      return Object.freeze({
        kind: event.kind,
        bodyCase,
        member: event.body.value.member,
      });
    case 'ended':
      return Object.freeze({
        kind: event.kind,
        bodyCase,
        ending: event.body.value.ending,
      });
    case 'door':
      return Object.freeze({
        kind: event.kind,
        bodyCase,
        door: event.body.value.door,
        state: event.body.value.state,
        actor: event.body.value.actor,
        dc: event.body.value.dc,
        total: event.body.value.total,
        beaten: event.body.value.beaten,
      });
  }
}

function acceptOtherEvent(
  state: CombatPresentationState,
  fact: CombatStreamFact,
  relevantFacts: RelevantOtherEvent
): CombatPresentationState {
  const key = authorityKey(fact.event.session, fact.event.seq);
  const factsIdentity = JSON.stringify(relevantFacts);
  const identity = identityAt(state, key);
  if (identity) {
    if (identity.category !== 'other') {
      return markConflicted(
        state,
        key,
        `typed Story conflicts with attack for ${key}`
      );
    }
    const existing = state.otherStory.find((record) => record.key === key);
    if (!existing || existing.relevantFacts !== factsIdentity) {
      return markConflicted(state, key, `conflicting typed facts for ${key}`);
    }
    return state;
  }

  const event = snapshotEvent(fact.event);
  const record: OtherStoryRecord = Object.freeze({
    key,
    fact: Object.freeze({
      event,
      source: fact.metadata.source,
      visible: true,
    }),
    relevantFacts: factsIdentity,
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

function acceptStreamEvent(
  original: CombatPresentationState,
  fact: CombatStreamFact
): CombatPresentationState {
  const state = appendRawDebug(original, fact);
  if (!inSession(state, fact.event.session)) {
    return diagnose(state, `event outside session ${state.session} ignored`);
  }
  let authority: AuthoritySnapshot | undefined;
  try {
    authority = authorityFromEvent(fact.event);
  } catch (error) {
    return diagnose(
      state,
      `rejected typed event: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (authority) return acceptAttackEvent(state, fact, authority);

  const relevantFacts = relevantOtherEvent(fact.event);
  if (!relevantFacts) {
    return diagnose(state, 'typed event kind/body mismatch ignored');
  }
  return acceptOtherEvent(state, fact, relevantFacts);
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
    return JSON.stringify(current.release) === JSON.stringify(parsed)
      ? state
      : diagnose(state, `conflicting release for ${parsed.presentationId}`);
  }
  if (
    current.conflicted ||
    state.pendingLocalKeys[0] !== current.key ||
    !isAuthoritativeLocalPlayer(state, current.authority.attacker) ||
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
    !isAuthoritativeLocalPlayer(state, current.authority.attacker) ||
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
  const previouslyPending = new Set(state.pendingLocalKeys);
  const eligiblePending = new Set<string>();
  const presentations = state.presentations.map((record) => {
    if (record.conflicted) return record;

    const request = createRequest(configured, record.authority);
    const roleKnown =
      configured.rollerRoles[record.authority.attacker] !== undefined;
    const localPlayer = isAuthoritativeLocalPlayer(
      configured,
      record.authority.attacker
    );
    const outcomeExposed =
      record.eventAccepted && record.settlement !== 'armed';
    const pending =
      localPlayer &&
      record.settlement !== 'released' &&
      !outcomeExposed &&
      (previouslyPending.has(record.key) || !record.eventAccepted);
    if (pending) eligiblePending.add(record.key);

    const settlement = pending
      ? ('armed' as const)
      : localPlayer && record.settlement === 'released'
        ? ('released' as const)
        : ('auto' as const);
    const release =
      request && settlement !== 'armed'
        ? isReleaseCompatible(request, record.release) &&
          settlement === 'released'
          ? record.release
          : createNeutralRelease(request)
        : undefined;
    return Object.freeze({
      ...record,
      request,
      release,
      settlement,
      semanticFallback: roleKnown && request === undefined,
      locallyArmedResponse: record.responseAccepted && pending,
    });
  });

  const pendingLocalKeys = state.pendingLocalKeys.filter((key) =>
    eligiblePending.has(key)
  );
  for (const record of [...presentations].sort(
    (left, right) => left.order - right.order
  )) {
    if (
      eligiblePending.has(record.key) &&
      !pendingLocalKeys.includes(record.key)
    ) {
      pendingLocalKeys.push(record.key);
    }
  }

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
      return acceptResponse(state, fact);
    case 'stream-event':
      return acceptStreamEvent(state, fact);
    case 'local-release':
      return acceptLocalRelease(state, fact);
    case 'semantic-release':
      return acceptSemanticRelease(state, fact);
  }
}

function isVisible(record: CombatPresentationRecord): boolean {
  return (
    !record.conflicted && record.eventAccepted && record.settlement !== 'armed'
  );
}

function orderedStoryFacts(state: CombatPresentationState): CombatStoryFact[] {
  const facts: {
    order: number;
    session: string;
    seq: bigint;
    fact: CombatStoryFact;
  }[] = [];
  for (const record of state.presentations) {
    if (record.conflicted || !record.event || !record.eventSource) continue;
    facts.push({
      order: record.order,
      session: record.session,
      seq: record.seq,
      fact: {
        event: record.event,
        source: record.eventSource,
        visible: isVisible(record),
      },
    });
  }
  for (const record of state.otherStory) {
    if (record.conflicted) continue;
    facts.push({
      order: record.order,
      session: record.fact.event.session,
      seq: record.fact.event.seq,
      fact: record.fact,
    });
  }
  facts.sort((left, right) => {
    if (left.session !== right.session) return left.order - right.order;
    if (left.seq < right.seq) return -1;
    if (left.seq > right.seq) return 1;
    return left.order - right.order;
  });
  return facts.map(({ fact }) => fact);
}

export function selectVisibleStory(
  state: CombatPresentationState
): readonly CombatExperienceStoryExchange[] {
  return buildCombatStory(orderedStoryFacts(state), {
    viewerMember: state.viewerMember,
    memberNames: state.memberNames,
  });
}

export function selectVisibleResult(
  state: CombatPresentationState
): CombatExperienceAttackOutcome | undefined {
  const record = selectCurrentPresentation(state);
  if (!record?.event || !isVisible(record)) return undefined;
  return buildCombatAttackOutcome(record.event, {
    viewerMember: state.viewerMember,
    memberNames: state.memberNames,
  });
}

export function selectLiveAnnouncement(
  state: CombatPresentationState
): string | null {
  const current = selectCurrentPresentation(state);
  if (current?.conflicted) return null;
  const fact = orderedStoryFacts(state).at(-1);
  if (!fact || fact.source !== 'live' || !fact.visible) return null;
  const [entry] = buildCombatStory([fact], {
    viewerMember: state.viewerMember,
    memberNames: state.memberNames,
  });
  return entry ? `${entry.headline}. ${entry.detail}` : null;
}

function isAuthoritativelyNewer(
  candidate: CombatPresentationRecord,
  current: CombatPresentationRecord
): boolean {
  return candidate.session === current.session
    ? candidate.seq > current.seq
    : candidate.order > current.order;
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
