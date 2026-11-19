/**
 * WHAT A RUN IS A RUN OF (rpg-project#1017, story #1003 S7).
 *
 * The run's record names its encounter in ONE record-only beat written at
 * launch, right after `scene-opened` (rpg-toolkit encounter
 * `BeatSceneContent`, encounter.go `NewEncounter`):
 *
 *   {"beat":"scene_content","key":"the-patrol","site_hash":"7b03…",
 *    "content_hash":"371f…","engine":"v0.228.0"}
 *
 * `key`, `content_hash` and `engine` are each written only when known.
 *
 * "HAS THE ENCOUNTER CHANGED SINCE THIS RUN?" compares that `content_hash`
 * with the open encounter's, as the server returns it on the studio's own
 * check (`PutDungeon{validate_only}`, the preview every edit already runs).
 * The rules (rpg-project#1001 item 13 hand-off):
 *
 * - The KEY is part of the hash, so a run of another key is said as that,
 *   never as "changed".
 * - Two hashes are compared ONLY when the run's `engine` equals the
 *   server's (`GetMachineWords().encounter_version`): another engine
 *   release may compile the same file to another hash.
 * - A run with no `scene_content` (recorded before the beat) carries no
 *   identity; a saved run then falls back to its snapshot comparison.
 *
 * Exactly ONE line comes out, whichever case it is.
 */
import type { RecordRow } from '@/components/session/recordFeed';

/** The run's `scene_content` beat, read. */
export interface RunIdentity {
  /** The content's key; '' when the host named none. */
  key: string;
  siteHash: string;
  /** The content's hash; '' when the host carried none. */
  contentHash: string;
  /** The engine release that ran it; '' when the build did not know it. */
  engine: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The run's identity from its record's first `scene_content`, or null. */
export function runIdentityOf(rows: readonly RecordRow[]): RunIdentity | null {
  for (const row of rows) {
    if (row.beat !== 'scene_content' || !row.fields) continue;
    return identityOfJson(row.fields);
  }
  return null;
}

/** An identity from its wire (or saved header) fields. */
export function identityOfJson(
  f: Readonly<Record<string, unknown>>
): RunIdentity {
  return {
    key: str(f.key),
    siteHash: str(f.site_hash),
    contentHash: str(f.content_hash),
    engine: str(f.engine),
  };
}

/** An identity in the record's own field names (the saved-run header). */
export function identityJson(id: RunIdentity): Record<string, string> {
  return {
    ...(id.key ? { key: id.key } : {}),
    site_hash: id.siteHash,
    ...(id.contentHash ? { content_hash: id.contentHash } : {}),
    ...(id.engine ? { engine: id.engine } : {}),
  };
}

/** A hash shortened for a line: its first eight characters. */
export function shortHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 8)}…` : hash;
}

/** The open encounter, as the server last answered a check of it. */
export interface OpenEncounter {
  key: string;
  /** The server's `content_hash` of the open text; null when there is none
   * (the text does not compile, or has not been checked yet). */
  contentHash: string | null;
}

/** What the comparison could rely on from the server. */
export interface ServerSide {
  /** The server's encounter release; null when it is not known. */
  engine: string | null;
  /** The server could not be reached (the check or the engine's words). */
  unreachable: boolean;
}

export type RunComparison =
  /** The run's hash equals the open encounter's. */
  | { kind: 'unchanged' }
  /** Same key, same engine, another hash. */
  | { kind: 'changed' }
  /** The run is of another key. */
  | { kind: 'other-key'; key: string }
  /** The run's engine is not the server's: no claim is made. */
  | { kind: 'other-engine'; engine: string; server: string }
  /** The run carries no `scene_content` (or no hash in it). */
  | { kind: 'no-identity' }
  /** The comparison could not be made, and why. */
  | { kind: 'not-compared'; why: string };

/** The one comparison of a run with the open encounter. */
export function compareRun(
  identity: RunIdentity | null,
  open: OpenEncounter,
  server: ServerSide
): RunComparison {
  if (!identity || !identity.contentHash) return { kind: 'no-identity' };
  // The key is the record's own fact, not a hash: another key is said as
  // that whatever the engine.
  if (identity.key && open.key && identity.key !== open.key)
    return { kind: 'other-key', key: identity.key };
  if (server.unreachable)
    return { kind: 'not-compared', why: 'the server could not be reached' };
  if (server.engine === null)
    return {
      kind: 'not-compared',
      why: 'the server has not said its engine release',
    };
  if (!identity.engine || identity.engine !== server.engine)
    return {
      kind: 'other-engine',
      engine: identity.engine,
      server: server.engine,
    };
  if (!open.key)
    return { kind: 'not-compared', why: 'the open encounter has no key' };
  if (open.contentHash === null)
    return {
      kind: 'not-compared',
      why: 'the open encounter has no content hash (it does not compile now, or has not been checked yet)',
    };
  return open.contentHash === identity.contentHash
    ? { kind: 'unchanged' }
    : { kind: 'changed' };
}

/** Whether the comparison leaves the saved snapshot to say what changed. */
export function fallsBackToSnapshot(c: RunComparison): boolean {
  return c.kind === 'no-identity' || c.kind === 'not-compared';
}

/** The comparison as one plain line. `fallback` is the snapshot
 * comparison's own sentence, for the cases that fall back to it. */
export function comparisonLine(c: RunComparison, fallback?: string): string {
  const then = fallback ? ` ${fallback}` : '';
  switch (c.kind) {
    case 'unchanged':
      return 'The encounter is unchanged since this run: its content hash matches the open encounter’s.';
    case 'changed':
      return 'The encounter has changed since this run: its content hash differs from the open encounter’s.';
    case 'other-key':
      return `This run was saved from ${c.key}, not the open encounter.`;
    case 'other-engine':
      return `This run was saved under another engine version (${c.engine || 'unknown'}; the server runs ${c.server}), so whether the encounter changed since cannot be said.`;
    case 'no-identity':
      return `This run carries no encounter identity (it was recorded before runs named their encounter).${then}`;
    case 'not-compared':
      return `Whether the encounter changed since this run could not be checked: ${c.why}.${then}`;
  }
}
