import { parseRef } from '@/utils/refs';

export const PROP_CALIBRATION_STORAGE_KEY = 'rpg.prop-calibration.batch.v1';

export interface CalibrationSource {
  packSlug: string;
  packVersion: string;
  sourcePath: string;
  glbSha256: string;
}

export interface CalibrationCandidate {
  source: CalibrationSource;
  url: string;
}

export interface CalibrationCatalog {
  schemaVersion: 1;
  candidates: CalibrationCandidate[];
}

export type PropRole = 'obstacle' | 'cover' | 'decor';

export interface CalibrationEntry {
  source: CalibrationSource;
  /** Local-only URL supplied by the preparation catalog; never exported. */
  url?: string;
  displayName: string;
  familyRef: string;
  ref: string;
  defaultForFamily: boolean;
  calibration: {
    scale: number;
    yawDegrees: number;
    fineOffsetMeters: [number, number, number];
  };
  placement: 'floor';
  role: PropRole;
  themes: string[];
  blocksMovement: boolean;
  blocksLoS: boolean;
  notes: string;
}

export interface CalibrationBatch {
  schemaVersion: 1;
  batchId: string;
  entries: CalibrationEntry[];
}

export interface PropCalibrationState {
  batch: CalibrationBatch;
  selectedIndex: number;
}

export type PropCalibrationAction =
  | { type: 'select'; index: number }
  | { type: 'replace-entry'; index: number; entry: CalibrationEntry }
  | { type: 'replace-batch'; batch: CalibrationBatch };

export type FieldErrors = Record<string, string>;

const SEGMENT = /^[A-Za-z0-9_-]+$/;
const SHA256 = /^[a-f0-9]{64}$/;
const BATCH_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const CANDIDATE_URL =
  /^\/models\/synty\/prop-calibration\/[A-Za-z0-9_.-]+\.glb$/;

