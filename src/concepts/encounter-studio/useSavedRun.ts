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
import { useRunFold, type RunWatch, type WatchedRun } from './runWatch';
import {
  draftDiffersFrom,
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
} from './savedRun';
import type { WatchReplay, WatchSave } from './StudioWatch';

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

const EMPTY: RecordFeedSnapshot = { rows: [], notice: undefined };

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
  const notes = useMemo(() => {
    if (!opened) return [];
    if (!header) return [NO_SNAPSHOT_NOTE];
    const notes = header.incomplete
      ? [`This saved run is incomplete: ${header.incomplete}.`]
      : [];
    const elsewhere = savedFromElsewhere(header, {
      key: input.dungeonKey ?? '',
      name: input.draft.name,
    });
    if (elsewhere !== null)
      return [
        ...notes,
        `This run was saved from ${elsewhere}, not the open encounter (${input.draft.name}). The creatures, where they start and their machines are drawn as saved; the map is the open draft’s.`,
      ];
    const differs = draftDiffersFrom(
      header.snapshot,
      input.draft,
      input.readBack
    );
    return differs.length
      ? [
          ...notes,
          `The encounter has changed since this run was saved (${differs.join(', ')}). The creatures, where they start and their machines are drawn as saved; the map is the open draft’s.`,
        ]
      : notes;
  }, [opened, header, input.draft, input.readBack, input.dungeonKey]);
  const panel = opened
    ? {
        name: opened.fileName,
        savedAt: header?.savedAt
          ? new Date(header.savedAt).toLocaleString()
          : 'at an unknown time',
        notes,
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
