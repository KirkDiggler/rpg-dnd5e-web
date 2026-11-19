/**
 * WATCH A RUN S4 (rpg-project#1011): the run at a glance. One row per
 * creature, one cell per step, oldest left: a band coloured by the machine
 * state in force, and in each cell what the creature did, in the record's
 * own words (`runTimeline.ts`). A boundary marks where the state changed
 * (solid) or what it did changed kind (dashed).
 *
 * A STRIP UNDER THE MAP, across its full width: the watch panel is already
 * cramped, and a step axis wants width.
 *
 * Clicking a cell shows that step (the same step Back and Forward choose,
 * by act id) and selects that creature. Arrow keys move along a row.
 */
import { RECORD_AGED_OUT_NOTICE } from '@/components/session/recordFeed';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  roleSegments,
  shownTimelineRows,
  stateColour,
  stateSegments,
  TIMELINE_HANDFUL,
  timelineOf,
  type TimelineCell,
} from './runTimeline';
import type { RunDraft, RunWatch, WatchedRun } from './runWatch';
import { sightTextOf } from './watchSight';
import { stopLinesOf } from './watchStop';
import { WatchStopBanner } from './WatchStopBanner';

/** One step's width in px. */
export const TIMELINE_CELL = 72;
/** A row's height with no other role, and what each other role's band adds
 * (rpg-project#1016). */
const ROW_HEIGHT = 34;
const ROLE_BAND = 12;

