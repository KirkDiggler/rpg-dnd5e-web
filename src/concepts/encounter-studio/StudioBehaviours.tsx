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
 *
 * SET A MACHINE (rpg-project#996): a marked state's box opens the detail
 * pane on two tabs, Read back (as before) and Edit, where the state's steps
 * are set (`MachineStateEdit`). Each change is one undoable commit of the
 * whole definition; the engine checks it and the drawing and read-back
 * follow.
 */
import type { ReadBackGroup } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useMemo, useState } from 'react';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { connectionJump } from './engineReadBack';
import { MachineDrawing, type MarkRefusal } from './MachineDrawing';
import {
  definitionOf,
  machineStepKey,
  statesOf,
  stepRefusalsOf,
  transitionPath,
  transitionsOf,
} from './machineEdit';
import {
  boxName,
  layoutMachine,
  machineMarkedKey,
  machineMarkKey,
  markOfStatement,
  pieceName,
  statementsOfMark,
} from './machineLayout';
import { MachineStateEdit, type DefinitionEdit } from './MachineStateEdit';
import { machineOf } from './machineView';
import type { MachineWords } from './machineWords';
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
  onCommitDefinition,
  machineWords = null,
  refusals = [],
}: {
  document: Readonly<RoomDraftDocument>;
  readBack: StudioReadBack;
  /** The selected behaviour's id. */
  focus: string | null;
  onSelect(id: string): void;
  onJump?(target: RefusalTarget, path?: string): void;
  onOpenFact?(id: string, hub?: string): void;
  /** Set one behaviour definition whole, one undoable commit
   * (rpg-project#996). Without it the pane has no Edit tab. */
  onCommitDefinition?(id: string, edit: DefinitionEdit): boolean;
  /** The engine's machine words (`useMachineWords`), for the drawing's
   * plain labels; null draws its ids as before (rpg-project#1015). */
  machineWords?: MachineWords | null;
  /** The engine's current refusals (rpg-project#1018): those at a step of
   * the selected machine mark its row in Edit and its box or arrow. */
  refusals?: readonly { path: string; message: string }[];
}): React.JSX.Element {
  const said = readBack.readBack;
  const machine = useMemo(() => {
    if (!said || !focus) return null;
    const view = machineOf(said, focus);
    if (!view) return null;
    const layout = layoutMachine(view, machineWords);
    return { layout, markOf: markOfStatement(layout) };
  }, [said, focus, machineWords]);
  // The mark belongs to the behaviour it was made on; another behaviour
  // starts unmarked.
  const [chosenMark, setChosenMark] = useState<{
    routine: string;
    id: string;
    /** The step's statement the mark was made from (a staying step's
     * sentence), so Edit lands on its card. */
    path?: string;
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
  const markIt = (
    id: string,
    from: 'drawing' | 'sentence',
    path?: string
  ): void => {
    if (!focus) return;
    setChosenMark({ routine: focus, id, path });
    reveal(
      from === 'drawing' ? machineMarkedKey(focus) : machineMarkKey(focus, id)
    );
  };
  const markedBox = machine?.layout.boxes.find((box) => box.id === mark);
  const markedPiece = machine?.layout.pieces.find((piece) => piece.id === mark);
  // The Edit tab belongs to the box it was opened on; another mark starts
  // on Read back.
  const [editing, setEditing] = useState<string | null>(null);
  const definition = focus ? definitionOf(document.scope, focus) : undefined;
  // What Edit opens on: a marked box's state; a marked arrow's first step's
  // state, at that step's card (rpg-project#1018); a box marked from a
  // staying step's sentence, at that step's card.
  const stepAt = (path: string | undefined) =>
    path && focus
      ? (stepRefusalsOf([{ path, message: '' }], focus)[0] ?? null)
      : null;
  const target: { state: string; step: number | null } | null = markedBox
    ? {
        state: markedBox.state.id,
        step:
          stepAt(chosenMark?.path)?.state === markedBox.state.id
            ? stepAt(chosenMark?.path)!.index
            : null,
      }
    : markedPiece
      ? (() => {
          const at = stepAt(markedPiece.steps[0]?.statement.path);
          return at ? { state: at.state, step: at.index } : null;
        })()
      : null;
  const editable =
    target &&
    definition &&
    onCommitDefinition &&
    focus &&
    // A state the file no longer declares (an Undo, an outside change) has
    // nothing to edit: its box is the read-back's until the engine checks
    // again, so it offers Read back alone.
    statesOf(definition).includes(target.state)
      ? target
      : null;
  const editOpen = editable !== null && editing === `${focus}|${mark}`;
  // A REFUSED STEP IS MARKED (rpg-project#1018): on its row in Edit and on
  // its arrow (a moving step) or its box (a staying step, or a step the
  // drawing does not have yet: the drawing is the last read-back that
  // compiled). The mark opens the state's Edit tab at the step's row.
  const stepRefusals = focus ? stepRefusalsOf(refusals, focus) : [];
  const markRefusals = new Map<string, MarkRefusal[]>();
  if (machine && focus)
    for (const r of stepRefusals) {
      const path = transitionPath(focus, r.state, r.index);
      // The drawing is the last read-back that compiled; the refusal's
      // index is the current text's. The arrow is marked only while the
      // drawn step at that path is still the document's (same beat, same
      // target); else the state's box is.
      const written = definition
        ? (transitionsOf(definition, r.state)[r.index] as
            | { on?: unknown; to?: unknown }
            | undefined)
        : undefined;
      const piece = machine.layout.pieces.find((p) =>
        p.steps.some(
          (step) =>
            step.statement.path === path &&
            written !== undefined &&
            step.beat === written.on &&
            step.to ===
              (typeof written.to === 'string' && written.to !== r.state
                ? written.to
                : null)
        )
      );
      const box = machine.layout.boxes.find((b) => b.state.id === r.state);
      const id = piece?.id ?? box?.id;
      if (!id) continue;
      markRefusals.set(id, [...(markRefusals.get(id) ?? []), r]);
    }
  const openRefused = (state: string, index: number): void => {
    const box = machine?.layout.boxes.find((b) => b.state.id === state);
    if (!focus || !box) return;
    setChosenMark({ routine: focus, id: box.id });
    setEditing(`${focus}|${box.id}`);
    reveal(machineStepKey(focus, state, index));
  };
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
    <section
      className="es-behaviours wb-panel"
      aria-label="Behaviours"
      data-drawn={machine && focus ? '' : undefined}
    >
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
          refused={markRefusals}
          onOpenRefused={openRefused}
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
              {editable && (
                <div
                  role="tablist"
                  aria-label={`State ${editable.state}`}
                  className="es-machine-tabs"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!editOpen}
                    onClick={() => setEditing(null)}
                  >
                    Read back
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={editOpen}
                    onClick={() => {
                      setEditing(`${focus}|${mark}`);
                      if (editable.step !== null)
                        reveal(
                          machineStepKey(focus, editable.state, editable.step)
                        );
                    }}
                  >
                    Edit
                  </button>
                </div>
              )}
              {editOpen && editable && definition && onCommitDefinition ? (
                <div role="tabpanel" aria-label={`Edit ${editable.state}`}>
                  <MachineStateEdit
                    routine={focus}
                    state={editable.state}
                    definition={definition}
                    readBack={said}
                    readBackIsCurrent={readBack.readBackIsCurrent}
                    onCommit={(edit) => onCommitDefinition(focus, edit)}
                    onJump={onJump}
                    words={machineWords}
                    refusals={stepRefusals.filter(
                      (r) => r.state === editable.state
                    )}
                  />
                </div>
              ) : (
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
                            if (id) markIt(id, 'sentence', statement.path);
                          },
                        }
                      : undefined
                  }
                />
              )}
            </div>
          ) : null
        }
      />
    </section>
  );
}
