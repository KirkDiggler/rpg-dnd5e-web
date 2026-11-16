import type {
  ReadBackStatement,
  ReadBackUnsaid,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useState } from 'react';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import {
  connectionJump,
  foldedOfSelection,
  landsOn,
  readBackOfSelection,
  type ReadBackSelection,
  type ShownFoldedItem,
} from './engineReadBack';
import { placeName } from './placeName';
import { targetOfPath, type RefusalTarget } from './refusalJump';
import { keyOfPath } from './revealKey';
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
  onJump?(target: RefusalTarget, path?: string): void;
  /** Open the Facts section on a fact or topic. */
  onOpenFact?(id: string, hub?: string): void;
  /** What opens the join a way pointer's way goes through
   * (rpg-project#973), or null when the studio cannot: the pointer is then
   * text. */
  wayOpener?(wayId: string): (() => void) | null;
}

export const STALE_READ_BACK_SENTENCE =
  'These sentences are from the last draft that compiled.';
export const NOT_YET_NAMED_SENTENCE =
  'The engine has not said this thing yet; it appears after the next check that compiles.';
export const NOTHING_SAID_SENTENCE =
  'The engine’s read-back says nothing about this thing.';

/** Where the viewer's Folded / Full choice is remembered, per browser. */
export const READ_BACK_VIEW_STORAGE_KEY = 'encounter-studio.read-back-view';

type ReadBackView = 'folded' | 'full';

function rememberedView(): ReadBackView {
  try {
    return localStorage.getItem(READ_BACK_VIEW_STORAGE_KEY) === 'full'
      ? 'full'
      : 'folded';
  } catch {
    return 'folded';
  }
}

function rememberView(view: ReadBackView): void {
  try {
    localStorage.setItem(READ_BACK_VIEW_STORAGE_KEY, view);
  } catch {
    // No storage: the choice lasts as long as the panel.
  }
}

/** The selected creature's or prop's read-back, in the ENGINE's sentences
 * (rpg-project#968, R25). The studio alters no sentence and writes none
 * about what will run: its own words here are the notices and the view
 * controls. Folded (rpg-project#978) is the engine's folded entries for the
 * selection, each opening to the full sentences it stands for; Full is each
 * engine group under its title, the first open. With no folded read-back on
 * the wire (an older api) the panel is Full. */
export function ReadBack({
  document,
  selection,
  state,
  onJump,
  onOpenFact,
  wayOpener,
}: ReadBackProps): React.JSX.Element {
  const { readBack, readBackIsCurrent, unavailable } = state;
  const [chosenView, setChosenView] = useState<ReadBackView>(rememberedView);
  const choose = (view: ReadBackView): void => {
    setChosenView(view);
    rememberView(view);
  };
  const canFold = readBack !== null && readBack.folded.length > 0;
  const view: ReadBackView = canFold ? chosenView : 'full';
  const selected = readBack
    ? readBackOfSelection(readBack, selection, document)
    : null;
  const foldedView =
    readBack && view === 'folded'
      ? foldedOfSelection(readBack, selection)
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
  const statementProps = {
    document,
    selection,
    current: readBackIsCurrent,
    onJump,
    onOpenFact,
    wayOpener,
  };
  return (
    <div className="es-context-panel">
      <StudioSection title="Read back" level="section" className="es-readback">
        {canFold && (
          <div
            role="group"
            aria-label="Read back view"
            className="es-readback-views"
          >
            {(['folded', 'full'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => choose(option)}
              >
                {option === 'folded' ? 'Folded' : 'Full'}
              </button>
            ))}
          </div>
        )}
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
        {foldedView ? (
          <>
            {foldedView.sections.map((section, index) => (
              <details
                key={`${key}:folded:${section.title}:${index}`}
                className="es-readback-group"
                open={index === 0}
              >
                <summary>{section.title}</summary>
                <ul className="es-readback-folded">
                  {section.items.map((entry, at) => (
                    <FoldedEntry
                      key={at}
                      entry={entry}
                      statementProps={statementProps}
                    />
                  ))}
                </ul>
              </details>
            ))}
            {foldedView.unreached.length > 0 && (
              <div className="es-readback-unreached">
                <p className="es-help">Said in full only:</p>
                <ol
                  aria-label="Said in full only"
                  className="es-readback-statements"
                >
                  {foldedView.unreached.map((statement, at) => (
                    <Statement
                      key={at}
                      statement={statement}
                      {...statementProps}
                    />
                  ))}
                </ol>
              </div>
            )}
          </>
        ) : (
          selected?.groups.map((group, index) => (
            <details
              key={`${key}:${group.title}:${index}`}
              className="es-readback-group"
              open={index === 0}
              data-about={
                group.about
                  ? `${group.about.kind}:${group.about.id}`
                  : undefined
              }
            >
              <summary>{group.title}</summary>
              <ol className="es-readback-statements">
                {group.statements.map((statement, at) => (
                  <Statement
                    key={at}
                    statement={statement}
                    {...statementProps}
                  />
                ))}
              </ol>
            </details>
          ))
        )}
        {selected && selected.notYetSaid.length > 0 && (
          <NotYetSaid unsaid={selected.notYetSaid} document={document} />
        )}
      </StudioSection>
    </div>
  );
}

