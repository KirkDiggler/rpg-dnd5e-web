/**
 * resolvePropRotationY (rpg-dnd5e-web unit/game-fidelity Bug B): the
 * live game route's own facing-to-rotationY resolution, pulled out of
 * HexGrid's render loop so the precedence rule (wall-adjacent computed
 * rotation wins, then an authored wire facing, then no rotation at all) and
 * the facing conversion itself are covered by a direct test instead of only
 * a live-render assertion.
 *
 * The facing conversion MUST match the builder's 3D preview
 * (author/preview3d/DungeonPreview3D.tsx) exactly — Kirk approved that
 * preview's rotations as correct against TARGET-YAML.md's E/NE/NW/W/SW/SE
 * convention, so the live game route has to render the SAME facing value
 * as the SAME rotation, not an independently-derived equivalent (this
 * codebase's own "MEASURED, not inferred" facing-offset discipline —
 * facing.ts's doc comment names a prior naive-derivation hazard that
 * silently cancelled to 2*PI). resolvePropRotationY delegates to
 * boardGeometry.ts's facingToRotationY directly rather than reimplementing
 * it, and the test below pins that delegation for all 6 directions.
 */
import { facingToRotationY } from '@/components/hex-grid/authorGridHelpers';
import { describe, expect, it } from 'vitest';
import { resolvePropRotationY } from './HexGrid';

describe('resolvePropRotationY', () => {
  it('returns undefined when neither a wall-adjacent rotation nor an authored facing is present', () => {
    expect(resolvePropRotationY(undefined, undefined)).toBeUndefined();
  });

  it('prefers the computed wall-adjacent rotation over an authored facing', () => {
    // Wall-adjacent rotation solves a DIFFERENT problem (flush against a
    // specific wall face) than a bare facing conversion — it must win
    // whenever both are present, same as before this field existed.
    expect(resolvePropRotationY(1.2345, 3)).toBe(1.2345);
  });

  it('falls back to facingToRotationY(facing) when no wall-adjacent rotation is present', () => {
    for (let facing = 0; facing < 6; facing++) {
      expect(resolvePropRotationY(undefined, facing)).toBe(
        facingToRotationY(facing)
      );
    }
  });

  it('E (facing 0) — the same anchor value the builder preview renders — is 0 radians', () => {
    // Sanity anchor, not just a delegation check: E is the wire's facing=0
    // and this codebase's `HEX_DIRECTIONS`/`HEX_FACING_LABELS` +x axis, so a
    // statue authored facing East should render unrotated.
    expect(resolvePropRotationY(undefined, 0)).toBeCloseTo(0);
  });
});
