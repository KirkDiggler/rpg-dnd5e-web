/**
 * The shared decoder primitives (rpg-project#857, rpg-dnd5e-web#1136).
 *
 * THE STUDIO LOADS WHATEVER THE ENGINE RUNS: the dungeonspec compiler is the
 * validator; fields the studio does not author are preserved and written back
 * unchanged. `carryUnknownKeys` is the one way a decoder keeps a field it does
 * not read. `rejectUnknownKeys` is only for the studio's own stored formats.
 *
 * `roomDraft.ts` re-exports `objectShape` and `rejectUnknownKeys`, so existing
 * callers (`roomSceneJson.ts`) are untouched.
 */

/** Own data on `target`, even for a key named __proto__. */
export function putOwn(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/** A field the studio does not read, deep-copied as written. */
export function carriedCopy(value: unknown): unknown {
  return value === undefined ? value : structuredClone(value);
}

/**
 * THE IMPORT MECHANISM (rpg-project#857): every key of `source` the decoder
 * does not read (`known`) is copied onto `into`, its decoded value, as
 * written. The draft holds it, storage keeps it, and the encoder writes it
 * back; the studio never refuses it. Returns `into`.
 */
export function carryUnknownKeys<T extends object>(
  source: Record<string, unknown>,
  known: readonly string[],
  into: T
): T {
  for (const key of Object.keys(source))
    if (!known.includes(key)) putOwn(into, key, carriedCopy(source[key]));
  return into;
}

/** Structurally exact records only, for the studio's OWN stored formats
 * (the local workspace): an unknown field there is refused, not dropped.
 * A dungeon file never comes here; its decoders carry what they do not read
 * (`carryUnknownKeys`). Arrays are never mapping shapes. */
export function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key))
      throw new Error(`${label} has an unsupported field: ${key}.`);
  }
}

export const objectShape = (
  value: unknown,
  label: string
): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
};
