/**
 * SyntyHexFloor — real-dungeon-rendering floor renderer, gated behind
 * HexGrid's `syntyDungeon` dev flag (rpg-dnd5e-web#432 harness-parity).
 * Renders the SAME real `floorTiles` map ShadedHexFloor already consumes
 * (from `synthesizeFloorTiles` — no new reveal concept, no fixed room set)
 * with a Synty stone-tile texture per hex instead of ShadedHexFloor's
 * procedural extruded material.
 *
 * Lifted from SyntyRoomDemo.tsx's `HexFloorTile`/`RoomFloors` (PR #472),
 * generalized from "a fixed 7-hex room" to "every tile in the real
 * floorTiles map". Deliberately drops SyntyRoomDemo's ad-hoc `darken`
 * frontier prop and FRONTIER_HEXES set — fog-edge dimming stays exactly
 * the existing FrontierGroundHint mechanism (rpg-dnd5e-web#457), which
 * HexGrid already renders independently of which floor renderer is active.
 *
 * Known MVP limitation: one `<mesh>` per tile (matching the demo), not
 * ShadedHexFloor's InstancedMesh — fine at this wave's single-room scale,
 * a perf pass if/when this graduates past the dev flag. No hover/select
 * tint either (ShadedHexFloor's HIGHLIGHT_COLORS) — PathPreview and
 * MovementRangeBorder already overlay movement feedback on top of the
 * floor, so this is deliberately floor-texture-only.
 */

import type { AbsoluteFloorTile } from '@/hooks/dungeonMapGeometry';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { useTexture } from '@react-three/drei';
import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { cubeToWorld, hexCorners } from './hexMath';
import { CRYPT_MEMORY_COLOR } from './sceneKnowledge';
import {
  computeFloorPoolColor,
  type FloorPoolLight,
} from './syntyHexFloorHelpers';

const TEX_BASE = '/models/synty/textures/';
const FLOOR_TEXTURE = TEX_BASE + 'Dungeons_Texture_FloorTiles_01.png';

// DUNGEON_SURFACE_Y sits above ShadedHexFloor's extruded top (0.05-0.15),
// so the two never z-fight if both mount during a toggle transition.

/**
 * Crypt-theme floor tint (mid-flight scope addition, rpg-dnd5e-web#558 PR
 * review — Kirk: the floor's unlit MeshBasicMaterial renders full-bright
 * regardless of the scene's near-dark mood lighting, so candle/door light
 * pools visibly land on walls/props but not the floor — "the glowing-white-
 * board effect defeats the whole treatment"). Multiplies the floor texture,
 * same direction as the wall tint (WALL_TINT_BY_THEME in SyntyHexWall.tsx).
 *
 * REVISED (rpg-dnd5e-web#558 follow-up, Kirk's live-webview darkness
 * report): this now feeds an UNLIT `meshBasicMaterial` again (see
 * `isCrypt`'s branch below), not the lit `MeshStandardMaterial` the
 * comment above originally described — see that doc comment and this
 * PR's body for the full tone-mapping-variance rationale. Kept the same
 * color value across the swap so this is purely a lit-vs-unlit A/B, not
 * also a simultaneous hue change.
 */
const CRYPT_FLOOR_TINT = new THREE.Color(0.35, 0.38, 0.46);

interface SyntyHexFloorTileProps {
  tile: AbsoluteFloorTile;
  hexSize: number;
  texture: THREE.Texture;
  /** True for a tile in `themeFloorHexKeys` (rpg-dnd5e-web#558's crypt
   * demo) OR when the whole space is themed `'crypt'` (rpg-dnd5e-web#558
   * real-route consumption) — swaps in `CRYPT_FLOOR_TINT`. Both branches
   * are unlit `MeshBasicMaterial` (see the doc comment below this
   * component's `return` for why) — `isCrypt` only changes the tint
   * color, not the lit/unlit material family, as of the #558 follow-up. */
  isCrypt: boolean;
  isRemembered: boolean;
  /** Mood lights (candles/braziers/torches/doors) to pool toward, via
   * `computeFloorPoolColor` (syntyHexFloorHelpers.ts) — deterministic,
   * device-independent color blending, NOT a lit material (see that
   * file's doc comment for why this is a different lever than the
   * reverted #566/#585 lit-floor experiment). Empty/undefined (every
   * caller before the look-lab lighting experiment) means every tile
   * keeps its flat `CRYPT_FLOOR_TINT`, unchanged. No-op when `isCrypt` is
   * false — pooling only ever applies on top of the crypt tint. */
  poolLights?: readonly FloorPoolLight[];
  /**
   * Dev/Kirk-only A/B toggle back to the reverted #566/#585 approach — a
   * LIT, tinted `MeshStandardMaterial` instead of the unlit default. This
   * exists solely so Kirk can look at it live on his OWN deployed webview
   * if he wants a direct refresher of what was reverted and why; a local
   * Playwright screenshot of this branch proves nothing about the #481
   * cross-environment tone-mapping risk that caused the revert (that's
   * the whole reason it was reverted — it looked fine locally too). Do
   * NOT treat this path's local screenshots as evidence for or against
   * anything. Default false/undefined for every caller.
   */
  litSurfaces?: boolean;
}

