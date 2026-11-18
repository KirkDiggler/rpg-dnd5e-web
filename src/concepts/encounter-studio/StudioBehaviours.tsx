/**
 * BEHAVIOURS (rpg-project#970): every behaviour the file defines, as the
 * engine says it. The read-back's "Routines" section holds one group per
 * definition (about `{routine, id}`); its own statement connects
 * `{creature, id, runs}` for each creature that runs it, and the fold says
 * it in one line. The list shows that line and those creatures, each a
 * jump; a selected behaviour opens to its Read back. Building or editing a
 * behaviour is not here: a creature is given one in its inspector.
 *
 * A BEHAVIOUR NO CREATURE RUNS is not in the compiled encounter, so the
 * engine says it under not-yet-said (kind `routine`, path
 * `behaviorDefinitions.<id>`) with its own reason. It is listed here the
 * same, with that sentence and no "Run by", since the picker still offers it.
 *
 * WHO RUNS IT is the engine's `runs` connections, as said: a creature whose
 * faction supplies its behaviour is listed when, and as, the engine says it
 * runs it. The studio infers no runner of its own.
 *
 * THE MACHINE (rpg-project#995): a selected behaviour's machine is drawn
 * above the list, from the shape the engine says (`machineOf`). Marking a
 * box or an arrow puts its sentences first in the detail pane; a sentence
 * there marks its box or arrow. A read-back that does not say the shape
 * draws nothing, and the list is as it was.
 */
import type { ReadBackGroup } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useMemo, useState } from 'react';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { connectionJump } from './engineReadBack';
import { MachineDrawing } from './MachineDrawing';
import {
  boxName,
  layoutMachine,
  machineMarkedKey,
  machineMarkKey,
  markOfStatement,
  pieceName,
  statementsOfMark,
} from './machineLayout';
import { machineOf } from './machineView';
import { ReadBack, STALE_READ_BACK_SENTENCE } from './ReadBack';
import type { RefusalTarget } from './refusalJump';
import { StudioListDetail } from './StudioListDetail';
import type { StudioReadBack } from './studioPublishing';
import { useReveal } from './useReveal';

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
  onJump?(target: RefusalTarget, path?: string): void;
  onOpenFact?(id: string, hub?: string): void;
}): React.JSX.Element {
  const said = readBack.readBack;
  const machine = useMemo(() => {
    if (!said || !focus) return null;
    const view = machineOf(said, focus);
    if (!view) return null;
    const layout = layoutMachine(view);
    return { layout, markOf: markOfStatement(layout) };
  }, [said, focus]);
  // The mark belongs to the behaviour it was made on; another behaviour
  // starts unmarked.
  const [chosenMark, setChosenMark] = useState<{
    routine: string;
    id: string;
  } | null>(null);
  const mark =
    machine && chosenMark && chosenMark.routine === focus
      ? chosenMark.id
      : null;
  const reveal = useReveal();
  // A mark is a jump: marking on the drawing lands on its sentences in the
  // detail pane, and a sentence's "On the drawing" lands on its box or
  // arrow, each through the studio's one reveal contract (it scrolls the
  // target into view within its own pane and moves focus to it).
  const markIt = (id: string, from: 'drawing' | 'sentence'): void => {
    if (!focus) return;
    setChosenMark({ routine: focus, id });
    reveal(
      from === 'drawing' ? machineMarkedKey(focus) : machineMarkKey(focus, id)
    );
  };
  const markedBox = machine?.layout.boxes.find((box) => box.id === mark);
  const markedPiece = machine?.layout.pieces.find((piece) => piece.id === mark);
  const groups: ReadBackGroup[] = (said?.sections ?? []).flatMap((section) =>
    section.groups.filter((group) => group.about?.kind === ROUTINE)
  );
  const folds = (said?.folded ?? []).flatMap((section) => section.items);
  const unrun = (said?.notYetSaid ?? []).flatMap((unsaid) => {
    const match = /^behaviorDefinitions\.([^.[\]]+)$/.exec(unsaid.path);
    return unsaid.kind === ROUTINE && match
      ? [{ id: match[1]!, why: unsaid.why }]
      : [];
  });
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
      {machine && focus && (
        <MachineDrawing
          routine={focus}
          layout={machine.layout}
          selected={mark}
          onSelect={(id) => markIt(id, 'drawing')}
        />
      )}
      <StudioListDetail
        id="behaviours"
        label="Behaviours"
        groups={[
          {
            rows: [
              ...groups.map((group) => {
                const id = group.about!.id;
                const runners = (group.statements[0]?.connects ?? []).filter(
                  (c) => c.role === RUNS
                );
                return {
                  key: { kind: ROUTINE, id },
                  name: <span className="es-threads-id">{id}</span>,
                  summary: foldOf(group),
                  rowData: { 'data-routine': id },
                  links:
                    runners.length > 0 ? (
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
                    ) : undefined,
                };
              }),
              ...unrun.map(({ id, why }) => ({
                key: { kind: ROUTINE, id },
                name: <span className="es-threads-id">{id}</span>,
                summary: why,
                rowData: { 'data-routine': id, 'data-unrun': '' },
              })),
            ],
          },
        ]}
        selected={focus ? { kind: ROUTINE, id: focus } : null}
        onSelect={(key) => onSelect(key.id)}
        detailLabel="Behaviour"
        detail={
          focus && said ? (
            <div className="es-threads-thread" data-behaviour={focus}>
              <ReadBack
                document={document}
                selection={{ kind: ROUTINE, id: focus }}
                state={readBack}
                onJump={onJump}
                onOpenFact={onOpenFact}
                drawing={
                  machine
                    ? {
                        markedName: markedBox
                          ? boxName(markedBox)
                          : markedPiece
                            ? pieceName(markedPiece)
                            : null,
                        marked: mark
                          ? statementsOfMark(machine.layout, mark)
                          : [],
                        canMark: (statement) => machine.markOf.has(statement),
                        markedKey: machineMarkedKey(focus),
                        onMark: (statement) => {
                          const id = machine.markOf.get(statement);
                          if (id) markIt(id, 'sentence');
                        },
                      }
                    : undefined
                }
              />
            </div>
          ) : null
        }
      />
    </section>
  );
}
