/**
 * A warded cast's response-only notice. The ward's save itself is told by
 * the act stream's story (`combat-experience/describeAct.ts`); the v1 beat
 * line that formatted it here left with the v1 stream (rpg-dnd5e-web#1305).
 */
export function wardedCastNotice(
  targets: readonly string[],
  name: (id: string) => string
): string | undefined {
  return targets.length
    ? `The spell was blocked by a ward for: ${targets.map(name).join(', ')}.`
    : undefined;
}
