/**
 * Floor overlay Y-offset regression tests
 *
 * Why this test exists:
 *
 * `ShadedHexFloor` (the canonical floor tile renderer) extrudes each hex
 * tile from y=0.05 to y=0.15 in world space. Two overlay components draw
 * on top of those tiles:
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
 * This test is a hard regression guard: any future change that drops these
 * offsets back below the floor extrusion top will fail loudly.
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
});
