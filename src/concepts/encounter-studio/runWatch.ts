/**
 * Watch a run's state (rpg-project#1004): availability, the game tab's URL,
 * the record feed folded at the chosen step, and the machines a member
 * runs. `StudioWatch.tsx` draws it. See that file's header.
 */
import type { RecordFeedSnapshot } from '@/components/session/recordFeed';
import { useSessionRecordStream } from '@/components/session/useSessionRecordStream';
import type { ReadBack } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useEffect, useMemo, useState } from 'react';
import type { RoomDraft } from '../world-building/roomDraft';
import { layoutMachine, type MachineLayout } from './machineLayout';
import { machineOf } from './machineView';
import { foldRun, stepStartOf, type RunMember, type RunView } from './runView';

export const WATCH_DEV_ONLY_SENTENCE =
  'Watching a run reads the run’s record, which the server serves only in development.';

/** Why Watch a run cannot run in this build, or null when it can. */
export function watchUnavailableReason(
  mode: string = import.meta.env.MODE
): string | null {
  return mode === 'development' ? null : WATCH_DEV_ONLY_SENTENCE;
}

/** The run being watched: the session StartEncounter answered with, and the
 * seat that started it. */
export interface WatchedRun {
  session: string;
  member: string;
  /** The studio draft the run was started from, when known: a reload
   * reopens the watch only on that draft (rpg-project#1008). */
  room?: string;
}

export interface RunWatch {
  feed: RecordFeedSnapshot;
  view: RunView;
  /** The step shown, as an index into `view.steps`; null is live. */
  step: number | null;
  /** Show this step (an index into `view.steps`), or live. */
  setStep(step: number | null): void;
  /** The chosen step has aged out of the record (the feed keeps the newest
   * beats); the earliest step still held is shown instead. */
  agedOut: boolean;
  /** The shown step's first row: rows [from, upTo) are this step's own. */
  from: number;
  upTo: number;
  selected: string | null;
  setSelected(id: string | null): void;
}

/** The record of the watched run, folded at the chosen step. */
export function useRunWatch(
  watch: WatchedRun | null,
  draft: Readonly<RoomDraft>
): RunWatch {
  const feed = useSessionRecordStream(
    watch?.session ?? '',
    watch?.member ?? '',
    watch !== null
  );
  return useRunFold(watch, draft, feed);
}

/** The fold and the step and selection state, over any feed. */
export function useRunFold(
  watch: WatchedRun | null,
  draft: Readonly<RoomDraft>,
  feed: RecordFeedSnapshot
): RunWatch {
  /** The chosen step BY THE RECORD'S OWN ACT ID ('' is the start), never
   * by index: the feed drops its oldest rows, and an index would then name
   * a later step. Null is live. */
  const [chosen, setChosen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const key = watch ? `${watch.session}\u0000${watch.member}` : '';
  useEffect(() => {
    setChosen(null);
    setSelected(null);
  }, [key]);
  const start = useMemo(
    () => ({
      creatures: draft.room.monsterDeclarations.map((m) => ({
        id: m.id,
        cell: m.startingCell.location,
      })),
      partyStart: draft.room.partyStart,
      self: watch?.member,
    }),
    [draft.room.monsterDeclarations, draft.room.partyStart, watch?.member]
  );
  const steps = useMemo(
    () => foldRun(start, feed.rows, 0).steps,
    [start, feed.rows]
  );
  const found = chosen === null ? -1 : steps.findIndex((s) => s.act === chosen);
  const agedOut = chosen !== null && found < 0;
  const shown = chosen === null ? null : agedOut ? 0 : found;
  const setStep = (index: number | null): void =>
    setChosen(index === null ? null : (steps[index]?.act ?? null));
  const upTo = shown === null ? feed.rows.length : steps[shown]!.through;
  const view = useMemo(
    () => foldRun(start, feed.rows, upTo),
    [start, feed.rows, upTo]
  );
  const from = stepStartOf(steps, shown ?? steps.length - 1);
  return {
    feed,
    view,
    step: shown,
    setStep,
    agedOut,
    from,
    upTo,
    selected,
    setSelected,
  };
}

const ROUTINE = 'routine';
const RUNS = 'runs';

/** The machines a creature runs, as the engine says (`runs`), each with
 * the box of the state the run says it is in now. */
export function machinesRunBy(
  readBack: ReadBack | null,
  member: RunMember
): { routine: string; layout: MachineLayout; live: string | null }[] {
  if (!readBack) return [];
  const states = new Set(
    [member.state, ...Object.values(member.roles)].filter(
      (s): s is string => !!s
    )
  );
  return readBack.sections
    .flatMap((section) => section.groups)
    .filter(
      (group) =>
        group.about?.kind === ROUTINE &&
        (group.statements[0]?.connects ?? []).some(
          (c) => c.role === RUNS && c.id === member.id
        )
    )
    .flatMap((group) => {
      const routine = group.about!.id;
      const view = machineOf(readBack, routine);
      if (!view) return [];
      const layout = layoutMachine(view);
      const live =
        layout.boxes.find((box) => states.has(box.state.id))?.id ?? null;
      return [{ routine, layout, live }];
    });
}
