/**
 * BEHAVIOURS (rpg-project#970): every behaviour the file defines, as the
 * engine says it. The read-back's "Routines" section holds one group per
 * definition (about `{routine, id}`); its own statement connects
 * `{creature, id, runs}` for each creature that runs it, and the fold says
 * it in one line. The list shows that line and those creatures, each a
 * jump; a selected behaviour opens to its Read back. Building or editing a
 * behaviour is not here: a creature is given one in its inspector.
 *
 * WHO RUNS IT is the engine's `runs` connections, as said: a creature whose
 * faction supplies its behaviour is listed when, and as, the engine says it
 * runs it. The studio infers no runner of its own.
 */
import type { ReadBackGroup } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { connectionJump } from './engineReadBack';
import { ReadBack, STALE_READ_BACK_SENTENCE } from './ReadBack';
import type { RefusalTarget } from './refusalJump';
import type { StudioReadBack } from './studioPublishing';

const ROUTINE = 'routine';
const RUNS = 'runs';
const NO_BEHAVIOURS_SENTENCE = 'The engine has not said the behaviours yet.';

export function StudioBehaviours({
  document,
  readBack,
  focus,
  onSelect,
  onJump,
  onOpenFact,
}: {
  document: Readonly<RoomDraftDocument>;
  readBack: StudioReadBack;
  /** The selected behaviour's id. */
  focus: string | null;
  onSelect(id: string): void;
  onJump?(target: RefusalTarget): void;
  onOpenFact?(id: string, hub?: string): void;
}): React.JSX.Element {
  const said = readBack.readBack;
  const groups: ReadBackGroup[] = (said?.sections ?? []).flatMap((section) =>
    section.groups.filter((group) => group.about?.kind === ROUTINE)
  );
  const folds = (said?.folded ?? []).flatMap((section) => section.items);
  const foldOf = (group: ReadBackGroup): string => {
    const own = group.statements[0];
    const item = own
      ? folds.find((entry) => entry.paths.includes(own.path))
      : undefined;
    return item?.text ?? own?.sentence ?? '';
  };
  const notice = !said
    ? `${NO_BEHAVIOURS_SENTENCE}${readBack.unavailable ? ` ${readBack.unavailable}` : ''}`
    : readBack.readBackIsCurrent
      ? null
      : STALE_READ_BACK_SENTENCE;
  return (
    <section className="es-behaviours wb-panel" aria-label="Behaviours">
      <h2>Behaviours</h2>
      {notice && (
        <p role="status" className="es-help es-readback-notice">
          {notice}
        </p>
      )}
      <div className="es-threads-body">
        <ul aria-label="Behaviours" className="es-threads-list">
          {groups.map((group) => {
            const id = group.about!.id;
            const runners = (group.statements[0]?.connects ?? []).filter(
              (c) => c.role === RUNS
            );
            return (
              <li key={id} data-routine={id}>
                <button
                  type="button"
                  aria-pressed={focus === id}
                  onClick={() => onSelect(id)}
                >
                  <span className="es-threads-id">{id}</span>
                </button>
                <p className="es-help">{foldOf(group)}</p>
                {runners.length > 0 && (
                  <div className="es-readback-links" data-role="runs">
                    <span className="es-help">Run by</span>
                    {runners.map((runner) => {
                      const jump = connectionJump(runner, document);
                      const name = `${runner.kind} ${runner.id}`;
                      return jump?.kind === 'target' && onJump ? (
                        <button
                          key={name}
                          type="button"
                          className="es-link es-readback-ref"
                          aria-label={`Open ${name}`}
                          onClick={() => onJump(jump.target)}
                        >
                          {name}
                        </button>
                      ) : (
                        <span key={name} className="es-readback-ref">
                          {name}
                        </span>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {focus && said && (
          <div className="es-threads-thread" data-behaviour={focus}>
            <ReadBack
              document={document}
              selection={{ kind: ROUTINE, id: focus }}
              state={readBack}
              onJump={onJump}
              onOpenFact={onOpenFact}
            />
          </div>
        )}
      </div>
    </section>
  );
}
