/**
 * Save this run, and Open a saved run (rpg-project#1013). The file's
 * format and snapshot are `savedRun.ts`; the panel is `StudioWatch.tsx`.
 *
 * A saved run opens into the SAME fold the watch uses (`useRunFold`), fed
 * from the file instead of the stream, with the creatures' starts, names and
 * machine read-back taken from the file's snapshot, never the open draft.
 */
import { recordClient } from '@/api/client';
import type { RecordFeedSnapshot } from '@/components/session/recordFeed';
import { ConnectError } from '@connectrpc/connect';
import type { ReadBack } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { GetRecordResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/record_service_pb';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RoomDraft } from '../world-building/roomDraft';
import {
  compareRun,
  comparisonLine,
  fallsBackToSnapshot,
  runIdentityOf,
  type OpenEncounter,
  type RunComparison,
  type RunIdentity,
} from './runIdentity';
import { useRunFold, type RunWatch, type WatchedRun } from './runWatch';
import {
  draftDiffersFrom,
  identityOfEvents,
  namesOfSaved,
  openSavedRun,
  readWholeRecord,
  runDraftOfSnapshot,
  SAVE_PAGE_LIMIT,
  SAVED_RUN_FORMAT,
  savedFromElsewhere,
  savedRunFile,
  savedRunFileName,
  snapshotOf,
  type OpenedRun,
  type SavedRunHeader,
} from './savedRun';
import type { WatchIdentity, WatchReplay, WatchSave } from './StudioWatch';
import { useEngineVersion, type EngineVersionClient } from './useEngineVersion';

/** Downloads `text` as `name` (Blob, object URL, a synthetic click). */
export function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/x-ndjson' })
  );
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface WatchSaveInput {
  watch: WatchedRun | null;
  /** The newest beat the watch holds; '' when none. */
  lastBeat: string;
  seatName?: string;
  draft: Readonly<RoomDraft>;
  names: ReadonlyMap<string, string>;
  readBack: ReadBack | null;
  dungeonKey: string;
  /** One page of the record; the record service's GetRecord by default. */
  getPage?: (run: WatchedRun, afterId: string) => Promise<GetRecordResponse>;
  download?: (name: string, text: string) => void;
  now?: () => Date;
}

const serverPage = (run: WatchedRun, afterId: string) =>
  recordClient.getRecord({
    session: run.session,
    member: run.member,
    afterId,
    limit: SAVE_PAGE_LIMIT,
  });

/** Save this run: the whole record read from the server, written with the
 * draft's snapshot, downloaded as one file. */
export function useWatchSave(input: WatchSaveInput): WatchSave | undefined {
  const { watch, lastBeat } = input;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The last save wrote a file that does not hold the whole run. */
  const [notice, setNotice] = useState<string | null>(null);
  /** The newest beat the last save held. */
  const [savedThrough, setSavedThrough] = useState<string | null>(null);
  const key = watch ? `${watch.session}\u0000${watch.member}` : '';
  useEffect(() => {
    setSavedThrough(null);
    setError(null);
    setNotice(null);
  }, [key]);
  const onSave = async (): Promise<boolean> => {
    if (!watch) return false;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const record = await readWholeRecord((afterId) =>
        (input.getPage ?? serverPage)(watch, afterId)
      );
      const savedAt = (input.now ?? (() => new Date()))();
      const dungeonKey = input.dungeonKey.trim() || input.draft.id;
      const run = identityOfEvents(record.events);
      const file = savedRunFile(
        {
          format: SAVED_RUN_FORMAT,
          savedAt: savedAt.toISOString(),
          session: watch.session,
          member: watch.member,
          ...(input.seatName ? { memberName: input.seatName } : {}),
          dungeon: { key: dungeonKey, name: input.draft.name },
          snapshot: snapshotOf({
            draft: input.draft,
            names: input.names,
            readBack: input.readBack,
          }),
          ...(run ? { run } : {}),
        },
        record
      );
      (input.download ?? downloadText)(
        savedRunFileName(dungeonKey, savedAt),
        file.text
      );
      if (file.incomplete)
        setNotice(`Saved, but this run is incomplete: ${file.incomplete}.`);
      setSavedThrough(record.events[record.events.length - 1]?.id ?? '');
      return true;
    } catch (err) {
      setError(`Could not save the run: ${ConnectError.from(err).rawMessage}`);
      return false;
    } finally {
      setSaving(false);
    }
  };
  if (!watch) return undefined;
  return {
    onSave,
    saving,
    error,
    notice,
    unsaved:
      lastBeat !== '' && (savedThrough === null || lastBeat > savedThrough),
  };
}

