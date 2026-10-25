/**
 * BundlesPanel — the site's root `bundles:`, edited in their own list
 * (rpg-project#670, S3 bundles).
 *
 * A BUNDLE IS A SITE NOUN, like a table: a behaviour authored once and used as
 * ONE row, `use: <id>`, wherever a table wants it. A use reads as one line in
 * the table it sits in and expands there, read-only; the bundle itself is
 * edited here.
 *
 * THE ROWS ARE EDITED AS WRITTEN, `$name` and all. They are not rows until a
 * use fills its parameters, so they are not offered to the row editor, which
 * would refuse `$distance` as a distance; the preview below them shows the
 * rows the DEFAULTS make, judged by the one answer grammar.
 *
 * THE FORM NEVER PRE-JUDGES. A bundle with no rows or a `$name` it does not
 * declare is shown in the engine's sentence beside it, and the engine refuses
 * it at its own door; nothing here blocks the edit.
 */
import { useState } from 'react';
import { parse, stringify } from 'yaml';
import { groupRefusals, resolveUse } from './bundles';
import { entryText } from './entryText';
import type { SiteBundle, SiteBundles, SiteScope } from './siteScope';

export interface BundlesPanelProps {
  scope: SiteScope;
  onChange: (bundles: SiteBundles) => void;
}

/** The next free `bundle-N`. */
function nextBundleId(bundles: SiteBundles): string {
  for (let i = 1; ; i++)
    if (!Object.hasOwn(bundles, `bundle-${i}`)) return `bundle-${i}`;
}

/** YAML text read as a value, or the parser's sentence. */
function read(
  text: string
): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: parse(text) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function BundleRow({
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
  const [params, setParams] = useState(
    bundle.params
      ? stringify(bundle.params, { collectionStyle: 'flow' }).trim()
      : ''
  );
  const [rows, setRows] = useState(stringify(bundle.rows));
  const [error, setError] = useState<string | undefined>();

  const commit = (next: SiteBundle, nextId = id) => {
    const out: SiteBundles = {};
    for (const [key, value] of Object.entries(bundles)) {
      if (key === id) out[nextId] = next;
      else out[key] = value;
    }
    onChange(out);
  };
  const commitParams = () => {
    if (params.trim() === '') return commit({ rows: bundle.rows });
    const got = read(params);
    if (!got.ok) return setError(got.error);
    if (!got.value || typeof got.value !== 'object' || Array.isArray(got.value))
      return setError('parameters are a map of name to default, `~` for none');
    setError(undefined);
    commit({ ...bundle, params: got.value as Record<string, unknown> });
  };
  const commitRows = () => {
    const got = read(rows);
    if (!got.ok) return setError(got.error);
    if (!Array.isArray(got.value)) return setError('rows are a list');
    setError(undefined);
    commit({ ...bundle, rows: got.value });
  };
  const commitName = () => {
    const next = name.trim();
    if (next === id || next === '' || Object.hasOwn(bundles, next))
      return setName(id);
    commit(bundle, next);
  };

  const refusals = groupRefusals(scope).filter((r) =>
    r.path.startsWith(`bundles.${id}.`)
  );
  // The rows the DEFAULTS make, when every parameter has one.
  const preview = resolveUse(bundles, { use: id }, 'time');

  return (
    <li className="wb-bundle" aria-label={`Bundle ${id}`}>
      <label>
        Bundle id
        <input
          value={name}
          aria-label={`Bundle ${id} id`}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
        />
      </label>
      <label>
        Parameters
        <input
          value={params}
          aria-label={`Bundle ${id} parameters`}
          placeholder="{ distance: 6, heading: went }"
          onChange={(e) => setParams(e.target.value)}
          onBlur={commitParams}
        />
      </label>
      <label>
        Rows
        <textarea
          value={rows}
          rows={Math.max(3, rows.split('\n').length)}
          aria-label={`Bundle ${id} rows`}
          onChange={(e) => setRows(e.target.value)}
          onBlur={commitRows}
        />
      </label>
      {error && (
        <p className="wb-entry-refusal" role="alert">
          {error}
        </p>
      )}
      {refusals.map((r) => (
        <p key={r.path + r.message} className="wb-entry-refusal" role="alert">
          {r.message}
        </p>
      ))}
      {preview.rows.length > 0 && (
        <ul className="wb-use-rows" aria-label={`${id} rows with its defaults`}>
          {preview.rows.map((row, index) => (
            <li key={index}>{entryText(row, 'time')}</li>
          ))}
        </ul>
      )}
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
        Remove
      </button>
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
        <ul>
          {ids.map((id) => (
            <BundleRow
              key={`${id}:${JSON.stringify(bundles[id])}`}
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
          onChange({ ...bundles, [nextBundleId(bundles)]: { rows: [] } })
        }
      >
        Add bundle
      </button>
    </section>
  );
}
