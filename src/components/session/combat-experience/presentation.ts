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
  readonly order: number;
}

interface OtherStoryRecord {
  readonly key: string;
  readonly fact: CombatStoryFact;
  readonly order: number;
}

export interface CombatPresentationState {
  readonly viewerMember: string;
  readonly memberNames: Readonly<Record<string, string>>;
  readonly rollerRoles: Readonly<Record<string, RollerRole>>;
  readonly presentations: readonly CombatPresentationRecord[];
  readonly otherStory: readonly OtherStoryRecord[];
  readonly diceEvents: readonly DicePresentationEvent[];
  /** Typed raw stream formatting occurs before Story reconciliation. */
  readonly debug: readonly string[];
  readonly diagnostics: readonly string[];
  readonly nextOrder: number;
}

export interface EmptyPresentationConfig {
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
    viewerMember: config.viewerMember ?? '',
    memberNames: Object.freeze({ ...(config.memberNames ?? {}) }),
    rollerRoles: Object.freeze({ ...(config.rollerRoles ?? {}) }),
    presentations: Object.freeze([]),
    otherStory: Object.freeze([]),
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

function rollerRole(
  state: CombatPresentationState,
  attacker: string
): RollerRole | undefined {
  return (
    state.rollerRoles[attacker] ??
    (attacker === state.viewerMember ? 'player' : undefined)
  );
}

function createRequest(
  state: CombatPresentationState,
  authority: AuthoritySnapshot
): DicePresentationRequestedEvent | undefined {
  const presentationId = combatPresentationId(authority.session, authority.seq);
  const role = rollerRole(state, authority.attacker);
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

function appendDiceEvents(
  state: CombatPresentationState,
  ...events: readonly (DicePresentationEvent | undefined)[]
): readonly DicePresentationEvent[] {
  const next = events.filter(
    (event): event is DicePresentationEvent => event !== undefined
  );
  return next.length === 0
    ? state.diceEvents
    : Object.freeze([...state.diceEvents, ...next]);
}

function replacePresentation(
  state: CombatPresentationState,
  index: number,
  record: CombatPresentationRecord,
  diceEvents = state.diceEvents
): CombatPresentationState {
  const presentations = [...state.presentations];
  presentations[index] = Object.freeze(record);
  return Object.freeze({
    ...state,
    presentations: Object.freeze(presentations),
    diceEvents,
  });
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

function initialRecord(
  state: CombatPresentationState,
  authority: AuthoritySnapshot,
  options: {
    responseAccepted: boolean;
    event?: Event;
    source?: 'live' | 'catchup';
  }
): {
  record: CombatPresentationRecord;
  dice: readonly DicePresentationEvent[];
} {
  const request = createRequest(state, authority);
  const localActor = authority.attacker === state.viewerMember;
  const auto =
    options.event !== undefined &&
    (options.source === 'catchup' || !localActor);
  const release = request && auto ? createNeutralRelease(request) : undefined;
  const semanticFallback = request === undefined;
  // Local fallback remains explicitly armed: its result-free semantic release
  // preserves the same concealment boundary when no valid dice ID can exist.
  const settlement = auto ? 'auto' : 'armed';
  const presentationId = combatPresentationId(authority.session, authority.seq);
  const record: CombatPresentationRecord = Object.freeze({
    key: authorityKey(authority.session, authority.seq),
    presentationId,
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
    semanticFallback,
    locallyArmedResponse:
      options.responseAccepted && localActor && settlement === 'armed',
    order: state.nextOrder,
  });
  return {
    record,
    dice: Object.freeze(
      [request, release].filter(
        (event): event is DicePresentationEvent => event !== undefined
      )
    ),
  };
}

function acceptResponse(
  state: CombatPresentationState,
  fact: AttackResponseFact
): CombatPresentationState {
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
  const index = state.presentations.findIndex((record) => record.key === key);
  if (index < 0) {
    const { record, dice } = initialRecord(state, authority, {
      responseAccepted: true,
    });
    return Object.freeze({
      ...state,
      presentations: Object.freeze([...state.presentations, record]),
      diceEvents: Object.freeze([...state.diceEvents, ...dice]),
      nextOrder: state.nextOrder + 1,
    });
  }

  const current = state.presentations[index]!;
  if (!sameAuthority(current.authority, authority)) {
    return diagnose(
      state,
      `conflicting authority for ${key}; response ignored`
    );
  }
  if (current.responseAccepted) return state;
  return replacePresentation(state, index, {
    ...current,
    responseAccepted: true,
    locallyArmedResponse:
      current.locallyArmedResponse ||
      (authority.attacker === state.viewerMember &&
        current.settlement === 'armed'),
  });
}

function acceptAttackEvent(
  state: CombatPresentationState,
  fact: CombatStreamFact,
  authority: AuthoritySnapshot
): CombatPresentationState {
  const key = authorityKey(authority.session, authority.seq);
  const index = state.presentations.findIndex((record) => record.key === key);
  const event = snapshotEvent(fact.event);
  if (index < 0) {
    const { record, dice } = initialRecord(state, authority, {
      responseAccepted: false,
      event,
      source: fact.metadata.source,
    });
    return Object.freeze({
      ...state,
      presentations: Object.freeze([...state.presentations, record]),
      diceEvents: Object.freeze([...state.diceEvents, ...dice]),
      nextOrder: state.nextOrder + 1,
    });
  }

  const current = state.presentations[index]!;
  if (!sameAuthority(current.authority, authority)) {
    return diagnose(state, `conflicting authority for ${key}; event ignored`);
  }
  if (current.eventAccepted) return state;

  const localActor = authority.attacker === state.viewerMember;
  const preserveArmedResponse =
    localActor &&
    current.locallyArmedResponse &&
    current.settlement === 'armed';
  const shouldAuto =
    current.settlement === 'armed' &&
    (!localActor ||
      (fact.metadata.source === 'catchup' && !preserveArmedResponse));
  const release =
    shouldAuto && current.request
      ? createNeutralRelease(current.request)
      : current.release;
  const settlement = shouldAuto ? 'auto' : current.settlement;
  const diceEvents =
    release && release !== current.release
      ? appendDiceEvents(state, release)
      : state.diceEvents;

  return replacePresentation(
    state,
    index,
    {
      ...current,
      eventAccepted: true,
      event,
      eventSource: fact.metadata.source,
      release,
      settlement,
    },
    diceEvents
  );
}

function sameOtherEvent(first: Event, later: Event): boolean {
  return first.kind === later.kind && first.body.case === later.body.case;
}

function acceptOtherEvent(
  state: CombatPresentationState,
  fact: CombatStreamFact
): CombatPresentationState {
  const key = authorityKey(fact.event.session, fact.event.seq);
  const attackAtKey = state.presentations.find((record) => record.key === key);
  if (attackAtKey) {
    return diagnose(state, `conflicting non-attack event for ${key}; ignored`);
  }
  const existing = state.otherStory.find((record) => record.key === key);
  if (existing) {
    return sameOtherEvent(existing.fact.event, fact.event)
      ? state
      : diagnose(state, `conflicting typed event for ${key}; ignored`);
  }
  const event = snapshotEvent(fact.event);
  const record: OtherStoryRecord = Object.freeze({
    key,
    fact: Object.freeze({
      event,
      source: fact.metadata.source,
      visible: true,
    }),
    order: state.nextOrder,
  });
  return Object.freeze({
    ...state,
    otherStory: Object.freeze([...state.otherStory, record]),
    nextOrder: state.nextOrder + 1,
  });
}

function acceptStreamEvent(
  original: CombatPresentationState,
  fact: CombatStreamFact
): CombatPresentationState {
  const state = appendRawDebug(original, fact);
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
  if (fact.event.body.case === 'struck' || fact.event.body.case === 'missed') {
    return diagnose(state, 'attack event kind/body mismatch ignored');
  }
  return acceptOtherEvent(state, fact);
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
    !current.request ||
    current.authority.attacker !== state.viewerMember ||
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
    },
    appendDiceEvents(state, parsed)
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
  if (
    !current.semanticFallback ||
    current.authority.attacker !== state.viewerMember
  ) {
    return diagnose(state, 'ineligible semantic release ignored');
  }
  if (current.settlement !== 'armed') return state;
  return replacePresentation(state, index, {
    ...current,
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
  if (state.viewerMember !== fact.viewerMember) {
    return emptyPresentation(fact);
  }
  if (
    sameStringRecord(state.memberNames, fact.memberNames) &&
    sameStringRecord(state.rollerRoles, fact.rollerRoles)
  ) {
    return state;
  }
  return Object.freeze({
    ...state,
    memberNames: Object.freeze({ ...fact.memberNames }),
    rollerRoles: Object.freeze({ ...fact.rollerRoles }),
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
  return record.eventAccepted && record.settlement !== 'armed';
}

function orderedStoryFacts(state: CombatPresentationState): CombatStoryFact[] {
  const facts: {
    order: number;
    session: string;
    seq: bigint;
    fact: CombatStoryFact;
  }[] = [];
  for (const record of state.presentations) {
    if (!record.event || !record.eventSource) continue;
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
  const fact = orderedStoryFacts(state).at(-1);
  if (!fact || fact.source !== 'live' || !fact.visible) return null;
  const [entry] = buildCombatStory([fact], {
    viewerMember: state.viewerMember,
    memberNames: state.memberNames,
  });
  return entry ? `${entry.headline}. ${entry.detail}` : null;
}

export function selectCurrentPresentation(
  state: CombatPresentationState
): CombatPresentationRecord | undefined {
  let current: CombatPresentationRecord | undefined;
  for (const record of state.presentations) {
    if (
      !current ||
      (record.session === current.session
        ? record.seq > current.seq
        : record.order > current.order)
    ) {
      current = record;
    }
  }
  return current;
}

export function selectCurrentDiceEvents(
  state: CombatPresentationState
): readonly DicePresentationEvent[] {
  const current = selectCurrentPresentation(state);
  if (!current) return Object.freeze([]);
  return Object.freeze(
    [current.request, current.release].filter(
      (event): event is DicePresentationEvent => event !== undefined
    )
  );
}