export function StudioWatchTimeline({
  watch,
  run,
  draft,
  names,
  refusal,
}: {
  /** The Live step's own refusal or stop sentence (the Move answer). */
  refusal?: string | null;
  watch: WatchedRun;
  run: Pick<
    RunWatch,
    'feed' | 'step' | 'setStep' | 'selected' | 'setSelected' | 'from' | 'upTo'
  >;
  draft: Readonly<RunDraft>;
  names?: ReadonlyMap<string, string>;
}): React.JSX.Element {
  const { feed, step, setStep, selected, setSelected } = run;
  const stops = useMemo(
    () => stopLinesOf(feed.rows, run.from, run.upTo, names),
    [feed.rows, run.from, run.upTo, names]
  );
  const start = useMemo(
    () => ({
      creatures: draft.room.monsterDeclarations.map((m) => ({
        id: m.id,
        cell: m.startingCell.location,
      })),
      partyStart: draft.room.partyStart,
      self: watch.member,
    }),
    [draft.room.monsterDeclarations, draft.room.partyStart, watch.member]
  );
  const timeline = useMemo(
    () => timelineOf(start, feed.rows),
    [start, feed.rows]
  );
  const creatures = timeline.rows.filter((r) => !r.party).length;
  const [onlyChanged, setOnlyChanged] = useState<boolean | null>(null);
  const filtering = onlyChanged ?? creatures > TIMELINE_HANDFUL;
  const rows = shownTimelineRows(timeline, filtering, selected);
  const last = timeline.steps.length - 1;
  const at = step ?? last;
  /** The watch holds the whole run (rpg-project#1013): steps are missing
   * only when the server no longer held the run's start. */
  const agedOut = feed.notice === RECORD_AGED_OUT_NOTICE;
  const pick = (index: number, id: string): void => {
    if (index < 0 || index > last) return;
    setStep(index >= last ? null : index);
    setSelected(id);
  };
  const scroller = useRef<HTMLDivElement>(null);
  const focusNext = useRef<{ id: string; step: number } | null>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const left = at * TIMELINE_CELL;
    if (step === null) el.scrollLeft = el.scrollWidth;
    else if (
      left < el.scrollLeft ||
      left + TIMELINE_CELL > el.scrollLeft + el.clientWidth
    )
      el.scrollLeft = Math.max(0, left - el.clientWidth / 2);
  }, [at, step, timeline.steps.length]);
  useEffect(() => {
    const want = focusNext.current;
    if (!want) return;
    focusNext.current = null;
    const cells =
      scroller.current?.querySelectorAll<HTMLElement>('.es-timeline-cell') ??
      [];
    for (const cell of cells)
      if (
        cell.dataset.member === want.id &&
        cell.dataset.step === String(want.step)
      )
        cell.focus();
  });
  const name = (id: string): string => names?.get(id) ?? id;
  const width = timeline.steps.length * TIMELINE_CELL;
  return (
    <section
      className="es-timeline wb-panel"
      aria-label="Timeline of the run"
      data-testid="watch-timeline"
    >
      <header className="es-timeline-header">
        <h4>Timeline</h4>
        <label className="es-help">
          <input
            type="checkbox"
            checked={filtering}
            onChange={(e) => setOnlyChanged(e.target.checked)}
            data-testid="timeline-only-changed"
          />{' '}
          Only creatures that changed
        </label>
        <span className="es-help">
          Band: machine state (a thin band under it for each other role) · mark:
          what it did, “sees” when its sight changed · solid edge: state changed
          · dashed edge: what it did changed · a changed role or sight counts as
          a change
        </span>
        <WatchStopBanner
          refusal={step === null ? refusal : null}
          lines={stops}
          testId="timeline-stop-banner"
        />
        {agedOut && (
          <span
            className="es-help"
            role="status"
            data-testid="timeline-aged-out"
          >
            Earlier steps are no longer in the record; the timeline begins at
            the oldest step it still holds.
          </span>
        )}
      </header>
      <div className="es-timeline-scroll" ref={scroller}>
        <div
          className="es-timeline-grid"
          style={{ width: width + 160 }}
          role="grid"
          aria-rowcount={rows.length}
        >
          <div
            className="es-timeline-now"
            style={{ left: 160 + at * TIMELINE_CELL + TIMELINE_CELL / 2 }}
            data-testid="timeline-now"
            data-step={at}
            aria-hidden="true"
          />
          {rows.length === 0 && (
            <p className="es-help">
              {timeline.rows.length === 0
                ? 'No creatures in the record yet.'
                : 'No creature changed yet.'}
            </p>
          )}
          {rows.map((row) => (
            <div
              key={row.id}
              className={`es-timeline-row${row.id === selected ? ' es-timeline-row-selected' : ''}`}
              role="row"
              data-testid="timeline-row"
              data-member={row.id}
              style={
                row.roles.length > 0
                  ? { height: ROW_HEIGHT + ROLE_BAND * row.roles.length }
                  : undefined
              }
            >
              <div className="es-timeline-name" role="rowheader" title={row.id}>
                {name(row.id)}
              </div>
              <div className="es-timeline-track" style={{ width }}>
                {stateSegments(row.cells).map((seg) =>
                  seg.state === undefined ? null : (
                    <div
                      key={seg.from}
                      className="es-timeline-band"
                      style={{
                        left: seg.from * TIMELINE_CELL,
                        width: seg.length * TIMELINE_CELL,
                        background: stateColour(seg.state),
                      }}
                      title={`state ${seg.state}`}
                      data-testid="timeline-band"
                      data-state={seg.state}
                    >
                      {seg.state}
                    </div>
                  )
                )}
                {row.roles.map((role, r) =>
                  roleSegments(row.cells, role).map((seg) =>
                    seg.state === undefined ? null : (
                      <div
                        key={`${role}:${seg.from}`}
                        className={`es-timeline-band es-timeline-role-band${seg.edge ? ' es-timeline-role-edge' : ''}`}
                        style={{
                          top: 17 + r * ROLE_BAND,
                          left: seg.from * TIMELINE_CELL,
                          width: seg.length * TIMELINE_CELL,
                          background: stateColour(seg.state),
                        }}
                        title={`role ${role}: state ${seg.state}`}
                        data-testid="timeline-role-band"
                        data-role={role}
                        data-state={seg.state}
                        data-edge={seg.edge || undefined}
                      >
                        {role}: {seg.state}
                      </div>
                    )
                  )
                )}
                {row.cells.map((cell) => (
                  <TimelineCellButton
                    key={cell.step}
                    cell={cell}
                    id={row.id}
                    name={name(row.id)}
                    names={names}
                    roleCount={row.roles.length}
                    current={cell.step === at}
                    stepLabel={
                      cell.step === 0
                        ? agedOut
                          ? 'the earliest step held'
                          : 'the start'
                        : `step ${cell.step}`
                    }
                    onPick={() => pick(cell.step, row.id)}
                    onArrow={(by) => {
                      const next = cell.step + by;
                      if (next < 0 || next > last) return;
                      focusNext.current = { id: row.id, step: next };
                      pick(next, row.id);
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TimelineCellButton({
  cell,
  id,
  name,
  names,
  roleCount,
  current,
  stepLabel,
  onPick,
  onArrow,
}: {
  cell: TimelineCell;
  id: string;
  name: string;
  names?: ReadonlyMap<string, string>;
  roleCount: number;
  current: boolean;
  stepLabel: string;
  onPick(): void;
  onArrow(by: number): void;
}): React.JSX.Element {
  const label = [
    `${name}, ${stepLabel}`,
    cell.state
      ? `state ${cell.state}${cell.stateChanged ? ' (changed)' : ''}`
      : 'no state recorded',
    ...Object.entries(cell.roles ?? {}).map(
      ([role, state]) =>
        `role ${role}: ${state}${cell.rolesChanged?.includes(role) ? ' (changed)' : ''}`
    ),
    cell.did
      ? `did: ${cell.did.text}${cell.didChanged ? ' (changed)' : ''}`
      : 'did nothing recorded',
    ...(cell.sight ? [`sight: ${sightTextOf(cell.sight, names)}`] : []),
  ].join('; ');
  const mark = [cell.did?.mark, cell.sight ? 'sees' : '']
    .filter(Boolean)
    .join(' ');
  const classes = ['es-timeline-cell'];
  if (cell.stateChanged) classes.push('es-timeline-cell-state-edge');
  if (cell.didChanged) classes.push('es-timeline-cell-did-edge');
  if (current) classes.push('es-timeline-cell-current');
  return (
    <button
      type="button"
      role="gridcell"
      className={classes.join(' ')}
      style={{
        left: cell.step * TIMELINE_CELL,
        width: TIMELINE_CELL,
        ...(roleCount > 0 ? { paddingTop: 18 + ROLE_BAND * roleCount } : {}),
      }}
      tabIndex={current ? 0 : -1}
      aria-label={label}
      aria-current={current ? 'step' : undefined}
      title={label}
      data-member={id}
      data-step={cell.step}
      data-testid="timeline-cell"
      onClick={onPick}
      onKeyDown={(event) => {
        const by =
          event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
        if (!by) return;
        event.preventDefault();
        onArrow(by);
      }}
    >
      {mark}
    </button>
  );
}
