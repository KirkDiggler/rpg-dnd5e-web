/**
 * BundlesPanel — the site's root `bundles:`, one card per bundle
 * (rpg-project#670, S3 bundles).
 *
 * A BUNDLE IS A SITE NOUN, like a table: a behaviour authored once and used as
 * ONE row, `use: <id>`, wherever a table wants it. A use reads as one line in
 * the table it sits in and expands there, read-only; the bundle itself is
 * edited here.
 *
 * ONE CARD: the id and the parameters on the header line, the rows below it
 * at full width, and the card's own actions at its foot. The rows are edited
 * by the SAME row editor the Tables panel uses; inside a bundle every scalar a
 * row carries may instead be a parameter, a `$name` chip naming one of the
 * parameters declared above it ([ParamSlot]). "Edit as text" shows the YAML
 * for an author who would rather type it.
 *
 * THE FORM NEVER PRE-JUDGES what only the engine can: a bundle with no rows or
 * a `$name` it does not declare is shown in the engine's sentence on the card.
 */
import { useState } from 'react';
import { parse, stringify } from 'yaml';
import type { AnswerEntryShape } from './answerTableShape';
import { groupRefusals } from './bundles';
import { BundleParamsContext } from './bundlesContext';
import { AnswerEntryRow, EntryList } from './SitePolicies';
import type { SiteBundle, SiteBundles, SiteScope } from './siteScope';

export interface BundlesPanelProps {
  scope: SiteScope;
  onChange: (bundles: SiteBundles) => void;
}

/** A new row: stand still when nothing is in sight. */
const NEW_ROW: AnswerEntryShape = { when: { enemy: 'none' }, hold: {} };

/** The next free `<prefix>-N`. */
function nextFree(taken: Iterable<string>, prefix: string): string {
  const used = new Set(taken);
  for (let i = 1; ; i++)
    if (!used.has(`${prefix}-${i}`)) return `${prefix}-${i}`;
}

/** A default as typed: a whole number, or the word as written. */
function defaultOf(text: string): unknown {
  return /^-?\d+$/.test(text.trim()) ? Number(text.trim()) : text;
}

/** One parameter's default as the field shows it. */
function defaultText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? '' : String(value);
}

