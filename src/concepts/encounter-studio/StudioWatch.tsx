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
 * SAVE A RUN, OPEN IT AGAIN (#1013): "Save this run" reads the whole
 * record from the server and downloads it with a snapshot of the draft
 * (`savedRun.ts`); Stop watching offers to save first, since the record
 * cannot be read once the seat has left. A saved run opens into this same
 * panel READ-ONLY (`replay`): no Live, no stepping, no Play in the game.
 *
 * DEV MODE ONLY: the record is the diagnostic stream the server serves only
 * in development. Elsewhere the control is disabled and says why.
 */
import { RecordPanel } from '@/components/session/combat-experience/RecordPanel';
import { type RecordFeedSnapshot } from '@/components/session/recordFeed';
import type { ReadBack } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MachineDrawing } from './MachineDrawing';
import { shortHash, type RunIdentity } from './runIdentity';
import { runSpeechLine } from './runSpeech';
import { rowsAbout, runStateLabel, speechOf, stepSightOf } from './runView';
import { machinesRunBy, type RunWatch, type WatchedRun } from './runWatch';
import { StudioDialog } from './StudioDialog';
import { useMachineWords } from './useMachineWords';
import { FIGHT_MOVES_IN_THE_GAME, type StudioStep } from './useStudioStep';
import {
  clampWatchWidth,
  machineFit,
  WATCH_MIN_WIDTH,
  WATCH_WIDTH_STEP,
  watchDefaultWidth,
} from './watchPanel';
import { SIGHT_LINES_SHOWN, sightLinesOf, sightTextOf } from './watchSight';
import { stopLinesOf } from './watchStop';

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
  save,
  replay,
  identity,
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
  /** Save this run (#1013); absent offers none. */
  save?: WatchSave;
  /** A saved run, opened read-only (#1013): the panel draws it with no
   * Live, no stepping and no way into the game. */
  replay?: WatchReplay;
  /** What the watched run is a run of (rpg-project#1017), and its one
   * comparison line with the open encounter; absent says nothing. */
  identity?: WatchIdentity;
}): React.JSX.Element {
  const { view, step, setStep, feed, upTo, selected } = run;
  const steps = view.steps;
  const last = steps.length - 1;
  const at = step ?? last;
  const member = selected ? view.members[selected] : undefined;
  // The engine's machine words, the same answer the Behaviours drawing has
  // (rpg-project#1015): the drawings re-lay when it arrives.
  const { words: machineWords } = useMachineWords();
  const machines = useMemo(
    () => (member ? machinesRunBy(readBack, member, machineWords) : []),
    [readBack, member, machineWords]
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
  const live = step === null && !replay ? stepping : undefined;
  /** Stop watching asked to save first: the inline choice is open. */
  const [stopChoice, setStopChoice] = useState(false);
  const pressStop = (): void => {
    if (save?.unsaved) setStopChoice(true);
    else onStop();
  };
  const saveAndStop = async (): Promise<void> => {
    if (!save || !(await save.onSave())) return;
    setStopChoice(false);
    onStop();
  };
  /** Every line said up to the shown step, newest last, from every speaker
   * the record has. */
  const said = useMemo(() => speechOf(feed.rows, upTo), [feed.rows, upTo]);
  /** This step's own stops, from the record: who held the way (`barred`)
   * and who addressed whom (`addressed`). */
  const stops = useMemo(
    () => stopLinesOf(feed.rows, run.from, upTo, names),
    [feed.rows, upTo, run.from, names]
  );
  /** This step's sight, from the record's `sighted` beats that name their
   * observer (rpg-project#1016): who came into and left whose view. */
  const stepSight = useMemo(
    () => stepSightOf(feed.rows, upTo, run.from),
    [feed.rows, upTo, run.from]
  );
  const sightLines = useMemo(
    () => sightLinesOf(stepSight, names),
    [stepSight, names]
  );
  const memberSight = member
    ? stepSight.find((s) => s.observer === member.id)
    : undefined;
  const memberLabel = member ? runStateLabel(member) : '';
  const [traceOpen, setTraceOpen] = useState(false);
  /** A selected creature's section comes into view without hunting. */
  const creatureRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!member?.id) return;
    creatureRef.current?.scrollIntoView?.({
      block: 'start',
      behavior: 'smooth',
    });
  }, [member?.id]);
  const stepLine = `${step === null && !replay ? 'Live · ' : ''}${
    at === 0 || !shownStep
      ? 'the start'
      : `step ${at} of ${last}: ${shownStep.verb} by ${names?.get(shownStep.actor) ?? shownStep.actor} · r${String(shownStep.at)}`
  }`;
  const stepControls = (testId: string) => (
    <nav className="es-buttons es-watch-steps" aria-label="Steps of the run">
      <button type="button" disabled={at <= 0} onClick={() => setStep(at - 1)}>
        Back
      </button>
      <button
        type="button"
        disabled={step === null || at >= last}
        onClick={() => setStep(at + 1 >= last ? null : at + 1)}
      >
        Forward
      </button>
      {!replay && (
        <button
          type="button"
          aria-pressed={step === null}
          onClick={() => setStep(null)}
        >
          Live
        </button>
      )}
      <span role="status" className="es-help" data-testid={testId}>
        {stepLine}
      </span>
    </nav>
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
      <div className="es-watch-fixed">
        {replay ? (
          <header className="es-watch-header" data-testid="watch-replay">
            <h3>
              Saved run · {replay.name} · saved {replay.savedAt}
            </h3>
            <div className="es-buttons">
              <button type="button" onClick={replay.onClose}>
                Close
              </button>
            </div>
            {replay.notes.map((note, i) => (
              <p
                key={i}
                className="es-warning"
                role="status"
                data-testid="watch-replay-note"
              >
                {note}
              </p>
            ))}
            <p className="es-help">
              A saved run of {seatName}: Back and Forward walk it. Nothing here
              reaches the server.
            </p>
            <details
              className="es-watch-section"
              data-testid="watch-run-details"
            >
              <summary>Run details</summary>
              <RunIdentityLine run={replay.identity ?? null} />
            </details>
          </header>
        ) : (
          <header className="es-watch-header">
            <h3>Watching a run · {seatName}</h3>
            <div className="es-buttons">
              {onPlayInGame && (
                <button type="button" onClick={onPlayInGame}>
                  Play in the game
                </button>
              )}
              {save && (
                <button
                  type="button"
                  disabled={save.saving}
                  onClick={() => void save.onSave()}
                  title="Download the whole run, and what is needed to draw it, as one file"
                >
                  {save.saving ? 'Saving…' : 'Save this run'}
                </button>
              )}
              <button
                type="button"
                disabled={stopping || stopChoice}
                onClick={pressStop}
              >
                {stopping ? 'Leaving the run…' : 'Stop watching'}
              </button>
              {stopRefusal && onStopAnyway && (
                <button type="button" onClick={onStopAnyway}>
                  Stop watching anyway
                </button>
              )}
            </div>
            {stopChoice && save && (
              <div
                className="es-buttons"
                role="group"
                aria-label="Save before you stop?"
                data-testid="watch-stop-choice"
              >
                <span className="es-help">
                  This run has beats you have not saved; once the seat leaves,
                  the record cannot be read.
                </span>
                <button
                  type="button"
                  disabled={save.saving}
                  onClick={() => void saveAndStop()}
                >
                  Save and stop
                </button>
                <button
                  type="button"
                  disabled={save.saving}
                  onClick={() => {
                    setStopChoice(false);
                    onStop();
                  }}
                >
                  Stop without saving
                </button>
                <button
                  type="button"
                  disabled={save.saving}
                  onClick={() => setStopChoice(false)}
                >
                  Cancel
                </button>
              </div>
            )}
            {save?.error && (
              <p
                role="alert"
                className="es-warning"
                data-testid="watch-save-error"
              >
                {save.error}
              </p>
            )}
            {save?.notice && (
              <p
                role="status"
                className="es-warning"
                data-testid="watch-save-notice"
              >
                {save.notice}
              </p>
            )}
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
            <details
              className="es-watch-section"
              data-testid="watch-run-details"
            >
              <summary>Run details</summary>
              <p className="es-help">
                Run <code>{watch.session}</code> · seat{' '}
                <code>{watch.member}</code>. The engine runs it; this map draws
                its record.
              </p>
              <RunIdentityLine run={identity?.run ?? null} />
            </details>
            {identity?.line && (
              <p
                className={identity.notable ? 'es-warning' : 'es-help'}
                role="status"
                data-testid="watch-identity-line"
              >
                {identity.line}
              </p>
            )}
          </header>
        )}
        {stepControls('watch-step')}
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
          {stops.map((line, i) => (
            <p key={i} className="es-watch-barred" data-testid="watch-barred">
              {line}
            </p>
          ))}
          {sightLines.length > 0 &&
            sightLines.length <= SIGHT_LINES_SHOWN &&
            sightLines.map((line, i) => (
              <p key={i} className="es-watch-sight" data-testid="watch-sight">
                {line}
              </p>
            ))}
          {sightLines.length > SIGHT_LINES_SHOWN && (
            <details className="es-watch-sight" data-testid="watch-sight-many">
              <summary>
                Sight changed for{' '}
                {
                  stepSight.filter(
                    (s) => s.gained.length > 0 || s.lost.length > 0
                  ).length
                }{' '}
                creatures
              </summary>
              {sightLines.map((line, i) => (
                <p key={i} data-testid="watch-sight">
                  {line}
                </p>
              ))}
            </details>
          )}
        </section>
      </div>
      <div className="es-watch-top">
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
              ? replay
                ? 'This saved run holds no beats.'
                : 'No record beats yet. Play in the game to start the clock.'
              : 'Select a creature on the map to see its machine and why it changed.'}
          </p>
        ) : (
          <details
            ref={creatureRef}
            className="es-watch-section"
            open
            aria-label={`Creature ${memberName}`}
            data-testid="watch-creature"
          >
            <summary>
              <h4>
                {memberName}
                {memberLabel && (
                  <>
                    {' '}
                    · <span data-testid="watch-state">{memberLabel}</span>
                  </>
                )}
              </h4>
            </summary>
            {member.lastReason && (
              <p className="es-help">Last change: {member.lastReason}</p>
            )}
            {Object.entries(member.roleStates ?? {}).map(([role, rs]) => (
              <p key={role} className="es-help" data-testid="watch-role">
                Role <code>{role}</code>
                {rs.recipe ? (
                  <>
                    {' '}
                    (<code>{rs.recipe}</code>)
                  </>
                ) : null}
                : {rs.state}
                {rs.reason ? ` · last change: ${rs.reason}` : ''}
              </p>
            ))}
            {member.sees && (
              <p className="es-help" data-testid="watch-sees">
                {feed.notice
                  ? 'Sees, from the steps the record holds: '
                  : 'Sees: '}
                {member.sees.length > 0
                  ? member.sees.map((id) => names?.get(id) ?? id).join(', ')
                  : 'no one'}
              </p>
            )}
            {memberSight && sightTextOf(memberSight, names) && (
              <p className="es-help" data-testid="watch-sight-step">
                This step: {sightTextOf(memberSight, names)}
              </p>
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
            <h4>Trace</h4>{' '}
            <button
              type="button"
              className="es-watch-expand"
              onClick={(e) => {
                e.preventDefault();
                setTraceOpen(true);
              }}
              data-testid="watch-trace-expand"
            >
              Expand
            </button>
          </summary>
          <RecordPanel feed={memberFeed} />
        </details>
      )}
      {member && traceOpen && (
        <StudioDialog
          title={`Trace of ${memberName}`}
          onClose={() => setTraceOpen(false)}
          host={
            typeof document === 'undefined'
              ? null
              : document.querySelector('.encounter-studio')
          }
          className="es-dialog-trace"
          testId="watch-trace-dialog"
        >
          <div className="es-dialog-trace-steps">
            {stepControls('watch-trace-step')}
          </div>
          <div className="es-dialog-body wb-panel">
            <RecordPanel feed={memberFeed} />
          </div>
        </StudioDialog>
      )}
    </aside>
  );
}

