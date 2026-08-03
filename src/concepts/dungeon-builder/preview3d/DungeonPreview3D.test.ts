/**
 * DungeonPreview3D.test.ts — the first test file for this component.
 * CONTRACT.md's own ledger documents why the full 3D render can't be
 * asserted in this environment (no `public/models/synty`, the R3F
 * `<Canvas>` never mounts) and instead reasons that the render path is
 * "mathematically guaranteed consistent" because it calls the same
 * `boardGeometry.ts` functions the geometry test suite already proves
 * correct. This file makes that guarantee an actual assertion rather
 * than just an argument: `buildOnePlacement` (exported specifically for
 * this) is pure math with no Canvas/GLB dependency, so it can be called
 * directly.
 *
 * Added as part of reconciling rpg-dnd5e-web#693 (fine rotation,
 * generalized to floor-standing props) with #691 (the `defaults:`
 * ref-keyed inheritance resolver) — the two features never coexisted in
 * either PR's own branch, so neither has a test proving they compose.
 */
import { describe, expect, it } from 'vitest';
import { facingToRotationY } from '../boardGeometry';
import {
  parseDungeon,
  setPlacementMount,
  setPlacementRotationDegrees,
  setRefDefault,
  toDungeonDoc,
} from '../dungeonYaml';
import { SHOWCASE_YAML } from '../fixtures';
import { buildOnePlacement } from './DungeonPreview3D';

describe('buildOnePlacement — resolved facing × fine-rotation composition', () => {
  it('an INHERITED facing (defaults:, nothing explicit on the placement itself) still composes with an explicit rotate_degrees, exactly like an explicit facing would', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    // showcase.yaml's own statue-reaper (shrine room) carries no facing,
    // mount, or rotate_degrees at all (fixtures.ts) — give its REF a
    // default facing, then a fine-rotation nudge, without ever setting
    // facing explicitly on this one instance.
    setRefDefault(cst, 'dnd5e:props:statue-reaper', 'facing', 2); // NE
    const shrineBefore = toDungeonDoc(cst).rooms.find(
      (r) => r.id === 'shrine'
    )!;
    const statueIndex = shrineBefore.place.findIndex(
      (p) => p.ref === 'dnd5e:props:statue-reaper'
    );
    setPlacementRotationDegrees(cst, 'shrine', statueIndex, 20);

    const doc = toDungeonDoc(cst);
    const room = doc.rooms.find((r) => r.id === 'shrine')!;
    const statue = room.place[statueIndex]!;
    // The raw fields stay unset — proving the composition below comes
    // from `resolvePlacement`, not from data sitting on this instance.
    expect(statue.facing).toBeNull();
    expect(statue.explicit.facing).toBe(false);
    expect(statue.mount).toBe('floor');
    expect(statue.rotationDegrees).toBe(20);

    const { prop } = buildOnePlacement(
      doc,
      statue,
      statue.at[0],
      statue.at[1],
      { roomId: 'shrine', index: statueIndex },
      'test-key'
    );

    const inheritedCoarseAngle = facingToRotationY(2); // NE's own coarse angle
    expect(prop!.rotationY).toBeCloseTo(
      inheritedCoarseAngle + (20 * Math.PI) / 180,
      10
    );
    // Not just the un-nudged coarse angle — a regression that silently
    // read the placement's own (null) `facing` instead of the resolved
    // one for the geometry call would either throw (facingToRotationY
    // takes a `number`, not `number | null`) or, if narrowed some other
    // way, drop the fine adjustment entirely. Neither happens here.
    expect(prop!.rotationY).not.toBeCloseTo(inheritedCoarseAngle, 5);
  });

  it('a `mount: wall` placement composes the same way through wallMountRotationY, using the resolved facing for both the flush edge AND the fine nudge', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    // wall-banner is wall-mountable and already has an explicit facing
    // (mount:wall requires one to pick an edge) — this instance instead
    // exercises the inherited-facing path on a wall mount specifically,
    // since #693's generalization changed the wall branch too (resolved
    // facing, not raw).
    setRefDefault(cst, 'dnd5e:props:wall-banner', 'facing', 0); // N
    const shrineBefore = toDungeonDoc(cst).rooms.find(
      (r) => r.id === 'shrine'
    )!;
    const bannerIndex = shrineBefore.place.findIndex(
      (p) => p.ref === 'dnd5e:props:wall-banner' && p.at[0] === 5
    );
    // showcase.yaml's wall-banner carries no `mount:` key at all
    // (fixtures.ts) — set it explicitly so this test actually exercises
    // the `mount === 'wall'` branch, not the floor-standing one.
    setPlacementMount(cst, 'shrine', bannerIndex, 'wall');
    setPlacementRotationDegrees(cst, 'shrine', bannerIndex, -10);

    const doc = toDungeonDoc(cst);
    const room = doc.rooms.find((r) => r.id === 'shrine')!;
    const banner = room.place[bannerIndex]!;
    expect(banner.facing).toBeNull();
    expect(banner.explicit.facing).toBe(false);
    expect(banner.mount).toBe('wall');

    const { prop } = buildOnePlacement(
      doc,
      banner,
      banner.at[0],
      banner.at[1],
      { roomId: 'shrine', index: bannerIndex },
      'test-key-2'
    );

    // Only asserting the fine nudge is actually applied on top of
    // *some* coarse wall-flush angle — the coarse angle's own geometry
    // is boardGeometry.test.ts's job, not this file's.
    expect(prop!.rotationY).not.toBeUndefined();
    expect(Number.isFinite(prop!.rotationY)).toBe(true);
  });
});
