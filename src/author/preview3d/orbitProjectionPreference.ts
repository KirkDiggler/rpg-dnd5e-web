/**
 * orbitProjectionPreference — the pure, testable half of DungeonPreview3D's
 * Orbit-mode projection toggle (world-parity unit, see boardGeometry.ts's
 * own "THE CANONICAL WORLD" doc comment for why this toggle exists:
 * Orbit's perspective camera doesn't reliably preview a facing-sensitive
 * placement the way the game's own orthographic tactical camera will, and
 * rather than this file silently picking a side of that "editing
 * legibility vs preview fidelity" tradeoff, Kirk can flip it live on his
 * own doc and judge by feel).
 *
 * Read/write split out from the component's `useState` initializer/setter
 * so the storage plumbing itself — key, default, and the string encoding
 * — is covered by a direct unit test instead of only ever exercised
 * through a full component mount (this file's own "the full 3D render
 * can't be asserted in this environment" limitation, `DungeonPreview3D.
 * test.ts`'s own header comment). Storage is typed as the minimal `Pick`
 * each function actually needs, not the full `Storage` interface, so a
 * test double doesn't have to fake the rest of `localStorage`'s surface.
 */

export const ORBIT_ORTHO_STORAGE_KEY = 'dg-orbit-orthographic';

/**
 * Default is `false` (perspective) — every existing session, and every
 * environment with no `Storage` at all (SSR, a test double that omits it),
 * sees the SAME projection this toggle existed before it did. Only an
 * explicit `'1'` opts in; any other stored value (including a future
 * format this code doesn't recognize) falls back to the safe default
 * rather than throwing or opting in by accident.
 */
export function readOrbitOrthographicPreference(
  storage: Pick<Storage, 'getItem'> | undefined
): boolean {
  if (!storage) return false;
  return storage.getItem(ORBIT_ORTHO_STORAGE_KEY) === '1';
}

export function writeOrbitOrthographicPreference(
  storage: Pick<Storage, 'setItem'> | undefined,
  value: boolean
): void {
  storage?.setItem(ORBIT_ORTHO_STORAGE_KEY, value ? '1' : '0');
}