function SyntyHexFloorTile({
  tile,
  hexSize,
  texture,
  isCrypt,
  isRemembered,
  poolLights,
  litSurfaces,
}: SyntyHexFloorTileProps) {
  const world = cubeToWorld({ x: tile.x, y: tile.y, z: tile.z }, hexSize);
  const cryptColor = useMemo(() => {
    if (!isCrypt) return CRYPT_FLOOR_TINT;
    if (!poolLights || poolLights.length === 0) return CRYPT_FLOOR_TINT;
    return computeFloorPoolColor(
      CRYPT_FLOOR_TINT,
      world.x,
      world.z,
      poolLights
    );
  }, [isCrypt, poolLights, world.x, world.z]);
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    const corners = hexCorners({ x: 0, z: 0 }, hexSize);
    // hexCorners' z already applies the world-space z = -sin(angle)
    // convention (for alignment with cubeToWorld) — feeding it straight
    // into the shape's local Y would wind the 2D shape clockwise (Copilot
    // review #477), flipping the face normal away from the overhead
    // camera post-rotateX. Negate it to restore the CCW winding
    // SyntyRoomDemo's original HexFloorTile (and ShadedHexFloor) use:
    // local y = +size*sin(angle), which rotateX(-90deg) then maps to
    // world -z, matching cubeToWorld's convention on the OTHER axis.
    corners.forEach((c, i) => {
      if (i === 0) shape.moveTo(c.x, -c.z);
      else shape.lineTo(c.x, -c.z);
    });
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);

    // ShapeGeometry's default UVs are the shape's raw local coordinates,
    // not normalized to [0,1] — remap against the hex's own bounding box
    // so the texture tiles across the whole hex instead of clamping to a
    // single dark edge texel (see SyntyRoomDemo.tsx's HexFloorTile, which
    // this is lifted from).
    const pos = geo.getAttribute('position');
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = (pos.getX(i) + hexSize) / (2 * hexSize);
      uv[i * 2 + 1] = (pos.getY(i) + hexSize) / (2 * hexSize);
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [hexSize]);

  // rpg-dnd5e-web#481: MeshStandardMaterial (PBR, lit) rendered this floor
  // nearly invisible in the deployed environment — under the scene's
  // ambientLight(0.6)/directionalLight(0.8) rig plus r3f's default ACES
  // tone-mapping, a fully-rough unlit-by-comparison texture compresses down
  // close to black, and Kirk's Discord webview frame was measurably darker
  // than local dev frames of the same build (GPU/tone-mapping path
  // difference, unconfirmed but real). ShadedHexFloor's cel-shader reads
  // fine in the same rig because it's a hand-tuned custom shader with its
  // own guaranteed-bright output, not dependent on scene lights at all.
  // MeshBasicMaterial matches that: fully unlit, renders the texture at a
  // light-rig-independent brightness. MeshBasicMaterial is still tone-mapped
  // by default (Copilot review #485) — toneMapped={false} makes the
  // texture's own pixel values the final word, killing the cross-
  // environment variance #481 exists to fix.
  //
  // `isCrypt` REVISED (rpg-dnd5e-web#558 follow-up, Kirk's live-webview
  // darkness report — "cannot see any assets"): PR #566/#585 originally
  // swapped the crypt floor to a LIT, tinted MeshStandardMaterial so
  // ambient/point lights would visibly pool on it ("the glowing-white-
  // board effect defeats the whole treatment" — see git history for that
  // version). That reintroduces the EXACT #481 tone-mapping dependence
  // this file's unlit default exists to avoid, on the one surface that
  // covers most of the screen — a strong candidate explanation for why
  // the crypt reads far darker on Kirk's deployed webview than in local
  // captures. This reverts the crypt branch to the SAME unlit
  // MeshBasicMaterial family as the default, just re-tinted — trading
  // away the "light visibly pools on the floor" mood effect for
  // environment-independent floor brightness. Offered as a judgment call,
  // not a unilateral decision: see this PR's body for the trade-off
  // write-up (walls still use lit GLB materials either way, so this alone
  // doesn't fully close the tone-mapping question — only the floor's
  // slice of it).
  return (
    <mesh geometry={geometry} position={[world.x, DUNGEON_SURFACE_Y, world.z]}>
      {isRemembered ? (
        <meshBasicMaterial
          color={CRYPT_MEMORY_COLOR}
          opacity={1}
          transparent={false}
          depthWrite
          toneMapped={false}
        />
      ) : isCrypt && litSurfaces ? (
        // Dev/Kirk-only A/B — see `litSurfaces` prop doc comment above.
        // Deliberately the SAME lit/tinted approach #566/#585 shipped and
        // #587 reverted (not a new untested variant), so what Kirk sees
        // here is a precise re-creation of the exact thing that was
        // reverted, opt-in instead of default, rather than a new unknown.
        <meshStandardMaterial map={texture} color={cryptColor} />
      ) : isCrypt ? (
        <meshBasicMaterial
          map={texture}
          color={cryptColor}
          toneMapped={false}
        />
      ) : (
        // Byte-identical to every pre-#558 caller: no `color` prop at all
        // (not even `undefined`), matching this exact branch before the
        // crypt theme existed — avoids relying on how the reconciler
        // would handle an explicitly-undefined color prop.
        <meshBasicMaterial map={texture} toneMapped={false} />
      )}
    </mesh>
  );
}