/** Saved runs opened in this page, so each opening asks afresh. */
let opens = 0;

/** What the engine release is asked for: the run shown, the open key and
 * hash, and whether the server answered the last check. A change of any
 * asks again: each new hash is confirmed against the engine that serves
 * now, and a reconnect flips the last one back. */
function engineAsk(
  run: string,
  open: OpenEncounter | undefined,
  unreachable: boolean | undefined
): string {
  return [
    run,
    open?.key ?? '',
    open?.contentHash ?? '',
    unreachable ? 'unreachable' : '',
  ].join('\u0000');
}

const EMPTY: RecordFeedSnapshot = { rows: [], notice: undefined };

export const SNAPSHOT_MATCHES_NOTE =
  'By its snapshot, the encounter looks the same.';

/** Said whenever a saved run is not of the open encounter as it is now. */
export const DRAWN_AS_SAVED_NOTE =
  'The creatures, where they start and their machines are drawn as saved; the map is the open draft’s.';

export const NO_SNAPSHOT_NOTE =
  'This file has no snapshot (a server capture): where the creatures start, their names and their machines come from the open draft.';

/** The seat a raw capture played: its first player `joined`. */
function seatOf(feed: RecordFeedSnapshot): string {
  for (const row of feed.rows)
    if (
      row.beat === 'joined' &&
      row.fields?.kind === 'player' &&
      typeof row.fields.member === 'string'
    )
      return row.fields.member;
  return '';
}

/** The snapshot comparison (rpg-project#1013) as one sentence: the run
 * was saved from another encounter, or how the open draft differs from its
 * snapshot; null when the draft matches it. The sentences are the ones a
 * saved run said before runs named their encounter. */
export function snapshotLine(
  header: SavedRunHeader,
  draft: Readonly<RoomDraft>,
  dungeonKey: string | undefined,
  readBack: ReadBack | null
): string | null {
  const elsewhere = savedFromElsewhere(header, {
    key: dungeonKey ?? '',
    name: draft.name,
  });
  if (elsewhere !== null)
    return `By its snapshot, this run was saved from ${elsewhere}, not the open encounter (${draft.name}).`;
  const differs = draftDiffersFrom(header.snapshot, draft, readBack);
  return differs.length
    ? `By its snapshot, the encounter has changed since this run was saved (${differs.join(', ')}).`
    : null;
}

export interface SavedRunReplay {
  /** The opened run; null when none is open. */
  opened: OpenedRun | null;
  /** The run as the watch reads it, for the overlay, panel and timeline. */
  watch: WatchedRun | null;
  run: RunWatch;
  draft: RoomDraft | ReturnType<typeof runDraftOfSnapshot>;
  names: ReadonlyMap<string, string>;
  readBack: ReadBack | null;
  /** The panel's read-only mode; undefined when none is open. */
  panel: WatchReplay | undefined;
  /** The last file that could not be opened, as a sentence. */
  error: string | null;
  open(file: File): Promise<boolean>;
  /** Opens already-read text (tests, and `open`). */
  openText(name: string, text: string): boolean;
  close(): void;
}