type StatementProps = Omit<Parameters<typeof Statement>[0], 'statement'>;

/** One folded entry: the engine's text; a control that opens the full
 * sentences it stands for, when it stands for any; its entries beneath. */
function FoldedEntry({
  entry,
  statementProps,
}: {
  entry: ShownFoldedItem;
  statementProps: StatementProps;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const { item, statements, items } = entry;
  return (
    <li className="es-readback-entry" data-folded="">
      <p>{item.text}</p>
      {statements.length > 0 && (
        <button
          type="button"
          className="es-link es-readback-open"
          aria-expanded={open}
          aria-label={`${open ? 'Hide full sentences' : 'Full sentences'}: ${item.text}`}
          onClick={() => setOpen((was) => !was)}
        >
          {open ? 'Hide full sentences' : 'Full sentences'}
        </button>
      )}
      {open && (
        <ol className="es-readback-statements">
          {statements.map((statement, at) => (
            <Statement key={at} statement={statement} {...statementProps} />
          ))}
        </ol>
      )}
      {items.length > 0 && (
        <ul>
          {items.map((child, at) => (
            <FoldedEntry
              key={at}
              entry={child}
              statementProps={statementProps}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function Statement({
  statement,
  document,
  selection,
  current,
  onJump,
  onOpenFact,
  wayOpener,
}: {
  statement: ReadBackStatement;
  document: Readonly<RoomDraftDocument>;
  selection: ReadBackSelection;
  /** False while the sentences are from an earlier draft: a path's index
   * (`factions[2]`, `monsterDeclarations[2]`) may then name another entry
   * of the current document, so the path is shown as text, not a jump.
   * Connections resolve by id and stay jumps. */
  current: boolean;
  onJump?(target: RefusalTarget, path?: string): void;
  onOpenFact?(id: string, hub?: string): void;
  /** What opens the join a way pointer's way goes through
   * (rpg-project#973), or null when the studio cannot: the pointer is then
   * text. */
  wayOpener?(wayId: string): (() => void) | null;
}): React.JSX.Element {
  const seen = new Set<string>();
  const links: React.JSX.Element[] = [];
  for (const connection of statement.connects) {
    const name = `${connection.kind} ${connection.id}`;
    if (seen.has(name)) continue;
    seen.add(name);
    // A link to the selection itself goes nowhere: dropped, as a path that
    // lands on the selection is.
    if (connection.kind === selection.kind && connection.id === selection.id)
      continue;
    const jump = connectionJump(connection, document);
    if (!jump) continue;
    const go =
      jump.kind === 'hub'
        ? onOpenFact && (() => onOpenFact(jump.id, jump.hub))
        : jump.kind === 'way'
          ? (wayOpener?.(jump.id) ?? undefined)
          : onJump && (() => onJump(jump.target));
    if (!go) {
      // A way pointer the studio cannot open says what it names, as text.
      if (jump.kind === 'way')
        links.push(
          <span key={name} className="es-readback-ref" data-ref-kind="way">
            {name}
          </span>
        );
      continue;
    }
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
  // THE STATEMENT'S PLACE, IN WORDS (rpg-project#983): a link that lands on
  // the place its path names — elsewhere, or inside the selection itself
  // (its line, its row). The raw path is its title, for pasting.
  const pathTarget = onJump ? targetOfPath(statement.path, document) : null;
  const pathPart = pathTarget
    ? keyOfPath(statement.path, document)?.part
    : undefined;
  const placeLink =
    pathTarget && (!landsOn(pathTarget, selection) || pathPart)
      ? pathTarget
      : null;
  const place = placeName(statement.path, document);
  if (placeLink && !current)
    links.push(
      <span key="path" className="es-readback-path" title={statement.path}>
        {place}
      </span>
    );
  else if (placeLink && onJump)
    links.push(
      <button
        key="path"
        type="button"
        className="es-link es-readback-ref es-readback-path"
        aria-label={`Open ${place}`}
        title={statement.path}
        onClick={() => onJump(placeLink, statement.path)}
      >
        {place}
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
  document,
}: {
  unsaid: readonly ReadBackUnsaid[];
  document: Readonly<RoomDraftDocument>;
}): React.JSX.Element {
  return (
    <div className="es-readback-unsaid">
      <p className="es-help">Not yet said by the engine:</p>
      <ul>
        {unsaid.map((entry, index) => (
          <li key={index}>
            <span title={entry.path}>{placeName(entry.path, document)}</span> (
            {entry.kind}): {entry.why}
          </li>
        ))}
      </ul>
    </div>
  );
}