export interface SyntyHexFloorProps {
  floorTiles: Map<string, AbsoluteFloorTile>;
  hexSize: number;
  /** Floor-tile keys ("x,y,z", coordToKey format) that should render with
   * the lit, tinted crypt material instead of the default unlit one
   * (rpg-dnd5e-web#558). Undefined/omitted (every existing caller) means
   * every tile keeps the exact pre-existing #481/#485 rendering. */
  themeFloorHexKeys?: ReadonlySet<string>;
  rememberedFloorHexKeys?: ReadonlySet<string>;
  /**
   * Whole-space theme (rpg-dnd5e-web#558 real-route consumption): when set
   * to `'crypt'`, EVERY tile renders with the lit/tinted crypt material,
   * regardless of `themeFloorHexKeys`. Additive with `themeFloorHexKeys`
   * (a tile counts as crypt if EITHER says so) — the harness's
   * `?cryptdemo=1` room keeps using the per-hex set to theme only its own
   * injected floor inside an otherwise real scene; a real crypt encounter
   * has no such per-hex mix and themes its whole floor via this prop.
   * Undefined (every caller before this prop existed) is a pure passthrough
   * to `themeFloorHexKeys`, unchanged.
   */
  spaceTheme?: 'crypt';
  /** See `SyntyHexFloorTileProps.poolLights` — forwarded to every tile
   * unchanged. Empty/undefined (every caller before the look-lab lighting
   * experiment) is a no-op. */
  poolLights?: readonly FloorPoolLight[];
  /** See `SyntyHexFloorTileProps.litSurfaces` — dev/Kirk-only A/B,
   * default false/undefined for every caller. */
  litSurfaces?: boolean;
}

export function SyntyHexFloor({
  floorTiles,
  hexSize,
  themeFloorHexKeys,
  rememberedFloorHexKeys,
  spaceTheme,
  poolLights,
  litSurfaces,
}: SyntyHexFloorProps) {
  // useTexture returns drei's shared, URL-keyed texture cache — mutating it
  // directly during render is a render-phase side effect on shared state
  // (Copilot review on #472). Clone it and configure the clone instead.
  const baseMap = useTexture(FLOOR_TEXTURE);
  const floorMap = useMemo(() => {
    const t = baseMap.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    t.needsUpdate = true;
    return t;
  }, [baseMap]);

  useEffect(() => {
    return () => floorMap.dispose();
  }, [floorMap]);

  const tiles = useMemo(() => Array.from(floorTiles.values()), [floorTiles]);

  return (
    <Suspense fallback={null}>
      {tiles.map((tile) => {
        const key = `${tile.x},${tile.y},${tile.z}`;
        return (
          <SyntyHexFloorTile
            key={key}
            tile={tile}
            hexSize={hexSize}
            texture={floorMap}
            isCrypt={
              spaceTheme === 'crypt' || (themeFloorHexKeys?.has(key) ?? false)
            }
            isRemembered={rememberedFloorHexKeys?.has(key) ?? false}
            poolLights={poolLights}
            litSurfaces={litSurfaces}
          />
        );
      })}
    </Suspense>
  );
}