/** Open a saved run: a read-only replay through the watch's own fold. */
export function useSavedRunReplay(input: {
  draft: Readonly<RoomDraft>;
  /** The open encounter's key, to say a run saved from another one. */
  dungeonKey?: string;
  names: ReadonlyMap<string, string>;
  readBack: ReadBack | null;
  /** The open encounter as the server last answered its check
   * (rpg-project#1017); absent: its key alone, with no hash. */
  open?: OpenEncounter;
  /** The studio's last check could not reach the server. */
  openUnreachable?: boolean;
  /** Asks the server's engine release; the app's client by default. */
  engineClient?: EngineVersionClient;
}): SavedRunReplay {
  const [opened, setOpened] = useState<OpenedRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openText = useCallback((name: string, text: string): boolean => {
    try {
      setOpened(openSavedRun(name, text));
      setError(null);
      return true;
    } catch (err) {
      setError(
        `Could not open ${name}: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  }, []);
  const open = useCallback(
    async (file: File): Promise<boolean> =>
      openText(file.name, await file.text()),
    [openText]
  );
  const close = useCallback(() => setOpened(null), []);
  const header = opened?.header ?? null;
  const feed = opened?.capture.feed ?? EMPTY;
  const watch = useMemo<WatchedRun | null>(
    () =>
      opened
        ? {
            session: header?.session || opened.capture.session,
            member: header?.member || seatOf(opened.capture.feed),
          }
        : null,
    [opened, header]
  );
  const draft = useMemo(
    () => (header ? runDraftOfSnapshot(header.snapshot) : input.draft),
    [header, input.draft]
  );
  const run = useRunFold(watch, draft, feed);
  const names = useMemo(
    () => (header ? namesOfSaved(header) : input.names),
    [header, input.names]
  );
  const readBack = header ? header.snapshot.readBack : input.readBack;
  /** The run's identity: its record's `scene_content`, else the header's
   * copy of it. */
  const identity = useMemo<RunIdentity | null>(
    () => (opened ? (runIdentityOf(feed.rows) ?? header?.run ?? null) : null),
    [opened, feed.rows, header]
  );
  /** Each opening is its own ask: the engine release is confirmed afresh
   * for it, and again whenever the open hash or reachability changes. */
  const openId = useMemo(() => (opened ? String(++opens) : ''), [opened]);
  const server = useEngineVersion({
    client: input.engineClient,
    enabled: !!identity?.contentHash,
    ask: engineAsk(openId, input.open, input.openUnreachable),
  });
  const comparison = useMemo<RunComparison | null>(
    () =>
      opened
        ? compareRun(
            identity,
            input.open ?? {
              key: input.dungeonKey ?? '',
              contentHash: null,
            },
            {
              engine: server.engine,
              unreachable: server.unreachable || !!input.openUnreachable,
            }
          )
        : null,
    [
      opened,
      identity,
      input.open,
      input.dungeonKey,
      input.openUnreachable,
      server,
    ]
  );
  const notes = useMemo(() => {
    if (!opened || !comparison) return [];
    if (!header)
      return identity
        ? [NO_SNAPSHOT_NOTE, comparisonLine(comparison)]
        : [NO_SNAPSHOT_NOTE];
    const notes = header.incomplete
      ? [`This saved run is incomplete: ${header.incomplete}.`]
      : [];
    const fallback = fallsBackToSnapshot(comparison)
      ? snapshotLine(header, input.draft, input.dungeonKey, input.readBack)
      : undefined;
    // Not the open encounter as it is now, by its hash or its snapshot:
    // the drawing is the saved one, on the open draft's map.
    const differs =
      comparison.kind === 'changed' ||
      comparison.kind === 'other-key' ||
      (fallback !== undefined && fallback !== null);
    const line = comparisonLine(
      comparison,
      fallback === undefined ? undefined : (fallback ?? SNAPSHOT_MATCHES_NOTE)
    );
    return [...notes, differs ? `${line} ${DRAWN_AS_SAVED_NOTE}` : line];
  }, [
    opened,
    header,
    identity,
    comparison,
    input.draft,
    input.readBack,
    input.dungeonKey,
  ]);
  const panel = opened
    ? {
        name: opened.fileName,
        savedAt: header?.savedAt
          ? new Date(header.savedAt).toLocaleString()
          : 'at an unknown time',
        notes,
        identity,
        onClose: close,
      }
    : undefined;
  return {
    opened,
    watch,
    run,
    draft,
    names,
    readBack,
    panel,
    error,
    open,
    openText,
    close,
  };
}

/** What the WATCHED run is a run of, and its one comparison line with the
 * open encounter as the studio's last check answered it (rpg-project#1017):
 * an edit mid-run is said as "changed" once its check answers. A live run
 * has no snapshot to fall back to: the draft is what it was started from. */
export function useWatchIdentity(input: {
  rows: RecordFeedSnapshot['rows'];
  /** The watched run (session and seat): a new watch asks again. */
  session?: string;
  watching: boolean;
  open: OpenEncounter;
  openUnreachable?: boolean;
  engineClient?: EngineVersionClient;
}): WatchIdentity | undefined {
  const { rows, watching, open, openUnreachable } = input;
  const identity = useMemo(
    () => (watching ? runIdentityOf(rows) : null),
    [watching, rows]
  );
  const server = useEngineVersion({
    client: input.engineClient,
    enabled: !!identity?.contentHash,
    ask: engineAsk(input.session ?? '', open, openUnreachable),
  });
  return useMemo(() => {
    if (!watching) return undefined;
    // Before the record's first beats arrive there is nothing to say.
    if (rows.length === 0) return undefined;
    const comparison = compareRun(identity, open, {
      engine: server.engine,
      unreachable: server.unreachable || !!openUnreachable,
    });
    return {
      run: identity,
      line: comparisonLine(comparison),
      notable: comparison.kind === 'changed' || comparison.kind === 'other-key',
    };
  }, [watching, rows.length, identity, open, openUnreachable, server]);
}
