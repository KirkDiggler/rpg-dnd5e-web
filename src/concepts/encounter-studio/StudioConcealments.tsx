import { useState } from 'react';
import {
  concealmentMemberKind,
  concealmentMemberName,
  nextConcealmentId,
} from '../world-building/concealmentEdits';
import type {
  SiteConcealmentCheck,
  SiteConcealmentSpec,
} from '../world-building/siteScope';
import { AboutPanel, FieldHelp } from './FieldHelp';
import { StudioCheckRows, type StudioCheck } from './StudioCheckRows';
import { StudioSection } from './StudioSection';
import type { EncounterStudioSession } from './studioSession';

const DEFAULT_CHECK: SiteConcealmentCheck = {
  ability: 'investigation',
  dc: 15,
};

function patchRow(
  rows: readonly SiteConcealmentCheck[],
  index: number,
  patch: Partial<StudioCheck>
): SiteConcealmentCheck[] {
  return rows.map((row, i) => {
    if (i !== index) return row;
    const next: SiteConcealmentCheck = { ...row, ...patch };
    if (!next.tool) delete next.tool;
    return next;
  });
}

const KIND_WORD = { prop: 'Prop', door: 'Door', wall: 'Wall' } as const;

/** The Encounter home's Concealments (rpg-project#578, H5): each secret's
 * id, its search checks (at least one) and notice checks, its attempts
 * (max and reset hexes; never `lifetime`), its members, and the intel that
 * reveals it. Members are picked on the map; this form lists and removes
 * them. Concealments carry no fact, so what reveals one is listed here. */
export function StudioConcealments({
  session,
  onArmMembers,
  onOpenIntel,
}: {
  session: EncounterStudioSession;
  /** Switch to Build with this concealment's member picking armed. */
  onArmMembers(id: string): void;
  /** Open the Intel section. */
  onOpenIntel(id: string): void;
}): React.JSX.Element {
  const document = session.document;
  const concealments = document.scope.concealments ?? {};
  const ids = Object.keys(concealments);
  const [openId, setOpenId] = useState<string | null>(ids[0] ?? null);
  const open =
    openId !== null && Object.hasOwn(concealments, openId)
      ? openId
      : (ids[0] ?? null);
  return (
    <section
      aria-label="Concealments"
      className="es-social-panel es-concealments"
    >
      <h2>Concealments</h2>
      <AboutPanel>
        <p>
          A concealment hides walkable cells, declared props, doors and walls
          until a search check finds it. Notice checks are its passive tell.
          Hiding a door hides only the door, never its wall.
        </p>
      </AboutPanel>
      {ids.length === 0 ? (
        <p className="es-help">No concealment yet.</p>
      ) : (
        <nav className="es-buttons" aria-label="Concealment list">
          {ids.map((id) => (
            <button
              type="button"
              key={id}
              aria-pressed={open === id}
              onClick={() => setOpenId(id)}
            >
              {id}
            </button>
          ))}
        </nav>
      )}
      <div className="es-buttons">
        <button
          type="button"
          onClick={() => {
            const id = nextConcealmentId(document.scope);
            if (session.concealments.add()) setOpenId(id);
          }}
        >
          Add concealment
        </button>
      </div>
      {open !== null && (
        <ConcealmentForm
          key={open}
          session={session}
          id={open}
          spec={concealments[open]!}
          onRenamed={setOpenId}
          onArmMembers={onArmMembers}
          onOpenIntel={onOpenIntel}
        />
      )}
    </section>
  );
}

