/**
 * Feel-lab dials for the local world die (#906). Same "read the query
 * string once, pure parser, testable without a Canvas" convention
 * `cameraDials.ts` already established — `numberDial` (src/utils/queryDial.ts)
 * is the piece extracted and shared between the two.
 *
 * Kirk, 2026-09-03: "Dice at real-table proportion: a d20 is ~20mm on a
 * 1-inch cell, ~80% of a cell. Today's die is 0.55 world units on a
 * 1.73-unit hex, ~32%." `dieScale` is the lever for that live comparison.
 * Kirk's first live session verdict — "dieScale of 2 feels really good" —
 * promoted `2` to the shipped default (0.55*2 / 1.73 ≈ 64% of a cell); a
 * further `?dieScale=2.5` gets closer still to the ~80% reference (≈79%).
 *
 * # What scales together
 *
 * `localWorldDieDimensions()` below is the single source for every
 * *physical* dimension that has to move together for a bigger/smaller die to
 * still look and feel like one consistent object rather than a big mesh
 * rattling around a small collision hull:
 *
 *  - the physics hull radius (`LocalWorldDieLayer.tsx`'s `DieBody`)
 *  - the rest height above the dungeon surface — both `RESET_POSITION` and
 *    the `TrayPlaneProjectionBridge` throw-plane origin, which have to agree
 *    or the plane the player drags/throws on drifts from where the die
 *    actually sits (`LocalWorldDieLayer.tsx`)
 *  - the held/lift height default and range (`LocalWorldDieTile.tsx`'s drag
 *    gesture, and `SessionEncounterView.tsx`'s neutral no-drag roll)
 *
 * The VISUAL mesh scale and shadow disc radius are NOT derived here — they
 * are plain multiplications of `dieScale` applied directly where they're
 * consumed (`RuntimeDiceMesh.tsx`'s own `sizeScale` prop), since both are
 * already single, local multiplications with nothing else to get out of sync
 * with.
 *
 * # Why the throw itself does not need to scale
 *
 * `localWorldDieLaunch` (localWorldDieMotion.ts) derives release velocity
 * from the throw profile ALONE — no radius or mass term — and
 * `LocalWorldDieLayer.tsx` sets that as an absolute Rapier velocity
 * (`setLinvel`/`setAngvel`), never an impulse. So a bigger hull's bigger
 * Rapier-computed mass never enters the velocity calculation, and the same
 * throw gesture already produces the same release velocity and arc at any
 * `dieScale` with no change needed here. See localWorldDieMotion.test.ts.
 */
import type { DialSpec, DialValues } from '@/feel/dialTypes';
import { numberDial } from '@/utils/queryDial';

/** Kirk's first live session verdict, 2026-09-03: "dieScale of 2 feels
 * really good." Promoted from the original shipped default (1). */
export const DEFAULT_DIE_SCALE = 2;

/**
 * `off`: no roll flash. `die`: the natural d20 flashes at the die's rest
 * position (RollFlashDie.tsx). `toast`: the arithmetic flashes in the
 * damage-toast area (RollFlashToasts.tsx). `both` (default): both. See
 * combat-experience/rollFlash.ts's own doc comment for the full design.
 */
export type RollFlashDial = 'off' | 'die' | 'toast' | 'both';

/** Kirk's second live session verdict (#906 round 4), keeper URL included
 * `rollFlash=both` with "that feels much better." Promoted from the
 * original shipped default (`off`). */
export const DEFAULT_ROLL_FLASH: RollFlashDial = 'both';

export interface DiceDials {
  /** Multiplier scaling the die's physical dimensions and visual size
   * together (`?dieScale=`). Default 2 — Kirk's own keeper verdict, see
   * `DEFAULT_DIE_SCALE`. */
  dieScale: number;
  /** `?rollFlash=` — see `RollFlashDial` above and `DEFAULT_ROLL_FLASH`. */
  rollFlash: RollFlashDial;
}

const ROLL_FLASH_VALUES: readonly RollFlashDial[] = [
  'off',
  'die',
  'toast',
  'both',
];

function parseRollFlash(params: URLSearchParams): RollFlashDial {
  const raw = params.get('rollFlash');
  return (ROLL_FLASH_VALUES as readonly string[]).includes(raw ?? '')
    ? (raw as RollFlashDial)
    : DEFAULT_ROLL_FLASH;
}

