/**
 * RouteEditor — a cell or a route on a row, as chips with their fields
 * (rpg-project#720).
 *
 * A ROUTE IS ITS WAYPOINTS, IN WALKING ORDER, LOOPING. Each waypoint is a
 * chip: its cell in the room's own spelling, how many rounds the walker
 * stands there (`wait`), and which way it faces while it stands (`facing`,
 * offered only beside a wait — a facing is the stand's). Waypoints are moved
 * earlier or later and removed here; new ones are added by clicking cells on
 * the Layout ([RoutePickContext]).
 *
 * The chips write through [routeEdits], so what the form writes is exactly
 * what the reader reads. Whether the route is walkable is the engine's call.
 */
import { FACING_NAMES } from '@/components/hex-grid/facingYaw';
import { useState } from 'react';
import type { AnswerWaypointShape } from './answerTableShape';
import { cellPhrase } from './answerVocabulary';
import {
  moveWaypoint,
  parseWait,
  pauseText,
  removeWaypoint,
  setWaypointFacing,
  setWaypointWait,
} from './routeEdits';
import { useLatest, useRoutePicking, type RoutePickMode } from './routePicking';

/** A route as read-only chips, for a one-line summary: "1 {q: -5, r: 8}
 * waits 1, faces ne". */
export function WaypointChips({
  route,
  label,
}: {
  route: readonly AnswerWaypointShape[];
  label: string;
}) {
  return (
    <span className="wb-route-chips" aria-label={`Waypoints of ${label}`}>
      {route.map((waypoint, index) => (
        <span
          key={index}
          className="wb-waypoint-chip"
          data-waypoint={index}
          data-cell={`${waypoint.q},${waypoint.r}`}
        >
          <span className="wb-waypoint-number">{index + 1}</span>
          {cellPhrase(waypoint)}
          {pauseText(waypoint) && (
            <span className="wb-waypoint-pause"> {pauseText(waypoint)}</span>
          )}
        </span>
      ))}
    </span>
  );
}

/** The wait field: typed as text so a half-typed value is not written; a
 * whole number of rounds, 0 or more, or empty for none. */
function WaitField({
  waypoint,
  label,
  onChange,
}: {
  waypoint: AnswerWaypointShape;
  label: string;
  onChange: (wait: number | undefined) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const shown =
    typed ?? (waypoint.wait === undefined ? '' : String(waypoint.wait));
  return (
    <input
      type="number"
      min={0}
      step={1}
      className="wb-waypoint-wait"
      aria-label={`Wait in rounds at ${label}`}
      placeholder="0"
      value={shown}
      onChange={(event) => {
        const parsed = parseWait(event.target.value);
        setTyped(event.target.value);
        if (parsed !== null) {
          onChange(parsed);
          setTyped(null);
        }
      }}
      onBlur={() => setTyped(null)}
    />
  );
}

export function RouteEditor({
  mode,
  route,
  label,
  pickLabel = label,
  onChange,
}: {
  /** What the studio's pick status names, when it says more than `label`. */
  pickLabel?: string;
  mode: RoutePickMode;
  /** The route's waypoints, or a cell as a one-waypoint route. */
  route: readonly AnswerWaypointShape[];
  /** What the controls are named for: "gate-patrol time entry 9". */
  label: string;
  onChange: (route: AnswerWaypointShape[]) => void;
}) {
  const picking = useRoutePicking();
  const changeLatest = useLatest(onChange);
  const pick = () =>
    picking?.arm({
      mode,
      label: pickLabel,
      route: mode === 'route' ? route : [],
      onDone: changeLatest,
    });
  if (mode === 'cell') {
    const cell = route[0];
    return (
      <span className="wb-route-editor" data-testid="entry-cell">
        {cell && (
          <span
            className="wb-waypoint-chip"
            data-cell={`${cell.q},${cell.r}`}
            aria-label={`Cell for ${label}`}
          >
            {cellPhrase(cell)}
          </span>
        )}
        {picking && (
          <button
            type="button"
            aria-label={`Pick a cell on the map for ${label}`}
            onClick={pick}
          >
            Pick on map
          </button>
        )}
      </span>
    );
  }
  return (
    <div className="wb-route-editor" data-testid="entry-route">
      <ol className="wb-route" aria-label={`Route for ${label}`}>
        {route.map((waypoint, index) => {
          const name = `waypoint ${index + 1} of ${label}`;
          const stands = (waypoint.wait ?? 0) > 0;
          return (
            <li
              key={index}
              className="wb-waypoint-chip wb-waypoint-row"
              data-waypoint={index}
              data-cell={`${waypoint.q},${waypoint.r}`}
            >
              <span className="wb-waypoint-number">{index + 1}</span>
              <span className="wb-waypoint-cell">{cellPhrase(waypoint)}</span>
              <label>
                <span>Wait</span>
                <WaitField
                  waypoint={waypoint}
                  label={name}
                  onChange={(wait) =>
                    onChange(setWaypointWait(route, index, wait))
                  }
                />
              </label>
              <label>
                <span>Facing</span>
                <select
                  aria-label={`Facing at ${name}`}
                  disabled={!stands}
                  title={
                    stands
                      ? undefined
                      : 'A facing is taken while standing; give the waypoint a wait'
                  }
                  value={waypoint.facing ?? ''}
                  onChange={(event) =>
                    onChange(
                      setWaypointFacing(
                        route,
                        index,
                        event.target.value === ''
                          ? undefined
                          : event.target.value
                      )
                    )
                  }
                >
                  <option value="">its step</option>
                  {FACING_NAMES.map((facing) => (
                    <option key={facing} value={facing}>
                      {facing}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                aria-label={`Move ${name} earlier`}
                disabled={index === 0}
                onClick={() => onChange(moveWaypoint(route, index, -1))}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${name} later`}
                disabled={index === route.length - 1}
                onClick={() => onChange(moveWaypoint(route, index, 1))}
              >
                ↓
              </button>
              <button
                type="button"
                className="wb-danger"
                aria-label={`Remove ${name}`}
                // A route of no waypoints names no target, which the reader
                // refuses; the last waypoint goes by switching the selector.
                disabled={route.length === 1}
                onClick={() => onChange(removeWaypoint(route, index))}
              >
                ×
              </button>
            </li>
          );
        })}
      </ol>
      {picking && (
        <button
          type="button"
          aria-label={`Add waypoints on the map to ${label}`}
          onClick={pick}
        >
          Add waypoints on map
        </button>
      )}
    </div>
  );
}