function ConcealmentForm({
  session,
  id,
  spec,
  onRenamed,
  onArmMembers,
  onOpenIntel,
}: {
  session: EncounterStudioSession;
  id: string;
  spec: SiteConcealmentSpec;
  onRenamed(id: string): void;
  onArmMembers(id: string): void;
  onOpenIntel(id: string): void;
}): React.JSX.Element {
  const document = session.document;
  const [renaming, setRenaming] = useState<string | null>(null);
  const update = (next: SiteConcealmentSpec): boolean =>
    session.concealments.update(id, next);
  const withNotice = (rows: SiteConcealmentCheck[]): SiteConcealmentSpec => {
    const next: SiteConcealmentSpec = { ...spec, notice: rows };
    if (rows.length === 0) delete next.notice;
    return next;
  };
  const setAttempt = (key: 'max' | 'reset_hexes', raw: string): void => {
    const attempts = { ...spec.attempts };
    if (raw === '') delete attempts[key];
    else attempts[key] = Number(raw);
    const next: SiteConcealmentSpec = { ...spec, attempts };
    if (Object.keys(attempts).length === 0) delete next.attempts;
    update(next);
  };
  const removeProp = (prop: string): void => {
    const props = (spec.props ?? []).filter((value) => value !== prop);
    const next: SiteConcealmentSpec = { ...spec, props };
    if (props.length === 0) delete next.props;
    update(next);
  };
  const removeCell = (q: number, r: number): void => {
    const cells = (spec.cells ?? []).filter(
      (cell) => !(cell.q === q && cell.r === r)
    );
    const next: SiteConcealmentSpec = { ...spec, cells };
    if (cells.length === 0) delete next.cells;
    update(next);
  };
  const revealedBy = (document.scope.intel ?? []).filter(
    (record) =>
      'concealment' in record.reveals && record.reveals.concealment === id
  );
  return (
    <div
      className="es-context-panel es-concealment"
      aria-label={`Concealment ${id}`}
      role="group"
    >
      <StudioSection title={id} level="section">
        {renaming === null ? (
          <div className="es-buttons">
            <button type="button" onClick={() => setRenaming(id)}>
              Rename concealment
            </button>
            <button
              type="button"
              onClick={() => session.concealments.update(id, undefined)}
            >
              Remove concealment
            </button>
          </div>
        ) : (
          <form
            className="es-buttons"
            aria-label="Rename concealment"
            onSubmit={(event) => {
              event.preventDefault();
              const to = renaming.trim();
              if (session.concealments.rename(id, to)) {
                setRenaming(null);
                onRenamed(to);
              }
            }}
          >
            <label className="es-field">
              <span>Concealment id</span>
              <input
                aria-label="Concealment id"
                value={renaming}
                autoFocus
                onChange={(event) => setRenaming(event.target.value)}
              />
            </label>
            <button type="submit">Apply rename</button>
            <button type="button" onClick={() => setRenaming(null)}>
              Cancel
            </button>
          </form>
        )}
      </StudioSection>
      <StudioSection title="Search checks" level="subsection">
        <p className="es-help">
          Any one of these finds it. A concealment needs at least one.
        </p>
        <StudioCheckRows
          owner={`${id} search`}
          rows={spec.checks}
          minimum={1}
          onPatch={(index, patch) =>
            update({ ...spec, checks: patchRow(spec.checks, index, patch) })
          }
          onRemove={(index) =>
            update({
              ...spec,
              checks: spec.checks.filter((_, i) => i !== index),
            })
          }
          onAdd={() =>
            update({ ...spec, checks: [...spec.checks, { ...DEFAULT_CHECK }] })
          }
        />
      </StudioSection>
      <StudioSection title="Notice checks" level="subsection">
        <p className="es-help">The passive tell. Optional.</p>
        <StudioCheckRows
          owner={`${id} notice`}
          rows={spec.notice ?? []}
          onPatch={(index, patch) =>
            update(withNotice(patchRow(spec.notice ?? [], index, patch)))
          }
          onRemove={(index) =>
            update(
              withNotice((spec.notice ?? []).filter((_, i) => i !== index))
            )
          }
          onAdd={() =>
            update(
              withNotice([
                ...(spec.notice ?? []),
                { ability: 'perception', dc: 15 },
              ])
            )
          }
        />
      </StudioSection>
      <StudioSection title="Attempts" level="subsection">
        <label className="es-field">
          <span>
            Max attempts{' '}
            <FieldHelp field="Max attempts">
              How many searches each character gets. Empty is the engine&apos;s
              default.
            </FieldHelp>
          </span>
          <input
            aria-label={`Max attempts for ${id}`}
            type="number"
            min={1}
            step={1}
            value={spec.attempts?.max ?? ''}
            onChange={(event) => setAttempt('max', event.target.value)}
          />
        </label>
        <label className="es-field">
          <span>
            Reset hexes{' '}
            <FieldHelp field="Reset hexes">
              How far a character walks away before searching again.
            </FieldHelp>
          </span>
          <input
            aria-label={`Reset hexes for ${id}`}
            type="number"
            min={1}
            step={1}
            value={spec.attempts?.reset_hexes ?? ''}
            onChange={(event) => setAttempt('reset_hexes', event.target.value)}
          />
        </label>
      </StudioSection>
      <StudioSection title="Members" level="subsection">
        {(spec.cells ?? []).length === 0 && (spec.props ?? []).length === 0 ? (
          <p className="es-help">Nothing is hidden yet.</p>
        ) : (
          <ul className="es-inspector-list" aria-label={`Members of ${id}`}>
            {(spec.cells ?? []).map((cell) => (
              <li key={`cell:${cell.q},${cell.r}`}>
                <span>
                  Hex q {cell.q}, r {cell.r}
                </span>{' '}
                <button
                  type="button"
                  aria-label={`Remove hex q ${cell.q}, r ${cell.r} from ${id}`}
                  onClick={() => removeCell(cell.q, cell.r)}
                >
                  Remove
                </button>
              </li>
            ))}
            {(spec.props ?? []).map((prop) => {
              const kind = concealmentMemberKind(document, prop);
              const name = concealmentMemberName(document, prop);
              return (
                <li key={`prop:${prop}`} data-member-kind={kind ?? 'unknown'}>
                  <span>
                    {kind
                      ? `${KIND_WORD[kind]}: ${name}`
                      : `${name} (not found)`}
                  </span>{' '}
                  <button
                    type="button"
                    aria-label={`Remove ${name} from ${id}`}
                    onClick={() => removeProp(prop)}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="es-buttons">
          <button type="button" onClick={() => onArmMembers(id)}>
            Add members on the map
          </button>
          <FieldHelp field="Add members on the map">
            Click walkable hexes, declared props, doors and walls to add or
            remove them. Escape or Done stops.
          </FieldHelp>
        </div>
      </StudioSection>
      <StudioSection title="Revealed by" level="subsection">
        {revealedBy.length === 0 ? (
          <p className="es-help">No intel reveals this.</p>
        ) : (
          <ul
            className="es-inspector-list"
            aria-label={`Intel revealing ${id}`}
          >
            {revealedBy.map((record) => (
              <li key={record.id}>
                <button
                  type="button"
                  className="es-link"
                  onClick={() => onOpenIntel(record.id)}
                >
                  intel {record.id}
                </button>
              </li>
            ))}
          </ul>
        )}
      </StudioSection>
    </div>
  );
}