/** The parameters, one line each: a name, and a default or "none". */
function ParamsEditor({
  id,
  params,
  onChange,
}: {
  id: string;
  params: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}) {
  const names = Object.keys(params);
  const [renaming, setRenaming] = useState<Record<string, string>>({});
  const rename = (from: string) => {
    const to = (renaming[from] ?? from).trim();
    setRenaming((was) => {
      const next = { ...was };
      delete next[from];
      return next;
    });
    if (to === from || to === '' || Object.hasOwn(params, to)) return;
    onChange(
      Object.fromEntries(
        Object.entries(params).map(([name, value]) => [
          name === from ? to : name,
          value,
        ])
      )
    );
  };
  return (
    <div className="wb-bundle-params" aria-label={`Bundle ${id} parameters`}>
      <span>Parameters</span>
      {names.length === 0 ? (
        <span className="wb-help">no parameters</span>
      ) : (
        <ul>
          {names.map((name) => {
            const value = params[name];
            const none = value === null || value === undefined;
            const route = typeof value === 'object' && value !== null;
            return (
              <li key={name}>
                <input
                  aria-label={`Parameter ${name} of ${id}`}
                  value={renaming[name] ?? name}
                  onChange={(event) =>
                    setRenaming((was) => ({
                      ...was,
                      [name]: event.target.value,
                    }))
                  }
                  onBlur={() => rename(name)}
                />
                {route ? (
                  <span className="wb-help">default: a route</span>
                ) : (
                  <input
                    aria-label={`Default of ${name} in ${id}`}
                    disabled={none}
                    value={none ? '' : defaultText(value)}
                    onChange={(event) =>
                      onChange({
                        ...params,
                        [name]: defaultOf(event.target.value),
                      })
                    }
                  />
                )}
                <label>
                  <input
                    type="checkbox"
                    aria-label={`${name} has no default`}
                    checked={none}
                    onChange={(event) =>
                      onChange({
                        ...params,
                        [name]: event.target.checked ? null : '',
                      })
                    }
                  />
                  none
                </label>
                <button
                  type="button"
                  className="wb-danger"
                  aria-label={`Remove parameter ${name} of ${id}`}
                  onClick={() => {
                    const next = { ...params };
                    delete next[name];
                    onChange(next);
                  }}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        aria-label={`Add a parameter to ${id}`}
        onClick={() =>
          onChange({ ...params, [nextFree(names, 'param')]: null })
        }
      >
        Add parameter
      </button>
    </div>
  );
}

/** The bundle as YAML, for an author who would rather type it. */
function BundleText({
  bundle,
  onApply,
  onClose,
}: {
  bundle: SiteBundle;
  onApply: (bundle: SiteBundle) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(stringify(bundle));
  const [error, setError] = useState<string | undefined>();
  const apply = () => {
    let read: unknown;
    try {
      read = parse(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    const body = (read ?? {}) as Record<string, unknown>;
    if (typeof body !== 'object' || Array.isArray(body))
      return setError('a bundle is { params, rows }');
    if (body.rows !== undefined && !Array.isArray(body.rows))
      return setError('rows are a list');
    if (
      body.params !== undefined &&
      body.params !== null &&
      (typeof body.params !== 'object' || Array.isArray(body.params))
    )
      return setError('parameters are a map of name to default, `~` for none');
    onApply({
      ...(body.params
        ? { params: body.params as Record<string, unknown> }
        : {}),
      rows: (body.rows as unknown[] | undefined) ?? [],
    });
    onClose();
  };
  return (
    <div className="wb-bundle-text">
      <textarea
        aria-label="Bundle as text"
        value={text}
        rows={Math.max(6, text.split('\n').length)}
        onChange={(event) => setText(event.target.value)}
      />
      {error && (
        <p className="wb-entry-refusal" role="alert">
          {error}
        </p>
      )}
      <button type="button" onClick={apply}>
        Apply text
      </button>
    </div>
  );
}

function BundleCard({
  scope,
  id,
  bundle,
  onChange,
}: {
  scope: SiteScope;
  id: string;
  bundle: SiteBundle;
  onChange: (bundles: SiteBundles) => void;
}) {
  const bundles = scope.bundles ?? {};
  const [name, setName] = useState(id);
  const [asText, setAsText] = useState(false);
  const rows = bundle.rows as AnswerEntryShape[];
  const params = bundle.params ?? {};

  const commit = (next: SiteBundle, nextId = id) => {
    const out: SiteBundles = {};
    for (const [key, value] of Object.entries(bundles))
      out[key === id ? nextId : key] = key === id ? next : value;
    onChange(out);
  };
  const commitRows = (next: unknown[]) => commit({ ...bundle, rows: next });
  const commitParams = (next: Record<string, unknown>) => {
    const out: SiteBundle = { rows: bundle.rows };
    if (Object.keys(next).length > 0) out.params = next;
    commit(out);
  };
  const commitName = () => {
    const next = name.trim();
    if (next === id || next === '' || Object.hasOwn(bundles, next))
      return setName(id);
    commit(bundle, next);
  };
  const move = (index: number, by: number) => {
    const next = [...bundle.rows];
    const [row] = next.splice(index, 1);
    next.splice(index + by, 0, row);
    commitRows(next);
  };

  const refusals = groupRefusals(scope).filter((r) =>
    r.path.startsWith(`bundles.${id}.`)
  );

  return (
    <li className="wb-bundle" aria-label={`Bundle ${id}`}>
      <header className="wb-bundle-header">
        <label>
          <span>Bundle id</span>
          <input
            value={name}
            aria-label={`Bundle ${id} id`}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
          />
        </label>
        <ParamsEditor id={id} params={params} onChange={commitParams} />
      </header>
      {asText ? (
        <BundleText
          bundle={bundle}
          onApply={(next) => commit(next)}
          onClose={() => setAsText(false)}
        />
      ) : (
        <BundleParamsContext.Provider
          value={{ bundle: id, params: Object.keys(params) }}
        >
          <EntryList rows={rows}>
            {(row, index, key) => (
              <AnswerEntryRow
                key={key}
                trigger="time"
                label={`${id} row ${index + 1}`}
                entry={row}
                collapsed
                onCommit={(next) =>
                  commitRows(
                    bundle.rows.map((r, i) => (i === index ? next : r))
                  )
                }
                onRemove={() =>
                  commitRows(bundle.rows.filter((_, i) => i !== index))
                }
                controls={
                  <>
                    <button
                      type="button"
                      aria-label={`Move ${id} row ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${id} row ${index + 1} down`}
                      disabled={index === rows.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </button>
                  </>
                }
              />
            )}
          </EntryList>
          <button
            type="button"
            aria-label={`Add a row to ${id}`}
            onClick={() => commitRows([...bundle.rows, { ...NEW_ROW }])}
          >
            Add row
          </button>
        </BundleParamsContext.Provider>
      )}
      {refusals.map((r) => (
        <p key={r.path + r.message} className="wb-entry-refusal" role="alert">
          {r.message}
        </p>
      ))}
      <footer className="wb-bundle-foot">
        <button
          type="button"
          aria-pressed={asText}
          aria-label={`Edit ${id} as text`}
          onClick={() => setAsText((was) => !was)}
        >
          {asText ? 'Edit as rows' : 'Edit as text'}
        </button>
        <button
          type="button"
          className="wb-danger"
          aria-label={`Remove bundle ${id}`}
          onClick={() => {
            const out = { ...bundles };
            delete out[id];
            onChange(out);
          }}
        >
          Remove bundle
        </button>
      </footer>
    </li>
  );
}

export function BundlesPanel({ scope, onChange }: BundlesPanelProps) {
  const bundles = scope.bundles ?? {};
  const ids = Object.keys(bundles).sort();
  return (
    <section className="wb-bundles" aria-label="Bundles">
      {ids.length === 0 ? (
        <p>
          No bundles yet. A bundle is a group of rows a table uses as one line.
        </p>
      ) : (
        <ul className="wb-bundle-list">
          {ids.map((id) => (
            <BundleCard
              key={id}
              scope={scope}
              id={id}
              bundle={bundles[id]}
              onChange={onChange}
            />
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() =>
          onChange({
            ...bundles,
            [nextFree(Object.keys(bundles), 'bundle')]: { rows: [] },
          })
        }
      >
        Add bundle
      </button>
    </section>
  );
}
