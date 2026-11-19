/**
 * WATCH A RUN IN THE STUDIO (rpg-project#1003, slice #1004).
 *
 * "Watch a run" starts the open encounter the way Play does (save, lobby,
 * StartEncounter) and keeps the operator in the studio, on the Layout, with
 * the run's RECORD streamed in (`useSessionRecordStream`, the same feed the
 * game's debug drawer reads). The engine runs the encounter on the server;
 * the studio only draws what the record says it did (`foldRun`). Nothing is
 * simulated here.
 *
 * DRIVING THE PARTY is done in the game, in THIS tab, on the same run:
 * the game's Move needs its whole interaction stack (the atlas path index,
 * the turn clock's declaration, the walk's reconciliation), so the studio
 * does not grow a second move client. "Play in the game" routes this tab
 * to the game by Play's own path (`App.handlePlayAuthored`), and the game's
 * "Back to the studio" returns here watching the same run, its record
 * replayed from the start so Back and Forward cover what was just played.
 *
 * ONE STEP FROM THE LAYOUT (#1006): at the live step the hexes next to
 * the seat are steps (`useStudioStep`, the game's own Move). A refused or
 * stopped step's sentence shows here; a fight sends moves to the game.
 *
 * ENDING A WATCH LEAVES THE RUN (#1008): Stop watching, a second Watch a
 * run, and leaving the studio Exit the watched run (`watchLeave.ts`), so
 * the character is not left seated. Play in the game and the game's Back
 * to the studio do not: the run is still being played.
 *
 * DEV MODE ONLY: the record is the diagnostic stream the server serves only
 * in development. Elsewhere the control is disabled and says why.
 */
import { RecordPanel } from '@/components/session/combat-experience/RecordPanel';
import type { RecordFeedSnapshot } from '@/components/session/recordFeed';
import type { ReadBack } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MachineDrawing } from './MachineDrawing';
import { barredLine, runSpeechLine } from './runSpeech';
import { barredOf, rowsAbout, speechOf } from './runView';
import { machinesRunBy, type RunWatch, type WatchedRun } from './runWatch';
import { FIGHT_MOVES_IN_THE_GAME, type StudioStep } from './useStudioStep';
import {
  clampWatchWidth,
  machineFit,
  WATCH_MIN_WIDTH,
  WATCH_WIDTH_STEP,
  watchDefaultWidth,
} from './watchPanel';