/** Save this run, as the workspace offers it. */
export interface WatchSave {
  /** Reads the whole record and downloads it; false when it could not. */
  onSave(): Promise<boolean>;
  saving: boolean;
  /** The last save's failure, as a sentence. */
  error: string | null;
  /** The last save wrote a file that does not hold the whole run. */
  notice?: string | null;
  /** The run has beats since it was last saved. */
  unsaved: boolean;
}

/** What a watched run is a run of, and how it compares with the open
 * encounter (rpg-project#1017). */
export interface WatchIdentity {
  run: RunIdentity | null;
  /** The one comparison line. */
  line: string;
  /** The line says the run is not of the open encounter as it is now. */
  notable: boolean;
}

/** The run's `scene_content` in one line: its encounter key, engine and
 * short content hash; a line saying it has none when it carries none. */
function RunIdentityLine({
  run,
}: {
  run: RunIdentity | null;
}): React.JSX.Element {
  return (
    <p className="es-help" data-testid="watch-run-identity">
      {run ? (
        <>
          Encounter <code>{run.key || 'unnamed'}</code> · engine{' '}
          <code>{run.engine || 'unknown'}</code> · content{' '}
          <code title={run.contentHash}>
            {run.contentHash ? shortHash(run.contentHash) : 'no hash'}
          </code>
        </>
      ) : (
        'The record does not name its encounter.'
      )}
    </p>
  );
}

/** A saved run, opened read-only. */
export interface WatchReplay {
  /** The file's name. */
  name: string;
  /** When it was saved, in words. */
  savedAt: string;
  /** What the operator must know before trusting the drawing: the draft
   * differs, or the file carried no snapshot. */
  notes: string[];
  /** The run's `scene_content` (rpg-project#1017); null when it has none. */
  identity?: RunIdentity | null;
  onClose(): void;
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
