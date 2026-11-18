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
 * DEV MODE ONLY: the record is the diagnostic stream the server serves only
 * in development. Elsewhere the control is disabled and says why.
 */
import { RecordPanel } from '@/components/session/combat-experience/RecordPanel';
import type { RecordFeedSnapshot } from '@/components/session/recordFeed';
import type { ReadBack } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useMemo } from 'react';
import { MachineDrawing } from './MachineDrawing';
import { barredLine, runSpeechLine } from './runSpeech';
import { barredOf, rowsAbout, speechOf } from './runView';
import { machinesRunBy, type RunWatch, type WatchedRun } from './runWatch';
import { FIGHT_MOVES_IN_THE_GAME, type StudioStep } from './useStudioStep';

export function StudioWatch({
  watch,
  run,
  stepping,
  readBack,
  names,
  onStop,
  onPlayInGame,
}: {
  watch: WatchedRun;
  run: RunWatch;
  /** One step from the Layout; absent offers none. */
  stepping?: Pick<StudioStep, 'busy' | 'refusal' | 'fight'>;
  readBack: ReadBack | null;
  names?: ReadonlyMap<string, string>;
  onStop(): void;
  /** Routes this tab to the game on the watched run; absent when the
   * studio has no route into the game. */
  onPlayInGame?: () => void;
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
  return (
    <aside
      className="es-watch wb-panel"
      aria-label="Watching a run"
      data-testid="studio-watch"
    >
      <header className="es-watch-header">
        <h3>Watching a run</h3>
        <p className="es-help">
          Run <code>{watch.session}</code> · seat <code>{watch.member}</code>.
          The engine runs it; this map draws its record.
        </p>
        <div className="es-buttons">
          {onPlayInGame && (
            <button type="button" onClick={onPlayInGame}>
              Play in the game
            </button>
          )}
          <button type="button" onClick={onStop}>
            Stop watching
          </button>
        </div>
        <p className="es-help">
          {stepping
            ? 'At Live, click a marked hex next to your character to step there; the map moves when the run’s record says so. Or move in the game, then press Back to the studio there.'
            : 'Move your character in the game, then press Back to the studio there; the map replays what you played.'}
        </p>
      </header>
      <nav className="es-buttons es-watch-steps" aria-label="Steps of the run">
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
      <section aria-label="What was said" data-testid="watch-said">
        <h4>What was said</h4>
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
      {!member ? (
        <p className="es-help">
          {feed.rows.length === 0
            ? 'No record beats yet. Play in the game to start the clock.'
            : 'Select a creature on the map to see its machine and why it changed.'}
        </p>
      ) : (
        <section aria-label={`Creature ${names?.get(member.id) ?? member.id}`}>
          <h4>
            {names?.get(member.id) ?? member.id}
            {member.state && (
              <>
                {' '}
                · <span data-testid="watch-state">{member.state}</span>
              </>
            )}
          </h4>
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
              <MachineDrawing
                routine={machine.routine}
                layout={machine.layout}
                selected={machine.live}
                onSelect={() => {}}
              />
            </div>
          ))}
          {!member.party && machines.length === 0 && (
            <p className="es-help">
              {readBack
                ? 'The engine says no machine this creature runs.'
                : 'The engine has not said the machines yet.'}
            </p>
          )}
          <RecordPanel feed={memberFeed} />
        </section>
      )}
    </aside>
  );
}