/** Pure parser over a query string. */
export function parseDiceDials(search: string): DiceDials {
  const params = new URLSearchParams(search);
  const requested = numberDial(params, 'dieScale') ?? DEFAULT_DIE_SCALE;
  // A zero or negative scale would collapse the die (and, worse, the
  // physics hull) to nothing or invert it — floor it well above zero rather
  // than let a typo produce an invisible or degenerate die.
  return {
    dieScale: requested > 0 ? requested : DEFAULT_DIE_SCALE,
    rollFlash: parseRollFlash(params),
  };
}

/** Read the dials once from the live URL — unchanged, URL-only (#906 batch
 * 2 added the drawer/localStorage-aware `useDiceDials()` hook alongside this
 * rather than repointing it, to avoid a `diceDials.ts` <->
 * `feel/dialStore.ts` import cycle — see `feel/useFeelDials.ts`'s own doc
 * comment). Kept for direct/non-React callers and its own test coverage. */
export function readDiceDials(): DiceDials {
  if (typeof window === 'undefined') return parseDiceDials('');
  return parseDiceDials(window.location.search);
}

/**
 * The drawer/store-driven counterpart to `parseDiceDials` (#906 batch 2,
 * `feel/dialStore.ts`) — resolves from a flat, already-defaulted
 * `DialValues` map (every registered dial's CURRENT value — see
 * `DICE_DIAL_SPECS` below) instead of a raw query string.
 */
export function diceDialsFrom(values: DialValues): DiceDials {
  const requested = values.dieScale;
  const dieScale =
    typeof requested === 'number' && Number.isFinite(requested) && requested > 0
      ? requested
      : DEFAULT_DIE_SCALE;
  const rollFlashRaw = values.rollFlash;
  const rollFlash = (ROLL_FLASH_VALUES as readonly string[]).includes(
    typeof rollFlashRaw === 'string' ? rollFlashRaw : ''
  )
    ? (rollFlashRaw as RollFlashDial)
    : DEFAULT_ROLL_FLASH;
  return { dieScale, rollFlash };
}

/** Every dice dial a player would tune, registered for the feel dials
 * drawer (#906 batch 2, `feel/dials.ts` aggregates this with
 * `CAMERA_DIAL_SPECS`). */
export const DICE_DIAL_SPECS: readonly DialSpec[] = [
  {
    key: 'dieScale',
    label: 'Die scale',
    group: 'dice',
    kind: 'number',
    default: DEFAULT_DIE_SCALE,
    min: 0.25,
    max: 4,
    step: 0.25,
    unit: '×',
  },
  {
    key: 'rollFlash',
    label: 'Roll flash',
    group: 'dice',
    kind: 'enum',
    default: DEFAULT_ROLL_FLASH,
    options: ROLL_FLASH_VALUES,
  },
];

/** `LocalWorldDieLayer.tsx`'s own physics hull radius at `dieScale=1`. */
export const BASE_DIE_HULL_RADIUS = 0.275;

/** `LocalWorldDieLayer.tsx`'s own rest height above `DUNGEON_SURFACE_Y` at
 * `dieScale=1` — shared by `RESET_POSITION` and the throw-plane origin. */
export const BASE_DIE_REST_HEIGHT_ABOVE_SURFACE = 0.75;

/** `LocalWorldDieTile.tsx`'s own default/min/max held height at
 * `dieScale=1`. */
export const BASE_DIE_HOLD_HEIGHT_DEFAULT = 1.25;
export const BASE_DIE_HOLD_HEIGHT_MIN = 0.35;
export const BASE_DIE_HOLD_HEIGHT_MAX = 3;

export interface LocalWorldDieDimensions {
  readonly hullRadius: number;
  readonly restHeightAboveSurface: number;
  readonly holdHeightDefault: number;
  readonly holdHeightMin: number;
  readonly holdHeightMax: number;
}

/** Every physical dimension listed in this module's own doc comment,
 * scaled together from one `dieScale` multiplier. */
export function localWorldDieDimensions(
  dieScale: number
): LocalWorldDieDimensions {
  return {
    hullRadius: BASE_DIE_HULL_RADIUS * dieScale,
    restHeightAboveSurface: BASE_DIE_REST_HEIGHT_ABOVE_SURFACE * dieScale,
    holdHeightDefault: BASE_DIE_HOLD_HEIGHT_DEFAULT * dieScale,
    holdHeightMin: BASE_DIE_HOLD_HEIGHT_MIN * dieScale,
    holdHeightMax: BASE_DIE_HOLD_HEIGHT_MAX * dieScale,
  };
}
