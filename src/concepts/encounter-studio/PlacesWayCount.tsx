/**
 * WAYS BY METHOD (rpg-project#974, R30, R39): the encounter's ways counted
 * by the method they can be taken by, and the ways into the selected place.
 * Numbers and names only: the studio counts, it does not judge. See
 * `waysByMethod.ts` for what one way is.
 */
import { useState } from 'react';
import { methodLabel } from './placesView';
import type { PlacesView } from './usePlacesView';
import {
  difficultyRange,
  waysInto,
  waysTotal,
  type WayUnit,
} from './waysByMethod';

export const WAY_COUNT_STORAGE_KEY = 'encounter-studio.ways-by-method';

function rememberedOpen(): boolean {
  try {
    return localStorage.getItem(WAY_COUNT_STORAGE_KEY) !== 'closed';
  } catch {
    return true;
  }
}

const plural = (n: number): string => (n === 1 ? '1 way' : `${n} ways`);

function unitText(unit: WayUnit): string {
  const methods = unit.methods.map(methodLabel).join(' or ');
  const option = unit.option ? `\`${unit.option}\` · ` : '';
  const saidTo =
    unit.carriers.length > 0 ? ` · said to: ${unit.carriers.join(', ')}` : '';
  return `${option}${methods || unit.ways[0]!.kind}${saidTo}`;
}

export function PlacesWayCount({
  view,
  selectedRegionId,
}: {
  view: PlacesView;
  selectedRegionId: string | null;
}): React.JSX.Element | null {
  const [open, setOpen] = useState(rememberedOpen);
  if (!view.places) return null;
  const into =
    selectedRegionId !== null ? waysInto(view.places, selectedRegionId) : null;
  const place = selectedRegionId ? view.regionName(selectedRegionId) : '';
  return (
    <details
      className="es-way-count"
      role="group"
      aria-label="Ways by method"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        setOpen(next);
        try {
          localStorage.setItem(WAY_COUNT_STORAGE_KEY, next ? 'open' : 'closed');
        } catch {
          // No storage: the choice lasts as long as the studio.
        }
      }}
    >
      <summary>Ways by method</summary>
      {view.counts.length > 0 && <p>{plural(waysTotal(view.places))}</p>}
      {view.counts.length === 0 ? (
        <p className="es-help">The engine says no way that can be counted.</p>
      ) : (
        <ul aria-label="Ways by method" className="es-way-count-list">
          {view.counts.map((row) => {
            const dc = difficultyRange(row);
            return (
              <li key={row.key}>
                <button
                  type="button"
                  aria-pressed={view.method?.key === row.key}
                  title="Mark the joins whose ways use it"
                  onClick={() => view.toggleMethod(row.key)}
                >
                  {row.label}
                </button>
                <span className="es-way-count-figures">
                  {dc ? `${plural(row.ways)} · ${dc}` : plural(row.ways)}
                </span>
                {row.key === 'free' && (
                  <span className="es-way-count-sub">
                    {row.open} open · {row.needing} need something first
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="es-help">
        A way with alternatives counts under each of its methods, so the rows
        add up to more than the total; a tool is part of its approach. A line
        said by several creatures counts once. A secret that bars several
        passages is one way per passage.
      </p>
      {view.method && (
        <p id="es-method-marked" className="es-help" role="status">
          Marked: the joins with a way by {view.method.label}.
        </p>
      )}
      {into && (
        <section aria-label={`Ways into ${place}`} className="es-ways-into">
          <h3>Ways into {place}</h3>
          <p className="es-help">
            A door or open floor joins both its places and is listed under each;
            a passage is listed under the place it leads to.
          </p>
          {into.length === 0 ? (
            <p className="es-help">No join reaches {place}.</p>
          ) : (
            <ul>
              {into.map(({ join, units }) => (
                <li key={join.id}>
                  <button
                    type="button"
                    data-way-into={join.id}
                    aria-label={view.nameOf(join)}
                    onClick={() => view.selectJoin(join.id)}
                  >
                    {view.nameOf(join).replace(/^Join: /, '')}
                  </button>
                  {units.length > 0 && (
                    <ul>
                      {units.map((unit, index) => (
                        <li key={index}>{unitText(unit)}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </details>
  );
}
