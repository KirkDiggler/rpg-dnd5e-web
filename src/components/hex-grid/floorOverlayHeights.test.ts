/**
 * Floor overlay Y-offset regression tests
 *
 * Why this test exists:
 *
 * `ShadedHexFloor` (the dev-flag-off floor renderer) extrudes each hex tile
 * from y=0.05 to y=0.15 in world space. `SyntyHexFloor` (the DEFAULT floor
 * renderer — see EncounterMap.tsx / PlaytestMap.tsx) is a flat, unextruded
 * plane positioned at world y=0.2 (its `FLOOR_Y` const — the geometry has
 * zero local thickness, so 0.2 is both its base AND its top). Two overlay
 * components draw on top of whichever floor is mounted:
 *
 *   - `MovementRangeBorder` — cyan glowing perimeter around reachable hexes
 *   - `PathPreview`         — blue path-fill on hexes the player will cross
 *
 * Both predate the move from flat `ShapeGeometry` (`InstancedHexTiles`) to
 * the extruded `ExtrudeGeometry` in `ShadedHexFloor`. Their original
 * Y-offsets (0.05 for the border, 0.03 for the path) were chosen for the
 * flat tiles at y=0 and were never raised when the floor grew an extrusion.
 *
 * Result: the cyan range indicator rendered AT the bottom face of the
 * floor extrusion (y=0.05) and the blue path rendered UNDER it (y=0.03).
 * Both were occluded by the opaque top face at y=0.15 — the Wave 2
 * playtest "range indicator below the floor" symptom.
 *
 * A 2026-05-05 fix (bd6c2db) raised both offsets above ShadedHexFloor's
 * 0.15 top and added this test — but `SyntyHexFloor` shipped later (PR
 * #477) with its opaque, depth-writing plane at 0.2, taller than Shaded's
 * top and ABOVE the (then-adequate) overlay offsets, silently reintroducing
 * the exact same "markers under the floor" symptom under the default floor
 * renderer (rpg-dnd5e-web#535).
 *
 * This test is a hard regression guard: any future change that drops these
 * offsets back below EITHER floor variant's top will fail loudly.
 *
 * Source-text inspection (matching AdvancedCharacterShader.test.ts) avoids
 * needing a real WebGL context.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Floor extrusion top in world Y.
 *
 * Derivation from `ShadedHexFloor.tsx`:
 *   - `ExtrudeGeometry({ depth: 0.1 })` extrudes the 2D hex shape from
 *     local z=0 to local z=0.1.
 *   - `geometry.rotateX(-Math.PI / 2)` maps local +z to world +y, so
 *     the extruded volume now spans world y in [0, 0.1].
 *   - `geometry.translate(0, 0.05, 0)` shifts the whole mesh up by 0.05,
 *     so the volume spans world y in [0.05, 0.15].
 *
 * Any overlay drawn at y < 0.15 is INSIDE or BELOW the floor extrusion.
 */
const FLOOR_TOP_Y = 0.15;

/**
 * SyntyHexFloor is the DEFAULT floor renderer (EncounterMap.tsx /
 * PlaytestMap.tsx render it unconditionally; ShadedHexFloor only mounts
 * behind the `?syntyDungeon=0` dev flag). Its tile mesh is a flat
 * `ShapeGeometry` with no extrusion — `rotateX(-Math.PI / 2)` collapses all
 * local Y to 0, so the mesh's `FLOOR_Y` position IS its top face, not a
 * base under some taller top. Extracted from source (not hardcoded) so a
 * future change to SyntyHexFloor's height can't silently desync this test.
 */
const SYNTY_FLOOR_TOP_CONST = 'FLOOR_Y';

function readSource(relativePath: string): string {
  return readFileSync(resolve(HERE, relativePath), 'utf-8');
}

function extractNumberConst(src: string, name: string): number {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)\\b`);
  const match = re.exec(src);
  if (!match) {
    throw new Error(`Could not find numeric const ${name} in source`);
  }
  return Number(match[1]);
}

describe('floor overlay Y offsets clear the floor extrusion top', () => {
  it('MovementRangeBorder Y offset is above the floor top', () => {
    const src = readSource('./MovementRangeBorder.tsx');
    const offset = extractNumberConst(src, 'BORDER_Y_OFFSET');
    expect(offset).toBeGreaterThan(FLOOR_TOP_Y);
  });

  it('PathPreview Y offset is above the floor top', () => {
    const src = readSource('./PathPreview.tsx');
    const offset = extractNumberConst(src, 'PATH_Y_OFFSET');
    expect(offset).toBeGreaterThan(FLOOR_TOP_Y);
  });

  it('MovementRangeBorder draws above PathPreview to win z-fighting on shared edges', () => {
    // The cyan range outline should read on top of the blue path fill on
    // hexes that are simultaneously reachable-edge AND on the previewed
    // path. Equal offsets would z-fight; the border must be strictly higher.
    const borderSrc = readSource('./MovementRangeBorder.tsx');
    const pathSrc = readSource('./PathPreview.tsx');
    const borderOffset = extractNumberConst(borderSrc, 'BORDER_Y_OFFSET');
    const pathOffset = extractNumberConst(pathSrc, 'PATH_Y_OFFSET');
    expect(borderOffset).toBeGreaterThan(pathOffset);
  });

  it('floor extrusion math has not drifted from the documented top y', () => {
    // Guard against ShadedHexFloor changing its extrusion depth or vertical
    // translate without this regression test being updated alongside.
    const src = readSource('./ShadedHexFloor.tsx');
    expect(src).toContain('depth: 0.1');
    expect(src).toContain('geometry.translate(0, 0.05, 0)');
  });

  it('MovementRangeBorder Y offset is above SyntyHexFloor (the default floor) top', () => {
    const overlaySrc = readSource('./MovementRangeBorder.tsx');
    const floorSrc = readSource('./SyntyHexFloor.tsx');
    const offset = extractNumberConst(overlaySrc, 'BORDER_Y_OFFSET');
    const syntyTop = extractNumberConst(floorSrc, SYNTY_FLOOR_TOP_CONST);
    expect(offset).toBeGreaterThan(syntyTop);
  });

  it('PathPreview Y offset is above SyntyHexFloor (the default floor) top', () => {
    const overlaySrc = readSource('./PathPreview.tsx');
    const floorSrc = readSource('./SyntyHexFloor.tsx');
    const offset = extractNumberConst(overlaySrc, 'PATH_Y_OFFSET');
    const syntyTop = extractNumberConst(floorSrc, SYNTY_FLOOR_TOP_CONST);
    expect(offset).toBeGreaterThan(syntyTop);
  });

  it('SyntyHexFloor is unextruded, so FLOOR_Y is genuinely its top face', () => {
    // Guard the "flat plane, position IS the top" assumption the two tests
    // above rely on. If SyntyHexFloor ever grows real extrusion depth (an
    // ExtrudeGeometry with a `depth` option instead of ShapeGeometry), its
    // true top would be FLOOR_Y + depth, not FLOOR_Y, and the tests above
    // would need updating alongside.
    const src = readSource('./SyntyHexFloor.tsx');
    expect(src).toContain('new THREE.ShapeGeometry(shape)');
    // Match actual constructor usage, not a bare word — a prose comment
    // mentioning "ExtrudeGeometry" (e.g. contrasting with ShadedHexFloor)
    // must not trip this guard; only a real `new ExtrudeGeometry(...)` call
    // should.
    expect(src).not.toMatch(/new\s+(THREE\.)?ExtrudeGeometry\(/);
  });
});
