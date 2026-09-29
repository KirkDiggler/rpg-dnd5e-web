import { useState } from 'react';
import { CheckApproachRows } from './CheckApproachRows';
import {
  addConcealment,
  paintConcealmentCells,
  renameConcealment,
  setConcealment,
  setConcealmentProp,
} from './concealmentEdits';
import type { SiteConcealmentSpec, SiteScope } from './siteScope';
import type { WorldScene } from './types';

export interface ConcealmentPanelProps {
  scope: SiteScope;
  items: WorldScene['items'];
  activeId: string | null;
  onActivate: (id: string | null) => void;
  onChange: (scope: SiteScope) => void;
}

function ConcealmentRow({
  scope,
  items,
  activeId,
  onActivate,
  onChange,
  id,
  spec,
}: ConcealmentPanelProps & {
  id: string;
  spec: SiteConcealmentSpec;
}) {
  const [typedId, setTypedId] = useState(id);
  const idTaken =
    typedId !== id && Object.hasOwn(scope.concealments ?? {}, typedId);
  const invalidId = !/^[a-z][a-z0-9-]*$/.test(typedId);
  const commitId = () => {
    if (idTaken || invalidId || typedId === id) return;
    onChange(renameConcealment(scope, id, typedId));
    if (activeId === id) onActivate(typedId);
  };
  const patch = (next: SiteConcealmentSpec) =>
    onChange(setConcealment(scope, id, next));
  const itemLabels = new Map(items.map((item) => [item.id, item.label]));
  return (
    <li className="wb-policy-faction">
      <details className="wb-policy-row" open={activeId === id || undefined}>
        <summary aria-label={`Concealment ${id}`}>
          {id} · {spec.cells?.length ?? 0} cells · {spec.props?.length ?? 0}{' '}
          props
        </summary>
        <div className="wb-policy-form">
          <label>
            <span>Id</span>
            <input
              aria-label={`Concealment id for ${id}`}
              value={typedId}
              onChange={(event) => setTypedId(event.target.value)}
              onBlur={commitId}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitId();
              }}
            />
          </label>
          {(idTaken || invalidId) && (
            <p role="alert">
              {idTaken
                ? 'That concealment id is already declared.'
                : 'Use a lower-case id such as hidden-vault.'}
            </p>
          )}
          <p className="wb-help">
            Renaming changes this declaration only. The server names any intel
            reference that no longer resolves.
          </p>
          {(['checks', 'notice'] as const).map((field) => {
            const rows = spec[field] ?? [];
            const setRows = (nextRows: typeof rows) => {
              const next = { ...spec, [field]: nextRows };
              if (field === 'notice' && nextRows.length === 0)
                delete next.notice;
              patch(next);
            };
            return (
              <fieldset key={field}>
                <legend>
                  {field === 'checks'
                    ? 'Search checks (required)'
                    : 'Notice (optional, passive)'}
                </legend>
                <CheckApproachRows
                  id={`${id} ${field}`}
                  rows={rows}
                  minimum={field === 'checks' ? 1 : 0}
                  onPatch={(index, change) =>
                    setRows(
                      rows.map((row, i) => {
                        if (i !== index) return row;
                        const next = { ...row, ...change };
                        if (!next.tool) delete next.tool;
                        return next;
                      })
                    )
                  }
                  onRemove={(index) =>
                    setRows(rows.filter((_, i) => i !== index))
                  }
                  onAdd={() =>
                    setRows([...rows, { ability: 'perception', dc: 15 }])
                  }
                />
              </fieldset>
            );
          })}
          <button
            type="button"
            aria-label={
              activeId === id
                ? `Done adding members to ${id}`
                : `Add members to ${id}`
            }
            aria-pressed={activeId === id}
            onClick={() => onActivate(activeId === id ? null : id)}
          >
            {activeId === id ? 'Done' : 'Add members'}
          </button>
          <p className="wb-help">
            Click Add members, then click walkable hexes, doors and props on the
            canvas. Each click adds one member; clicking it again keeps it. Gold
            highlights this secret’s members. Done or Escape ends selection.
          </p>
          <fieldset>
            <legend>Members</legend>
            <ul aria-label={`Members of ${id}`}>
              {(spec.cells ?? []).map((cell) => (
                <li key={`cell-${cell.q},${cell.r}`}>
                  Hex ({cell.q}, {cell.r}){' '}
                  <button
                    type="button"
                    aria-label={`Remove hex ${cell.q},${cell.r} from ${id}`}
                    onClick={() =>
                      onChange(
                        paintConcealmentCells(scope, id, [cell], 'erase')
                      )
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
              {(spec.props ?? []).map((prop) => (
                <li key={`prop-${prop}`}>
                  {itemLabels.get(prop) ?? '(not placed)'} · {prop}{' '}
                  <button
                    type="button"
                    aria-label={`Remove prop ${prop} from ${id}`}
                    onClick={() =>
                      onChange(setConcealmentProp(scope, id, prop, false))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </fieldset>
          {!spec.cells?.length && !spec.props?.length && (
            <p className="wb-help">
              Nothing hidden yet. Use Add members to select things on the
              canvas.
            </p>
          )}
          <button
            type="button"
            aria-label={`Remove concealment ${id}`}
            onClick={() => {
              onChange(setConcealment(scope, id, undefined));
              if (activeId === id) onActivate(null);
            }}
          >
            Remove concealment
          </button>
        </div>
      </details>
    </li>
  );
}

export function ConcealmentPanel(props: ConcealmentPanelProps) {
  return (
    <div data-testid="concealment-panel">
      <p className="wb-help">
        One named secret owns its hidden cells and props. Checks, references,
        walkability and overlapping claims are judged by the server at publish.
      </p>
      <ul className="wb-policy-factions" aria-label="Concealment declarations">
        {Object.entries(props.scope.concealments ?? {}).map(([id, spec]) => (
          <ConcealmentRow key={id} {...props} id={id} spec={spec} />
        ))}
      </ul>
      <button
        type="button"
        onClick={() => props.onChange(addConcealment(props.scope))}
      >
        New concealment
      </button>
    </div>
  );
}