export function StudioWatch({
  watch,
  run,
  stepping,
  readBack,
  names,
  onStop,
  stopping = false,
  stopRefusal = null,
  onStopAnyway,
  onPlayInGame,
  width = null,
  onResize,
}: {
  watch: WatchedRun;
  run: RunWatch;
  /** One step from the Layout; absent offers none. */
  stepping?: Pick<StudioStep, 'busy' | 'refusal' | 'fight'>;
  readBack: ReadBack | null;
  names?: ReadonlyMap<string, string>;
  /** Leaves the run, then stops watching (rpg-project#1008). */
  onStop(): void;
  /** The leave is in flight. */
  stopping?: boolean;
  /** The leave was refused, in the server's words. */
  stopRefusal?: string | null;
  /** Stops watching without leaving: the run stays open. */
  onStopAnyway?: () => void;
  /** Routes this tab to the game on the watched run; absent when the
   * studio has no route into the game. */
  onPlayInGame?: () => void;
  /** The panel's width the viewer chose; null is the default. */
  width?: number | null;
  /** The viewer resized the panel; null returns it to the default. */
  onResize?: (width: number | null) => void;
}): React.JSX.Element {
  const { view, step, setStep, feed, upTo, selected } = run;
  const steps = view.steps;
  const last = steps.length - 1;
  const at = step ?? last;
  const member = selected ? view.members[selected] : undefined;
  const machines = useMemo(
    () => (member ? machinesRunBy(readBack, member) : []),
    [readBack, member]
  );
  const memberFeed = useMemo<RecordFeedSnapshot>(
    () => ({
      ...feed,
      rows: member ? rowsAbout(feed.rows.slice(0, upTo), member.id) : [],
    }),
    [feed, member, upTo]
  );
  const shownStep = steps[at];
  /** A step's refusal belongs to the Live step: stepped back in history,
   * the panel shows that step's record only. */
  const live = step === null ? stepping : undefined;
  /** Every line said up to the shown step, newest last, from every speaker
   * the record has. */
  const said = useMemo(() => speechOf(feed.rows, upTo), [feed.rows, upTo]);
  /** This step's own bumps: who held the way. */
  const barred = useMemo(
    () => barredOf(feed.rows, upTo, run.from),
    [feed.rows, upTo, run.from]
  );
  const seatName = names?.get(watch.member) ?? watch.member;
  const memberName = member ? (names?.get(member.id) ?? member.id) : '';
  return (
    <aside
      className="es-watch wb-panel"
      aria-label="Watching a run"
      data-testid="studio-watch"
    >
      {onResize && <WatchResize width={width} onResize={onResize} />}
      <div className="es-watch-top">
        <header className="es-watch-header">
          <h3>Watching a run · {seatName}</h3>
          <div className="es-buttons">
            {onPlayInGame && (
              <button type="button" onClick={onPlayInGame}>
                Play in the game
              </button>
            )}
            <button type="button" disabled={stopping} onClick={onStop}>
              {stopping ? 'Leaving the run…' : 'Stop watching'}
            </button>
            {stopRefusal && onStopAnyway && (
              <button type="button" onClick={onStopAnyway}>
                Stop watching anyway
              </button>
            )}
          </div>
          {stopRefusal && (
            <p role="alert" className="es-warning">
              {stopRefusal}
              {onStopAnyway &&
                ' Stop watching anyway keeps the run open, and its character stays seated in it.'}
            </p>
          )}
          <p className="es-help">
            {stepping
              ? 'At Live, click a marked hex beside your character to step.'
              : 'Move in the game, then press Back to the studio there.'}
          </p>
          <details className="es-watch-section" data-testid="watch-run-details">
            <summary>Run details</summary>
            <p className="es-help">
              Run <code>{watch.session}</code> · seat{' '}
              <code>{watch.member}</code>. The engine runs it; this map draws
              its record.
            </p>
          </details>
        </header>
        <nav
          className="es-buttons es-watch-steps"
          aria-label="Steps of the run"
        >
          <button
            type="button"
            disabled={at <= 0}
            onClick={() => setStep(at - 1)}
          >
            Back
          </button>
          <button
            type="button"
            disabled={step === null || at >= last}
            onClick={() => setStep(at + 1 >= last ? null : at + 1)}
          >
            Forward
          </button>
          <button
            type="button"
            aria-pressed={step === null}
            onClick={() => setStep(null)}
          >
            Live
          </button>
          <span role="status" className="es-help" data-testid="watch-step">
            {step === null ? 'Live · ' : ''}
            {at === 0 || !shownStep
              ? 'the start'
              : `step ${at} of ${last}: ${shownStep.verb} by ${names?.get(shownStep.actor) ?? shownStep.actor} · r${String(shownStep.at)}`}
          </span>
        </nav>
        <section
          className="es-watch-this-step"
          aria-label="What happened this step"
          data-testid="watch-this-step"
        >
          {stepping?.busy && (
            <p className="es-help" role="status" data-testid="watch-step-busy">
              Stepping…
            </p>
          )}
          {live?.refusal && (
            <p
              className="es-watch-refusal"
              role="alert"
              data-testid="watch-step-refusal"
            >
              Your step was stopped: {live.refusal}
            </p>
          )}
          {live?.fight && (
            <p className="es-help" role="status" data-testid="watch-step-fight">
              {FIGHT_MOVES_IN_THE_GAME}
              {onPlayInGame ? ' Press Play in the game above.' : ''}
            </p>
          )}
          {barred.map((b) => (
            <p
              key={b.index}
              className="es-watch-barred"
              data-testid="watch-barred"
            >
              {barredLine(b, names)}
            </p>
          ))}
        </section>
        {run.agedOut && (
          <p className="es-help" role="status" data-testid="watch-aged-out">
            Earlier steps are no longer in the record; showing the earliest step
            it still holds.
          </p>
        )}
        {feed.notice && (
          <p className="es-help" role="status">
            {feed.notice}
          </p>
        )}
        <details
          className="es-watch-section"
          open
          aria-label="What was said"
          data-testid="watch-said"
        >
          <summary>
            <h4>What was said</h4>
          </summary>
          {said.length === 0 ? (
            <p className="es-help">Nothing said yet.</p>
          ) : (
            <ol className="es-watch-said">
              {said.map((line) => (
                <li key={line.utterance} data-utterance={line.utterance}>
                  {runSpeechLine(line, names)}
                </li>
              ))}
            </ol>
          )}
        </details>
        {!member ? (
          <p className="es-help">
            {feed.rows.length === 0
              ? 'No record beats yet. Play in the game to start the clock.'
              : 'Select a creature on the map to see its machine and why it changed.'}
          </p>
        ) : (
          <details
            className="es-watch-section"
            open
            aria-label={`Creature ${memberName}`}
            data-testid="watch-creature"
          >
            <summary>
              <h4>
                {memberName}
                {member.state && (
                  <>
                    {' '}
                    · <span data-testid="watch-state">{member.state}</span>
                  </>
                )}
              </h4>
            </summary>
            {member.lastReason && (
              <p className="es-help">Last change: {member.lastReason}</p>
            )}
            {machines.map((machine) => (
              <div key={machine.routine} data-live-state={machine.live ?? ''}>
                <p className="es-help">
                  Runs <code>{machine.routine}</code>
                  {machine.live
                    ? ''
                    : ' · its state now is not one of this drawing’s boxes'}
                </p>
                <FittedMachine width={machine.layout.width}>
                  <MachineDrawing
                    routine={machine.routine}
                    layout={machine.layout}
                    selected={machine.live}
                    onSelect={() => {}}
                  />
                </FittedMachine>
              </div>
            ))}
            {!member.party && machines.length === 0 && (
              <p className="es-help">
                {readBack
                  ? 'The engine says no machine this creature runs.'
                  : 'The engine has not said the machines yet.'}
              </p>
            )}
          </details>
        )}
      </div>
      {member && (
        <details
          className="es-watch-section es-watch-trace"
          open
          aria-label={`Trace of ${memberName}`}
          data-testid="watch-trace"
        >
          <summary>
            <h4>Trace</h4>
          </summary>
          <RecordPanel feed={memberFeed} />
        </details>
      )}
    </aside>
  );
}

