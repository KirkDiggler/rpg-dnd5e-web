import type {
  ReadBackStatement,
  ReadBackUnsaid,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import {
  connectionJump,
  readBackOfSelection,
  statementPathJump,
  type ReadBackSelection,
} from './engineReadBack';
import type { RefusalTarget } from './refusalJump';
import type { StudioReadBack } from './studioPublishing';
import { StudioSection } from './StudioSection';

export interface ReadBackProps {
  document: Readonly<RoomDraftDocument>;
  selection: ReadBackSelection;
  /** The engine's read-back of the last draft that compiled, and whether it
   * describes the current one (`studioReadBackOf`). */
  state: StudioReadBack;
  /** Select or open what a connection or a path lands on (the workspace's
   * refusal jump). */
  onJump?(target: RefusalTarget): void;
  /** Open the Facts section on a fact or topic. */
  onOpenFact?(id: string): void;
}

export const STALE_READ_BACK_SENTENCE =
  'These sentences are from the last draft that compiled.';
export const NOT_YET_NAMED_SENTENCE =
  'The engine has not said this thing yet; it appears after the next check that compiles.';
export const NOTHING_SAID_SENTENCE =
  'The engine’s read-back says nothing about this thing.';

/** The selected creature's or prop's read-back, in the ENGINE's sentences
 * (rpg-project#968, R25). The studio alters no sentence and writes none
 * about what will run: its own words here are the notices. Each group is
 * the engine's, under its title; the first is open. */
export function ReadBack({
  document,
  selection,
  state,
  onJump,
  onOpenFact,
}: ReadBackProps): React.JSX.Element {
  const { readBack, readBackIsCurrent, unavailable } = state;
  const selected = readBack
    ? readBackOfSelection(readBack, selection, document)
    : null;
  // A thing placed since the last check that compiled has no sentences yet;
  // the panel stays and says so rather than vanish.
  const unnamed =
    selected !== null &&
    selected.groups.length === 0 &&
    selected.notYetSaid.length === 0;
  const notice = !readBack
    ? `No read-back is available: ${unavailable ?? ''}`.trim()
    : readBackIsCurrent
      ? null
      : STALE_READ_BACK_SENTENCE;
  const key = `${selection.kind}:${selection.id}`;
  return (
    <div className="es-context-panel">
      <StudioSection title="Read back" level="section" className="es-readback">
        {notice && (
          <p role="status" className="es-help es-readback-notice">
            {notice}
          </p>
        )}
        {unnamed && (
          <p role="status" className="es-help es-readback-notice">
            {readBackIsCurrent ? NOTHING_SAID_SENTENCE : NOT_YET_NAMED_SENTENCE}
          </p>
        )}
        {selected?.groups.map((group, index) => (
          <details
            key={`${key}:${group.title}:${index}`}
            className="es-readback-group"
            open={index === 0}
            data-about={
              group.about ? `${group.about.kind}:${group.about.id}` : undefined
            }
          >
            <summary>{group.title}</summary>
            <ol className="es-readback-statements">
              {group.statements.map((statement, at) => (
                <Statement
                  key={at}
                  statement={statement}
                  document={document}
                  selection={selection}
                  current={readBackIsCurrent}
                  onJump={onJump}
                  onOpenFact={onOpenFact}
                />
              ))}
            </ol>
          </details>
        ))}
        {selected && selected.notYetSaid.length > 0 && (
          <NotYetSaid unsaid={selected.notYetSaid} />
        )}
      </StudioSection>
    </div>
  );
}

function Statement({
  statement,
  document,
  selection,
  current,
  onJump,
  onOpenFact,
}: {
  statement: ReadBackStatement;
  document: Readonly<RoomDraftDocument>;
  selection: ReadBackSelection;
  /** False while the sentences are from an earlier draft: a path's index
   * (`factions[2]`, `monsterDeclarations[2]`) may then name another entry
   * of the current document, so the path is shown as text, not a jump.
   * Connections resolve by id and stay jumps. */
  current: boolean;
  onJump?(target: RefusalTarget): void;
  onOpenFact?(id: string): void;
}): React.JSX.Element {
  const seen = new Set<string>();
  const links: React.JSX.Element[] = [];
  for (const connection of statement.connects) {
    const name = `${connection.kind} ${connection.id}`;
    if (seen.has(name)) continue;
    seen.add(name);
    const jump = connectionJump(connection, document);
    if (!jump) continue;
    const go =
      jump.kind === 'fact'
        ? onOpenFact && (() => onOpenFact(jump.id))
        : onJump && (() => onJump(jump.target));
    if (!go) continue;
    links.push(
      <button
        key={name}
        type="button"
        className="es-link es-readback-ref"
        data-ref-kind={connection.kind}
        data-role={connection.role}
        aria-label={`Open ${name}`}
        onClick={go}
      >
        {name}
      </button>
    );
  }
  const pathTarget = onJump
    ? statementPathJump(statement, selection, document)
    : null;
  if (pathTarget && !current)
    links.push(
      <code key="path" className="es-readback-path">
        {statement.path}
      </code>
    );
  else if (pathTarget && onJump)
    links.push(
      <button
        key="path"
        type="button"
        className="es-link es-readback-ref es-readback-path"
        aria-label={`Open ${statement.path}`}
        onClick={() => onJump(pathTarget)}
      >
        <code>{statement.path}</code>
      </button>
    );
  return (
    <li className="es-readback-statement" data-kind={statement.kind}>
      <p>{statement.sentence}</p>
      {links.length > 0 && <div className="es-readback-links">{links}</div>}
    </li>
  );
}

/** What the engine says it cannot yet say about the selection: shown so the
 * sentences are not taken for the whole file. */
function NotYetSaid({
  unsaid,
}: {
  unsaid: readonly ReadBackUnsaid[];
}): React.JSX.Element {
  return (
    <div className="es-readback-unsaid">
      <p className="es-help">Not yet said by the engine:</p>
      <ul>
        {unsaid.map((entry, index) => (
          <li key={index}>
            <code>{entry.path}</code> ({entry.kind}): {entry.why}
          </li>
        ))}
      </ul>
    </div>
  );
}