function fail(message: string): never {
  throw new Error(message);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string
): void {
  const allowed = new Set(expected);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label}: unknown field ${key}`);
  }
  for (const key of expected) {
    if (!(key in value)) fail(`${label}: missing field ${key}`);
  }
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label} must be a string`);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label} must be a boolean`);
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== 'number') fail(`${label} must be a number`);
  return value;
}

function parseSource(value: unknown, label: string): CalibrationSource {
  const raw = object(value, label);
  exactKeys(raw, ['packSlug', 'packVersion', 'sourcePath', 'glbSha256'], label);
  return {
    packSlug: string(raw.packSlug, `${label}.packSlug`),
    packVersion: string(raw.packVersion, `${label}.packVersion`),
    sourcePath: string(raw.sourcePath, `${label}.sourcePath`),
    glbSha256: string(raw.glbSha256, `${label}.glbSha256`),
  };
}

function parseCandidate(value: unknown, index: number): CalibrationCandidate {
  const label = `candidates[${index}]`;
  const raw = object(value, label);
  exactKeys(raw, ['source', 'url'], label);
  const url = string(raw.url, `${label}.url`);
  if (!CANDIDATE_URL.test(url)) fail(`${label}: invalid candidate URL`);
  const source = parseSource(raw.source, `${label}.source`);
  if (!SHA256.test(source.glbSha256)) fail(`${label}: invalid GLB SHA-256`);
  return { source, url };
}

export function parseCalibrationCatalog(value: unknown): CalibrationCatalog {
  const raw = object(value, 'catalog');
  exactKeys(raw, ['schemaVersion', 'candidates'], 'catalog');
  if (raw.schemaVersion !== 1) fail('catalog.schemaVersion must be 1');
  if (!Array.isArray(raw.candidates))
    fail('catalog.candidates must be an array');
  return {
    schemaVersion: 1,
    candidates: raw.candidates.map(parseCandidate),
  };
}

export function entryFromCandidate(
  candidate: CalibrationCandidate
): CalibrationEntry {
  return {
    source: { ...candidate.source },
    url: candidate.url,
    displayName: '',
    familyRef: '',
    ref: '',
    defaultForFamily: true,
    calibration: {
      scale: 1,
      yawDegrees: 0,
      fineOffsetMeters: [0, 0, 0],
    },
    placement: 'floor',
    role: 'decor',
    themes: [],
    blocksMovement: false,
    blocksLoS: false,
    notes: '',
  };
}

function sourceKey(source: CalibrationSource): string {
  return [
    source.packSlug,
    source.packVersion,
    source.sourcePath,
    source.glbSha256,
  ].join('\0');
}

export function mergeCatalogIntoBatch(
  catalog: CalibrationCatalog,
  existing?: CalibrationBatch
): CalibrationBatch {
  const bySource = new Map(
    (existing?.entries ?? []).map((entry) => [sourceKey(entry.source), entry])
  );
  const entries = catalog.candidates.map((candidate) => {
    const prior = bySource.get(sourceKey(candidate.source));
    return prior
      ? { ...prior, url: candidate.url }
      : entryFromCandidate(candidate);
  });
  return {
    schemaVersion: 1,
    batchId: existing?.batchId ?? 'first-floor-props-v1',
    entries,
  };
}

export function normalizeYaw(value: number): number {
  if (!Number.isFinite(value)) return value;
  const normalized = ((((value + 180) % 360) + 360) % 360) - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function validateCalibrationEntry(entry: CalibrationEntry): FieldErrors {
  const errors: FieldErrors = {};
  if (!entry.displayName.trim())
    errors.displayName = 'Display name is required.';

  // A family ref is a whole ref whose id is a single part; an exact ref is
  // the same ref with one more id part naming the model. `parseRef` already
  // refuses an empty or out-of-grammar part, which is what the hand-rolled
  // segment check here used to do.
  const family = parseRef(entry.familyRef);
  if (
    !family ||
    family.module !== 'dnd5e' ||
    family.type !== 'props' ||
    family.idParts.length !== 1
  ) {
    errors.familyRef = 'Use dnd5e:props:<family>.';
  }

  const exact = parseRef(entry.ref);
  if (!exact || exact.idParts.length < 2) {
    errors.ref = 'Exact ref requires at least four valid segments.';
  } else if (
    family &&
    `${exact.module}:${exact.type}:${exact.idParts[0]}` !== entry.familyRef
  ) {
    errors.ref = 'Exact ref must begin with the family ref.';
  }

  if (!Number.isFinite(entry.calibration.scale)) {
    errors.scale = 'Scale must be finite.';
  } else if (entry.calibration.scale <= 0 || entry.calibration.scale > 100) {
    errors.scale = 'Scale must be greater than 0 and at most 100.';
  }
  if (!Number.isFinite(entry.calibration.yawDegrees)) {
    errors.yawDegrees = 'Yaw must be finite.';
  }

  const [x, y, z] = entry.calibration.fineOffsetMeters;
  if (!Number.isFinite(x) || Math.abs(x) > 0.5) {
    errors.fineOffsetX = 'Horizontal offset must be between -0.5m and 0.5m.';
  }
  if (!Number.isFinite(y) || Math.abs(y) > 0.1) {
    errors.fineOffsetY = 'Vertical offset must be between -0.1m and 0.1m.';
  }
  if (!Number.isFinite(z) || Math.abs(z) > 0.5) {
    errors.fineOffsetZ = 'Horizontal offset must be between -0.5m and 0.5m.';
  }

  if (entry.placement !== 'floor')
    errors.placement = 'Only floor props are supported.';
  if (!['obstacle', 'cover', 'decor'].includes(entry.role)) {
    errors.role = 'Choose obstacle, cover, or decor.';
  }
  if (
    entry.themes.length === 0 ||
    entry.themes.some((theme) => !theme.trim() || !SEGMENT.test(theme))
  ) {
    errors.themes = 'Add at least one valid theme.';
  }
  if (!SHA256.test(entry.source.glbSha256)) {
    errors.source = 'Prepared source hash is invalid.';
  }
  return errors;
}

function parseCalibration(value: unknown, label: string) {
  const raw = object(value, label);
  exactKeys(raw, ['scale', 'yawDegrees', 'fineOffsetMeters'], label);
  if (
    !Array.isArray(raw.fineOffsetMeters) ||
    raw.fineOffsetMeters.length !== 3
  ) {
    fail(`${label}.fineOffsetMeters must contain three numbers`);
  }
  return {
    scale: number(raw.scale, `${label}.scale`),
    yawDegrees: number(raw.yawDegrees, `${label}.yawDegrees`),
    fineOffsetMeters: raw.fineOffsetMeters.map((item, index) =>
      number(item, `${label}.fineOffsetMeters[${index}]`)
    ) as [number, number, number],
  };
}

function parseEntry(value: unknown, index: number): CalibrationEntry {
  const label = `entries[${index}]`;
  const raw = object(value, label);
  exactKeys(
    raw,
    [
      'source',
      'displayName',
      'familyRef',
      'ref',
      'defaultForFamily',
      'calibration',
      'placement',
      'role',
      'themes',
      'blocksMovement',
      'blocksLoS',
      'notes',
    ],
    label
  );
  if (!Array.isArray(raw.themes)) fail(`${label}.themes must be an array`);
  const placement = string(raw.placement, `${label}.placement`);
  const role = string(raw.role, `${label}.role`);
  if (placement !== 'floor') fail(`${label}.placement must be floor`);
  if (!['obstacle', 'cover', 'decor'].includes(role)) {
    fail(`${label}.role is invalid`);
  }
  return {
    source: parseSource(raw.source, `${label}.source`),
    displayName: string(raw.displayName, `${label}.displayName`),
    familyRef: string(raw.familyRef, `${label}.familyRef`),
    ref: string(raw.ref, `${label}.ref`),
    defaultForFamily: boolean(
      raw.defaultForFamily,
      `${label}.defaultForFamily`
    ),
    calibration: parseCalibration(raw.calibration, `${label}.calibration`),
    placement: 'floor',
    role: role as PropRole,
    themes: raw.themes.map((theme, themeIndex) =>
      string(theme, `${label}.themes[${themeIndex}]`)
    ),
    blocksMovement: boolean(raw.blocksMovement, `${label}.blocksMovement`),
    blocksLoS: boolean(raw.blocksLoS, `${label}.blocksLoS`),
    notes: string(raw.notes, `${label}.notes`),
  };
}

export function parseCalibrationBatch(text: string): CalibrationBatch {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    fail('batch must be valid JSON');
  }
  const raw = object(decoded, 'batch');
  exactKeys(raw, ['$schemaVersion', 'batchId', 'entries'], 'batch');
  if (raw.$schemaVersion !== 1) fail('batch.$schemaVersion must be 1');
  if (!Array.isArray(raw.entries)) fail('batch.entries must be an array');
  return {
    schemaVersion: 1,
    batchId: string(raw.batchId, 'batch.batchId'),
    entries: raw.entries.map(parseEntry),
  };
}

function withoutLocalUrl(
  entry: CalibrationEntry
): Omit<CalibrationEntry, 'url'> {
  const portable = { ...entry };
  delete portable.url;
  return portable;
}

export function serializeCalibrationBatch(batch: CalibrationBatch): string {
  return `${JSON.stringify(
    {
      $schemaVersion: 1,
      batchId: batch.batchId,
      entries: batch.entries.map(withoutLocalUrl),
    },
    null,
    2
  )}\n`;
}

export function saveCalibrationDraft(
  storage: Pick<Storage, 'setItem'>,
  batch: CalibrationBatch
): void {
  storage.setItem(
    PROP_CALIBRATION_STORAGE_KEY,
    serializeCalibrationBatch(batch)
  );
}

export function loadCalibrationDraft(
  storage: Pick<Storage, 'getItem'>
): CalibrationBatch | undefined {
  const text = storage.getItem(PROP_CALIBRATION_STORAGE_KEY);
  if (!text) return undefined;
  try {
    return parseCalibrationBatch(text);
  } catch {
    return undefined;
  }
}

export function isProviderReady(batch: CalibrationBatch): boolean {
  if (!BATCH_ID.test(batch.batchId) || batch.entries.length === 0) return false;
  if (
    batch.entries.some(
      (entry) => Object.keys(validateCalibrationEntry(entry)).length > 0
    )
  ) {
    return false;
  }
  if (
    new Set(batch.entries.map((entry) => entry.ref)).size !==
    batch.entries.length
  ) {
    return false;
  }
  if (
    new Set(batch.entries.map((entry) => sourceKey(entry.source))).size !==
    batch.entries.length
  ) {
    return false;
  }
  const families = new Map<string, number>();
  for (const entry of batch.entries) {
    if (!families.has(entry.familyRef)) families.set(entry.familyRef, 0);
    if (entry.defaultForFamily) {
      families.set(entry.familyRef, families.get(entry.familyRef)! + 1);
    }
  }
  return [...families.values()].every((defaults) => defaults === 1);
}

export function propCalibrationReducer(
  state: PropCalibrationState,
  action: PropCalibrationAction
): PropCalibrationState {
  if (action.type === 'select') {
    const last = Math.max(0, state.batch.entries.length - 1);
    return {
      ...state,
      selectedIndex: Math.max(0, Math.min(last, action.index)),
    };
  }
  if (action.type === 'replace-batch') {
    return { batch: action.batch, selectedIndex: 0 };
  }
  if (action.index < 0 || action.index >= state.batch.entries.length)
    return state;
  const entries = [...state.batch.entries];
  entries[action.index] = action.entry;
  return { ...state, batch: { ...state.batch, entries } };
}