/** A machine drawing as wide as the panel allows: its own size when it
 * fits, scaled down to fit while it stays readable (`machineFit`), else its
 * own size with a scroll. */
function FittedMachine({
  width,
  children,
}: {
  width: number;
  children: React.ReactNode;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setRoom(element.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setRoom(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const fit = machineFit(width, room);
  return (
    <div ref={ref} className={`es-watch-machine es-watch-machine-${fit}`}>
      {children}
    </div>
  );
}

/** The panel's left edge: drag it, or focus it and use the arrows, to give
 * the panel room; double-click returns to the default. A drag previews
 * through `--es-watch-width` on the canvas and commits on release. */
function WatchResize({
  width,
  onResize,
}: {
  width: number | null;
  onResize(width: number | null): void;
}): React.JSX.Element {
  const drag = useRef<{ pointer: number; x: number; width: number } | null>(
    null
  );
  const windowWidth = (): number =>
    typeof window === 'undefined' ? 1920 : window.innerWidth;
  const now = (element: Element): number =>
    width ??
    (element.closest('.es-watch') as HTMLElement | null)?.offsetWidth ??
    watchDefaultWidth(windowWidth());
  const widthAt = (clientX: number): number =>
    drag.current
      ? clampWatchWidth(
          drag.current.width + drag.current.x - clientX,
          windowWidth()
        )
      : (width ?? watchDefaultWidth(windowWidth()));
  const preview = (element: Element, next: number | null): void => {
    const canvas = element.closest('.es-canvas') as HTMLElement | null;
    if (!canvas) return;
    if (next === null) canvas.style.removeProperty('--es-watch-width');
    else canvas.style.setProperty('--es-watch-width', `${next}px`);
  };
  return (
    <div
      className="es-watch-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the watch panel"
      aria-valuenow={width ?? undefined}
      aria-valuemin={WATCH_MIN_WIDTH}
      tabIndex={0}
      title="Drag to resize the panel; double-click to reset"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = {
          pointer: event.pointerId,
          x: event.clientX,
          width: now(event.currentTarget),
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current?.pointer !== event.pointerId) return;
        if ((event.buttons & 1) === 0) {
          drag.current = null;
          preview(event.currentTarget, width);
          return;
        }
        preview(event.currentTarget, widthAt(event.clientX));
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointer !== event.pointerId) return;
        const next = widthAt(event.clientX);
        drag.current = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        onResize(next);
      }}
      onPointerCancel={(event) => {
        if (drag.current?.pointer !== event.pointerId) return;
        drag.current = null;
        preview(event.currentTarget, width);
      }}
      onDoubleClick={() => onResize(null)}
      onKeyDown={(event) => {
        const by =
          event.key === 'ArrowLeft'
            ? WATCH_WIDTH_STEP
            : event.key === 'ArrowRight'
              ? -WATCH_WIDTH_STEP
              : 0;
        if (!by) return;
        event.preventDefault();
        onResize(clampWatchWidth(now(event.currentTarget) + by, windowWidth()));
      }}
    />
  );
}
