import { parse, stringify } from 'yaml';
import { bufferRecordRows, RECORD_MAX_ROWS } from './recordBuffer';
import type { RecordFeedSnapshot, RecordRow } from './recordFeed';

export const MAX_RECORD_CAPTURE_BYTES = 32 * 1024 * 1024;
const MAX_RECORD_DEPTH = 128;
const MAX_UINT64 = 18446744073709551615n;

export function isRecordObject(
  value: unknown
): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalize(value: unknown, depth = 0): unknown {
  if (depth > MAX_RECORD_DEPTH)
    throw new Error('Record nesting exceeds the reader limit.');
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) &&
      value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value;
  }
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new Error('Record contains an unrepresentable number.');
  if (Array.isArray(value))
    return value.map((item) => normalize(item, depth + 1));
  if (isRecordObject(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalize(value[key], depth + 1)])
    );
  return value;
}

/** Validate JSON grammar, then parse integer tokens losslessly with the existing
 * YAML JSON schema. The result of JSON.parse is deliberately NOT used: JS numbers
 * would silently round valid machine integers. No game expression is evaluated. */
export function parseRecordJSON(text: string): unknown {
  JSON.parse(text);
  return normalize(
    parse(text, { schema: 'json', intAsBigInt: true, uniqueKeys: true })
  );
}

function containsBigInt(value: unknown): boolean {
  if (typeof value === 'bigint') return true;
  if (Array.isArray(value)) return value.some(containsBigInt);
  return isRecordObject(value) && Object.values(value).some(containsBigInt);
}

/** Flow collections and quoted strings make a JSON-readable representation even
 * when native JSON.stringify cannot express the captured bigint value. */
export function formatRecordJSON(value: unknown): string {
  if (!containsBigInt(value)) return JSON.stringify(value, null, 2) ?? 'null';
  return stringify(value, {
    schema: 'json',
    collectionStyle: 'flow',
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'QUOTE_DOUBLE',
    lineWidth: 100,
  }).trim();
}

export interface ParsedRecordCapture {
  session: string;
  count: number;
  feed: RecordFeedSnapshot;
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Missing ${name}.`);
  return value;
}

function clock(value: unknown): bigint {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
    return BigInt(value);
  if (typeof value === 'bigint' && value >= 0n && value <= MAX_UINT64)
    return value;
  throw new Error('Invalid captured game-clock value.');
}

/** Reads one captured session, never a simulation or a lookup of current source.
 * Duplicate identical records are harmless; conflicting IDs, malformed lines,
 * unsupported schemas and mixed sessions are refused. Status/gaps remain visible. */
export function parseRecordCapture(source: string): ParsedRecordCapture {
  if (new TextEncoder().encode(source).length > MAX_RECORD_CAPTURE_BYTES)
    throw new Error(
      'Capture exceeds32MiB; filter a smaller session/time window.'
    );
  const records = new Map<string, RecordRow>();
  const started = new Set<string>();
  const ended = new Set<string>();
  const warnings = new Set<string>();
  let session = '';
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    try {
      const entry = parseRecordJSON(lines[i]);
      if (!isRecordObject(entry) || entry.schema !== 1)
        throw new Error('Unsupported capture schema.');
      const capture = text(entry.capture, 'capture identity');
      if (entry.kind === 'capture') {
        if (entry.status === 'started') {
          started.add(capture);
          warnings.add('Capture window: earlier history is not implied.');
        } else if (entry.status === 'drained') {
          ended.add(capture);
          warnings.add(
            'Accepted export batches drained; earlier history is not implied.'
          );
        } else if (entry.status === 'incomplete') {
          ended.add(capture);
          warnings.add(
            `Capture incomplete: ${typeof entry.reason === 'string' ? entry.reason : 'reason unavailable'}.`
          );
        } else {
          throw new Error('Unsupported capture status.');
        }
        continue;
      }
      if (entry.kind !== 'record')
        throw new Error('Unsupported capture line kind.');
      const owner = text(entry.session, 'session');
      if (session && session !== owner)
        throw new Error(
          'Mixed sessions: filter one session before opening the capture.'
        );
      session = owner;
      if (!started.has(capture))
        warnings.add(
          'Capture starts midstream: its start marker and earlier history are unavailable.'
        );
      const id = text(entry.id, 'record identity');
      if (typeof entry.act !== 'string')
        throw new Error('Invalid act identity.');
      if (!isRecordObject(entry.fields))
        throw new Error('Record fields must be a JSON object.');
      const row: RecordRow = {
        id,
        at: clock(entry.at),
        act: entry.act,
        beat: text(entry.beat, 'beat'),
        fields: entry.fields,
      };
      const previous = records.get(id);
      if (previous && formatRecordJSON(previous) !== formatRecordJSON(row))
        throw new Error(`Conflicting record ${id}.`);
      records.set(id, row);
    } catch (error) {
      throw new Error(
        `Capture line ${i + 1}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  if (!records.size) throw new Error('Capture contains no record events.');
  for (const capture of started)
    if (!ended.has(capture))
      warnings.add(
        'No drain marker: this is an open or truncated capture window.'
      );
  const incoming = [...records.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
  const buffered = bufferRecordRows({
    rows: [],
    incoming,
    limit: RECORD_MAX_ROWS,
  });
  return {
    session,
    count: records.size,
    feed: { ...buffered, notice: [...warnings].join(' ') || undefined },
  };
}
