/**
 * Rolls a fair d20: an integer in [1, 20] inclusive, uniformly distributed.
 *
 * Takes an injectable RNG (defaulting to `Math.random`) so callers — chiefly
 * `PromptModal`'s real-game skill-check roll (rpg-dnd5e-web#597) — can pass a
 * deterministic source under test instead of stubbing the global.
 */
export function rollD20(random: () => number = Math.random): number {
  return Math.floor(random() * 20) + 1;
}
