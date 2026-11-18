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
 * DRIVING THE PARTY is done in the game, in a second tab, on the same run:
 * the game's Move needs its whole interaction stack (the atlas path index,
 * the turn clock's declaration, the walk's reconciliation), so the studio
 * does not grow a second move client. "Open the game" opens the app in a
 * new tab, where resume-after-refresh drops the operator's seat straight
 * into this running encounter.
 *
 * DEV MODE ONLY: the record is the diagnostic stream the server serves only
 * in development. Elsewhere the control is disabled and says why.
 */
import { RecordPanel } from '@/components/session/combat-experience/RecordPanel';
import type { RecordFeedSnapshot } from '@/components/session/recordFeed';
import type { ReadBack } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useMemo } from 'react';
import { MachineDrawing } from './MachineDrawing';
import { rowsAbout } from './runView';
import {
  gameUrlOf,
  machinesRunBy,
  type RunWatch,
  type WatchedRun,
} from './runWatch';

export function StudioWatch({
  watch,
  run,
  readBack,
  names,
  onStop,
  openGame = () => window.open(gameUrlOf(window.location), '_blank'),
}: {
  watch: WatchedRun;
  run: RunWatch;
  readBack: ReadBack | null;
  names?: ReadonlyMap<string, string>;
  onStop(): void;
  openGame?: () => void;
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
          <button type="button" onClick={openGame}>
            Open the game for this run
          </button>
          <button type="button" onClick={onStop}>
            Stop watching
          </button>
        </div>
        <p className="es-help">
          Move your character in the game tab; the map follows here.
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
      {feed.notice && (
        <p className="es-help" role="status">
          {feed.notice}
        </p>
      )}
      {!member ? (
        <p className="es-help">
          {feed.rows.length === 0
            ? 'No record beats yet. Move in the game tab to start the clock.'
            : 'Select a creature on the map to see its machine and why it changed.'}
        </p>
      ) : (
        <section aria-label={`Creature ${member.id}`}>
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
