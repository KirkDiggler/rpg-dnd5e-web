/**
 * The feel dials registry (#906 batch 2) — aggregates every camera/dice dial
 * spec into one typed list, keyed for lookup. Pure data: no store, no React.
 *
 * Import direction is one-way (no cycle): this file imports the SPECS
 * arrays from `cameraDials.ts`/`diceDials.ts`; neither of those imports
 * anything from here or from `feel/dialStore.ts` — they only import the
 * leaf `DialSpec`/`DialValues` TYPES from `feel/dialTypes.ts`.
 */
import { CAMERA_DIAL_SPECS } from '@/components/hex-grid/cameraDials';
import { DICE_DIAL_SPECS } from '@/components/session/local-world-die/diceDials';
import type { DialSpec } from './dialTypes';

export type {
  DialGroup,
  DialSpec,
  DialValues,
  EnumDialSpec,
  NumberDialSpec,
} from './dialTypes';

/** Every registered dial, camera specs first. */
export const ALL_DIAL_SPECS: readonly DialSpec[] = [
  ...CAMERA_DIAL_SPECS,
  ...DICE_DIAL_SPECS,
];

const SPECS_BY_KEY: ReadonlyMap<string, DialSpec> = new Map(
  ALL_DIAL_SPECS.map((spec) => [spec.key, spec])
);

export function getDialSpec(key: string): DialSpec | undefined {
  return SPECS_BY_KEY.get(key);
}

/** Every registered key's own spec default, as a fully-populated map — the
 * base layer of the store's precedence chain (defaults <- localStorage <-
 * URL, see dialStore.ts). */
export function defaultDialValues(): Record<string, number | string> {
  const values: Record<string, number | string> = {};
  for (const spec of ALL_DIAL_SPECS) values[spec.key] = spec.default;
  return values;
}

/**
 * Validate/coerce one raw value against its spec: a number spec clamps to
 * `[min, max]` (a non-finite input falls back to the spec's own default,
 * same "never poison the dial with NaN" rule `numberDial` already uses); an
 * enum spec accepts only a listed option, else the default.
 */
export function validateDialValue(
  spec: DialSpec,
  raw: unknown
): number | string {
  if (spec.kind === 'number') {
    const n =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string'
          ? Number(raw)
          : NaN;
    if (!Number.isFinite(n)) return spec.default;
    return Math.min(spec.max, Math.max(spec.min, n));
  }
  return typeof raw === 'string' &&
    (spec.options as readonly string[]).includes(raw)
    ? raw
    : spec.default;
}
