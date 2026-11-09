import {
  formatRecordJSON,
  isRecordObject,
  parseRecordJSON,
} from '../recordCapture';
import type { RecordRow } from '../recordFeed';

export interface MachineTransitionSymbol {
  on: string;
  to?: string;
  reason?: string;
  when?: unknown;
  do?: readonly unknown[];
}
export interface MachineStateSymbol {
  terminal?: boolean;
  transitions: readonly MachineTransitionSymbol[];
}
export interface BehaviorInstanceSymbol {
  id: string;
  recipe: {
    ref: string;
    initial: string;
    states: Readonly<Record<string, MachineStateSymbol>>;
  };
  table: Readonly<Record<string, unknown>>;
  raw: Readonly<Record<string, unknown>>;
}
export interface BehaviorConfiguration {
  id: string;
  bodyInstance: string;
  instances: readonly BehaviorInstanceSymbol[];
  raw: Readonly<Record<string, unknown>>;
}
export interface BehaviorSymbolIndex {
  configurations: ReadonlyMap<string, BehaviorConfiguration>;
  problems: ReadonlyMap<string, string>;
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function required(value: unknown, name: string): string {
  const result = string(value);
  if (!result) throw new Error(`Configuration is missing ${name}.`);
  return result;
}

// Validate the captured shape, never the truth of a guard or its legality in
// a game. Missing operands are unavailable symbols, not implicit null/false.
function checkGuardShape(value: unknown): void {
  if (value === undefined || value === null) return;
  if (!isRecordObject(value)) throw new Error('Invalid guard symbols.');
  for (const key of ['all', 'any']) {
    if (value[key] !== undefined) {
      if (!Array.isArray(value[key]))
        throw new Error('Invalid guard children.');
      value[key].forEach(checkGuardShape);
      return;
    }
  }
  if (value.not !== undefined) {
    checkGuardShape(value.not);
    return;
  }
  if (value.fact !== undefined) {
    if (
      !isRecordObject(value.fact) ||
      !string(value.fact.name) ||
      !string(value.fact.op) ||
      !Object.hasOwn(value.fact, 'value')
    )
      throw new Error('Invalid fact guard symbols: operand unavailable.');
    return;
  }
  if (typeof value.flag === 'string' && value.flag) return;
  if (isRecordObject(value.scope)) return;
  if (
    isRecordObject(value.rounds) &&
    string(value.rounds.op) &&
    Object.hasOwn(value.rounds, 'n')
  )
    return;
  throw new Error('Unsupported guard symbol shape.');
}

function configurationOf(
  fields: Readonly<Record<string, unknown>>
): BehaviorConfiguration {
  if (fields.schema !== 1)
    throw new Error('Unsupported behavior symbol schema.');
  const id = required(fields.config, 'identity');
  const raw = fields.configuration;
  if (!isRecordObject(raw) || !Array.isArray(raw.Instances))
    throw new Error('Invalid bound configuration.');
  const ids = new Set<string>();
  const instances = raw.Instances.map((bound) => {
    if (!isRecordObject(bound) || !isRecordObject(bound.Instance))
      throw new Error('Invalid behavior attachment.');
    const instance = bound.Instance;
    const instanceID = required(instance.id, 'attachment identity');
    if (ids.has(instanceID)) throw new Error('Duplicate attachment identity.');
    ids.add(instanceID);
    const recipe = instance.recipe;
    if (
      !isRecordObject(recipe) ||
      !isRecordObject(recipe.states) ||
      !isRecordObject(instance.table)
    )
      throw new Error('Invalid recipe or table symbols.');
    const states = Object.fromEntries(
      Object.entries(recipe.states).map(([name, value]) => {
        if (
          !isRecordObject(value) ||
          (value.transitions !== undefined && !Array.isArray(value.transitions))
        )
          throw new Error(`Invalid state ${name}.`);
        const transitions = (value.transitions ?? []).map(
          (transition: unknown) => {
            if (
              !isRecordObject(transition) ||
              typeof transition.on !== 'string'
            )
              throw new Error(`Invalid transition in ${name}.`);
            checkGuardShape(transition.when);
            return transition as unknown as MachineTransitionSymbol;
          }
        );
        return [name, { terminal: value.terminal === true, transitions }];
      })
    );
    const initial = required(recipe.initial, 'initial state');
    if (!Object.hasOwn(states, initial))
      throw new Error('Initial state is absent from the symbols.');
    return {
      id: instanceID,
      recipe: { ref: required(recipe.ref, 'definition ref'), initial, states },
      table: instance.table,
      raw: bound,
    };
  });
  return { id, bodyInstance: string(raw.BodyInstance), instances, raw };
}

function configurationKey(config: BehaviorConfiguration): string {
  return formatRecordJSON(parseRecordJSON(formatRecordJSON(config.raw)));
}

/** Config IDs are immutable: two meanings poison that identity rather than
 * silently replacing the original definition with the newest packet. */
export function behaviorSymbolsOf(
  rows: readonly RecordRow[]
): BehaviorSymbolIndex {
  const configurations = new Map<string, BehaviorConfiguration>();
  const problems = new Map<string, string>();
  for (const row of rows) {
    if (row.beat !== 'behavior_config') continue;
    const id = string(row.fields?.config) || row.id;
    if (problems.has(id)) continue;
    try {
      if (row.fieldsUnavailable) throw new Error(row.fieldsUnavailable);
      if (!row.fields) throw new Error('Configuration fields unavailable.');
      const config = configurationOf(row.fields);
      const prior = configurations.get(config.id);
      if (prior && configurationKey(prior) !== configurationKey(config))
        throw new Error('Conflicting symbols for one configuration identity.');
      configurations.set(config.id, config);
    } catch (error) {
      configurations.delete(id);
      problems.set(id, error instanceof Error ? error.message : String(error));
    }
  }
  return { configurations, problems };
}

export interface GuardReading {
  label: string;
  status: 'matched' | 'rejected' | 'unknown' | 'not evaluated' | 'unavailable';
  reason: string;
  observed?: string;
  children: readonly GuardReading[];
}

function guardLabel(symbol: unknown): string {
  if (symbol === undefined || symbol === null) return 'always';
  if (!isRecordObject(symbol)) return 'invalid guard symbols';
  if (Array.isArray(symbol.all)) return 'all';
  if (Array.isArray(symbol.any)) return 'any';
  if (symbol.not !== undefined) return 'not';
  if (isRecordObject(symbol.fact))
    return `${string(symbol.fact.name)} ${string(symbol.fact.op)} ${formatRecordJSON(symbol.fact.value)}`;
  if (typeof symbol.flag === 'string') return `flag ${symbol.flag}`;
  if (isRecordObject(symbol.scope))
    return `scope ${formatRecordJSON(symbol.scope)}`;
  if (isRecordObject(symbol.rounds))
    return `elapsed rounds ${string(symbol.rounds.op)} ${formatRecordJSON(symbol.rounds.n)}`;
  return formatRecordJSON(symbol);
}

/** Render recorded verdicts only. A skipped ancestor explicitly means its
 * subtree was not visited; a missing trace under an evaluated node is missing
 * evidence, not an invented false result. */
export function readGuardTrace(input: {
  symbol: unknown;
  trace: unknown;
  notEvaluated?: boolean;
}): GuardReading {
  const trace = isRecordObject(input.trace) ? input.trace : undefined;
  let status: GuardReading['status'] = 'unavailable';
  if (input.notEvaluated || trace?.evaluated === false)
    status = 'not evaluated';
  else if (trace?.evaluated === true) {
    if (trace.verdict === 'applies') status = 'matched';
    if (trace.verdict === 'does not apply') status = 'rejected';
    if (trace.verdict === 'depends') status = 'unknown';
  }
  const symbol = isRecordObject(input.symbol) ? input.symbol : undefined;
  const children = Array.isArray(symbol?.all)
    ? symbol.all
    : Array.isArray(symbol?.any)
      ? symbol.any
      : symbol?.not !== undefined
        ? [symbol.not]
        : [];
  const tracedChildren = Array.isArray(trace?.children) ? trace.children : [];
  let observed: string | undefined;
  if (status !== 'not evaluated' && trace?.read === true) {
    if (trace.known !== true) observed = 'unknown';
    else if (trace.scalar !== true)
      observed = 'known value is not representable';
    else if (!Object.hasOwn(trace, 'value') || !capturedScalar(trace.value)) {
      status = 'unavailable';
      observed = 'captured scalar unavailable';
    } else observed = formatRecordJSON(trace.value);
  }
  return {
    label: guardLabel(input.symbol),
    status,
    reason: string(trace?.reason),
    observed,
    children: children.map((child, index) =>
      readGuardTrace({
        symbol: child,
        trace: tracedChildren[index],
        notEvaluated: status === 'not evaluated',
      })
    ),
  };
}

function capturedScalar(value: unknown): boolean {
  return (
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    typeof value === 'bigint' ||
    (typeof value === 'number' && Number.isSafeInteger(value))
  );
}

function unavailableGuard(guard: GuardReading): boolean {
  return (
    guard.status === 'unavailable' || guard.children.some(unavailableGuard)
  );
}

export interface TransitionReading {
  index: number;
  on: string;
  to: string;
  chosen: boolean;
  guard: GuardReading;
  acts: readonly unknown[];
}
export interface RoleReading {
  id: string;
  ref: string;
  before: string;
  after: string;
  proposedAfter: string;
  status: string;
  requested: string;
  transitions: readonly TransitionReading[];
  table: unknown;
}
export interface BehaviorReading {
  kind: 'configuration' | 'decision' | 'work';
  title: string;
  configuration?: BehaviorConfiguration;
  warnings: string[];
  roles: RoleReading[];
  pick?: RecordRow;
  inlinePick?: Readonly<Record<string, unknown>>;
  work?: {
    status: string;
    instance: string;
    key: string;
    goal: unknown;
    decisionRecord: string;
    reason: string;
  };
}

/** Read the actual configuration/decision/work record. The caller supplies only
 * captured context: there is intentionally no API/source fetch or rule reader. */
export function readBehaviorTrace(input: {
  row: RecordRow;
  symbols: BehaviorSymbolIndex;
  records: ReadonlyMap<string, RecordRow>;
}): BehaviorReading | undefined {
  const { row, symbols, records } = input;
  if (
    !['behavior_config', 'behavior_decision', 'behavior_work'].includes(
      row.beat
    )
  )
    return undefined;
  const fields = row.fields;
  const kind =
    row.beat === 'behavior_config'
      ? 'configuration'
      : row.beat === 'behavior_work'
        ? 'work'
        : 'decision';
  const out: BehaviorReading = {
    kind,
    title: `${string(fields?.member)} · ${kind}`,
    warnings: [],
    roles: [],
  };
  if (row.fieldsUnavailable) {
    out.warnings.push(row.fieldsUnavailable);
    return out;
  }
  if (!fields || fields.schema !== 1) {
    out.warnings.push('Unsupported or unavailable behavior record schema.');
    return out;
  }
  const configID = string(fields.config);
  out.configuration = symbols.configurations.get(configID);
  if (!out.configuration)
    out.warnings.push(
      symbols.problems.get(configID) ??
        `Configuration ${configID || '(unnamed)'} unavailable; no current source is substituted.`
    );
  if (kind === 'configuration') return out;
  if (kind === 'work') {
    const work = isRecordObject(fields.work) ? fields.work : {};
    out.work = {
      status: string(fields.status),
      instance: string(work.instance),
      key: string(work.key),
      goal: work.goal,
      decisionRecord: string(fields.decision_record),
      reason: string(fields.reason),
    };
    out.title = `${string(fields.member)} · execution ${out.work.status}`;
    if (!out.work.decisionRecord || !records.has(out.work.decisionRecord))
      out.warnings.push(
        'Original decision is outside the available record window.'
      );
    return out;
  }
  out.title = `${string(fields.member)} · ${string(fields.operation)} · ${string(fields.on)}`;
  if (fields.operation === 'driver')
    out.title += ' · ordinary machine not evaluated';
  if (!Array.isArray(fields.outcomes)) {
    out.warnings.push('Role outcomes unavailable.');
    return out;
  }
  for (const value of fields.outcomes) {
    if (
      !isRecordObject(value) ||
      typeof value.id !== 'string' ||
      typeof value.selected !== 'boolean' ||
      typeof value.committed !== 'boolean'
    ) {
      out.warnings.push('Malformed role outcome.');
      continue;
    }
    const symbol = out.configuration?.instances.find(
      (instance) => instance.id === value.id
    );
    const before = string(value.before);
    const step = isRecordObject(value.step) ? value.step : undefined;
    const skipped = string(value.skipped);
    const requested = string(value.requested);
    const status = skipped
      ? `not delivered: ${skipped}`
      : value.selected
        ? `selected; ${value.committed ? 'committed' : 'not committed'}`
        : requested
          ? 'requested; not selected (deferred)'
          : `observed; ${value.committed ? 'committed' : 'not committed'}`;
    const state =
      symbol && Object.hasOwn(symbol.recipe.states, before)
        ? symbol.recipe.states[before]
        : undefined;
    if (symbol && !state)
      out.warnings.push(`State ${before} is not described for ${value.id}.`);
    const traces = Array.isArray(step?.transitions) ? step.transitions : [];
    const transitions = (state?.transitions ?? []).map((transition, index) => {
      const trace = traces.find((t) => isRecordObject(t) && t.index === index);
      return {
        index,
        on: transition.on,
        to: transition.to ?? '',
        chosen: isRecordObject(trace) && trace.selected === true,
        guard: readGuardTrace({
          symbol: transition.when,
          trace: isRecordObject(trace) ? trace.guard : undefined,
          notEvaluated: !!skipped,
        }),
        acts: transition.do ?? [],
      };
    });
    if (transitions.some((transition) => unavailableGuard(transition.guard))) {
      out.warnings.push(
        `Captured observation unavailable for role ${value.id}; trace is incomplete.`
      );
    }
    out.roles.push({
      id: value.id,
      ref: symbol?.recipe.ref ?? '',
      before,
      after: string(value.after),
      proposedAfter: string(step?.after),
      status,
      requested,
      transitions,
      table: requested ? symbol?.table[requested] : undefined,
    });
  }
  const pickID = string(fields.pick_record);
  if (pickID) {
    const picked = records.get(pickID);
    if (picked?.fieldsUnavailable) out.warnings.push(picked.fieldsUnavailable);
    else if (picked?.beat === 'answered') out.pick = picked;
    else
      out.warnings.push(
        'Picker record unavailable; no weights or roll are reconstructed.'
      );
  }
  if (isRecordObject(fields.selection)) out.inlinePick = fields.selection;
  return out;
}
