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
import { foldRun, type RunMember, type RunView } from './runView';

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
}

/** The app in a new tab, as the same player: resume-after-refresh takes
 * the seat into the running encounter. A deep link would hold the view, so
 * only the dev player override is carried. */
export function gameUrlOf(
  location: Pick<Location, 'origin' | 'pathname' | 'search'>
): string {
  const playerId = new URLSearchParams(location.search).get('playerId');
  return `${location.origin}${location.pathname}${
    playerId ? `?playerId=${encodeURIComponent(playerId)}` : ''
  }`;
}

export interface RunWatch {
  feed: RecordFeedSnapshot;
  view: RunView;
  /** The step shown; null is live. */
  step: number | null;
  setStep(step: number | null): void;
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
  const [step, setStep] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const key = watch ? `${watch.session}\u0000${watch.member}` : '';
  useEffect(() => {
    setStep(null);
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
  const shown = step !== null && step < steps.length ? step : null;
  const upTo = shown === null ? feed.rows.length : steps[shown]!.through;
  const view = useMemo(
    () => foldRun(start, feed.rows, upTo),
    [start, feed.rows, upTo]
  );
  return {
    feed,
    view,
    step: shown,
    setStep,
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
