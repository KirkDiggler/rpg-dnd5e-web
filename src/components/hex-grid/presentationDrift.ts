/**
 * presentationDrift — a figure walked a short way for show, never moved
 * (rpg-project#925: the walk-off before the cut). It is an OFFSET drawn
 * inside the figure's own group; the position the snapshots own is never
 * read back from it or written by it.
 */
import { cubeToWorld, type CubeCoord } from './hexMath';

export interface PresentationDrift {
  /** Changes once per drift: a new key restarts it from zero. */
  readonly key: string;
  /** The offset at the drift's end, in world units on the ground plane. */
  readonly x: number;
  readonly z: number;
  readonly durationMs: number;
}

/** About two cells, in a straight line from `from` toward `to`, never past
 * it; undefined when there is nowhere to go. */
export function driftToward(
  key: string,
  from: CubeCoord,
  to: CubeCoord,
  hexSize: number,
  durationMs: number,
  cells = 2
): PresentationDrift | undefined {
  const a = cubeToWorld(from, hexSize);
  const b = cubeToWorld(to, hexSize);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-9) return undefined;
  const step = Math.sqrt(3) * hexSize; // one cell, centre to centre
  const length = Math.min(cells * step, distance);
  return Object.freeze({
    key,
    x: (dx / distance) * length,
    z: (dz / distance) * length,
    durationMs,
  });
}

/** The offset `elapsedMs` into a drift, eased out; zero with no drift. */
export function driftAt(
  drift: PresentationDrift | undefined,
  elapsedMs: number
): { x: number; z: number } {
  if (!drift) return { x: 0, z: 0 };
  const t = Math.min(1, Math.max(0, elapsedMs / drift.durationMs));
  const eased = 1 - (1 - t) * (1 - t);
  return { x: drift.x * eased, z: drift.z * eased };
}
