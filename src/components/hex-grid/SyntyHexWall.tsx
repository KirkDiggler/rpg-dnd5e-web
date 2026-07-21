/**
 * SyntyHexWall — real-dungeon-rendering wall/door renderer, gated behind
 * HexGrid's `syntyDungeon` dev flag (rpg-dnd5e-web#432 harness-parity).
 * Renders the ENTIRE `walls: Wall[]` list HexGrid already has (unlike
 * ShadedHexWall, which mounts once per Wall — see below for why).
 *
 * The geometry mismatch this fixes: ShadedHexWall/WallBuilder.createWallBetween
 * places a box whose long axis runs from hex CENTER to hex CENTER
 * (perpendicular to the actual shared boundary, passing through both cell
 * interiors). SyntyRoomDemo.tsx's `computeBorderEdges` aligns a piece along
 * the actual shared EDGE instead — that's the primitive this component
 * uses, via the generalized `hexEdgeBetween` (hexMath.ts).
 *
 * Why this takes the full wall list, not one Wall at a time (a correction
 * made after checking real server data, not assumed): every `Wall` a real
 * encounter emits today is single-cell (`from === to`) — a wall is a
 * BLOCKED CELL, not a from/to boundary line. `buildDungeonWallSegments`
 * (syntyHexWallHelpers.ts) generalizes SyntyRoomDemo's `computeBorderEdges`
 * correctly for this: instead of "ROOM_SET membership" deciding which
 * edges are borders, "wall-hex-set membership" (built from ALL Wall
 * objects together, since a wall hex's neighbor often belongs to a
 * *different* Wall entry) does — a piece renders on every edge of every
 * wall hex that faces a NON-wall neighbor.
 *
 * Piece selection: doors stay minimal for this slice — ONE default piece
 * per door WallKind (DOOR_CLOSED/DOOR_OPEN → door + frame), matching
 * ShadedHexWall's `getKindColor` switch; door variety is wave 2 (per
 * rpg-game-assets#2's manifest, door-open reuses the door-closed GLBs via
 * a render-time rotation, not a second model, so "wave 2" is genuinely
 * about wiring door STATE to this role, not sourcing new assets). Wall
 * segments (SOLID/UNSPECIFIED/WINDOW) get deterministic-per-edge variety
 * (plain/broken/alcove) from rpg-game-assets#2's piece→semantic-role
 * manifest — see syntyHexWallHelpers.ts's WALL_VARIANTS/selectWallVariant.
 */

import { SYNTY_SCALE, WALL_HEIGHT } from '@/rendering/calibrationConstants';
import {
  WallKind,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useGLTF } from '@react-three/drei';
import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import type { WorldPos } from './hexMath';
import {
  buildDungeonWallSegments,
  classifyWallVertices,
  edgePieceKind,
  FITTINGS,
  fittingScale,
  selectWallVariant,
  wallEndEdgeKeys,
  wallVariantScale,
  type WallTheme,
} from './syntyHexWallHelpers';

const ENV_BASE = '/models/synty/env/';

// Raw (scale=1) local-space bounding size measured directly off the GLB
// (see rpg-dnd5e-web#472's PR description for the inspection script/output).
// Local X = width, Y = height, Z = thickness/depth. Wall pieces now source
// their own per-variant raw dimensions from WALL_VARIANTS instead of a
// single hardcoded pair (rpg-game-assets#2 wall-variety slice).
const DOOR_FRAME_RAW_WIDTH = 1.999; // SM_Env_Door_Frame_01 (pivot centered)

// Door frame: squeeze width to the edge like the wall, but keep
// height/depth at SYNTY_SCALE — a human-scale feature, not clamped to the
// short game wall height.
const DOOR_FRAME_SCALE: [number, number, number] = [
  1.0 / DOOR_FRAME_RAW_WIDTH,
  SYNTY_SCALE,
  SYNTY_SCALE,
];

// SM_Env_Door_01 is 1.3236 wide at scale 1 (pivot at one end, like the wall
// piece) — 1.3236 * 0.75 = 0.9927, a near-perfect fit against a 1.0 edge.
const DOOR_SCALE = SYNTY_SCALE;

// Placeholder-acceptable open pose (rpg-dnd5e-web#526, wave rpg-project#96
// Slice 2): the door leaf GLB's pivot is at one end (edge.a, like the wall
// piece), so swinging it open is a render-time Y-rotation about that same
// pivot — no second model needed (matches this file's original doc comment
// anticipating exactly this). The asset lane (web#523) owns the final open
// pose/art; this is only a clearly-observable open-vs-closed state flip.
const DOOR_OPEN_ROTATION_OFFSET = (80 * Math.PI) / 180;

/**
 * Per-theme material tint (mid-flight scope addition, rpg-dnd5e-web#558 —
 * Kirk's POLYGON Dark Fortress reference: dark cool-gray stone, not tan
 * brick on a bright atlas). No darker Synty atlas exists for this pack
 * (verified against the source textures — colorways are accent-only, see
 * memory), so this is a multiplicative color tint applied in-engine,
 * matching the character-tint pattern already used elsewhere in this
 * codebase (rpg-dnd5e-web#515). `'default'` gets no entry here, so
 * `tintForTheme` returns `undefined` for it and GlbInstance skips the
 * clone-and-tint path entirely — every existing (non-crypt) caller is
 * untouched.
 */
const WALL_TINT_BY_THEME: Partial<Record<WallTheme, THREE.Color>> = {
  crypt: new THREE.Color(0.32, 0.36, 0.46), // dark, cool blue-gray stone
};

interface GlbInstanceProps {
  file: string;
  position: WorldPos;
  rotationY: number;
  scale: [number, number, number] | number;
  /** Multiplicative color tint for this instance only — clones each
   * mesh's material before tinting it, so the shared useGLTF cache (and
   * every OTHER instance of the same GLB) is never mutated. Undefined
   * (every existing caller) renders the GLB's original material,
   * unchanged. */
  tint?: THREE.Color;
}

/** Renders one instance of a GLB. useGLTF caches the loaded scene by URL,
 * so repeated placements of the same file must each clone the cached
 * Object3D — reusing the same instance across multiple `<primitive>`s
 * would just reparent it to the last placement (SyntyRoomDemo.tsx). */
function GlbInstance({
  file,
  position,
  rotationY,
  scale,
  tint,
}: GlbInstanceProps) {
  const { scene } = useGLTF(ENV_BASE + file);
  const cloned = useMemo(() => {
    const clone = scene.clone(true);
    if (!tint) return clone;
    // Clone (never mutate) each mesh's material before tinting — mutating
    // the shared cached material would darken every other instance of
    // this same GLB across the whole scene, including 'default'-theme
    // walls sharing the file.
    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const tintOne = (material: THREE.Material) => {
        if (!('color' in material)) return material;
        const tinted = material.clone() as THREE.Material & {
          color: THREE.Color;
        };
        tinted.color = (
          material as THREE.Material & { color: THREE.Color }
        ).color
          .clone()
          .multiply(tint);
        return tinted;
      };
      child.material = Array.isArray(child.material)
        ? child.material.map(tintOne)
        : tintOne(child.material);
    });
    return clone;
  }, [scene, tint]);
  return (
    <primitive
      object={cloned}
      position={[position.x, 0, position.z]}
      rotation={[0, rotationY, 0]}
      scale={scale}
    />
  );
}

export interface SyntyHexWallProps {
  walls: Wall[];
  hexSize: number;
  /** Fired with the door's Wall.id (rpg-api-protos#186) when a DOOR_* piece
   * is clicked. The web only sends intent — Interact(id) — the server
   * decides what happens (rpg-dnd5e-web#526). No-op for a door segment
   * whose id is absent. */
  onDoorClick?: (doorId: string) => void;
  /**
   * Wall-hex coordinate keys (hexMath's `coordToKey` format, i.e. the part
   * of a WallEdgeSegment.key before `->`) that should render with the
   * `'crypt'` variant weighting (syntyHexWallHelpers.ts's
   * WALL_VARIANTS_BY_THEME) instead of `'default'` (rpg-dnd5e-web#558).
   * `walls` is one flat list merged from every source (real dungeon walls
   * plus any demo-injected room), so there's no per-Wall theme field on the
   * wire proto — this side-channel set is how an injected room's own walls
   * opt into a different look without touching every other wall.
   * Undefined/omitted (every real caller today) means every segment uses
   * `'default'`, unchanged from pre-theme behavior.
   */
  themeWallHexKeys?: ReadonlySet<string>;
}

export function SyntyHexWall({
  walls,
  hexSize,
  onDoorClick,
  themeWallHexKeys,
}: SyntyHexWallProps) {
  const segments = useMemo(
    () => buildDungeonWallSegments(walls, hexSize),
    [walls, hexSize]
  );
  // rpg-dnd5e-web#536 phase 2: corner/end fittings, computed from the same
  // wall list — see syntyHexWallHelpers.ts's classifyWallVertices/
  // wallEndEdgeKeys for the vertex-classification and run-terminus design.
  const vertexFittings = useMemo(
    () => classifyWallVertices(walls, hexSize),
    [walls, hexSize]
  );
  const endEdgeKeys = useMemo(() => wallEndEdgeKeys(walls), [walls]);

  if (segments.length === 0) return null;

  return (
    <Suspense fallback={null}>
      {segments.map(({ key, edge, kind, id }) => {
        if (edgePieceKind(kind) === 'door') {
          const isOpen = kind === WallKind.DOOR_OPEN;
          return (
            <group
              key={key}
              onClick={(e: { stopPropagation: () => void }) => {
                e.stopPropagation();
                if (id) onDoorClick?.(id);
              }}
              onPointerOver={(e: { stopPropagation: () => void }) => {
                e.stopPropagation();
                if (id) document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                document.body.style.cursor = 'auto';
              }}
            >
              <GlbInstance
                file="SM_Env_Door_Frame_01.glb"
                position={edge.mid}
                rotationY={edge.rotationY}
                scale={DOOR_FRAME_SCALE}
              />
              <GlbInstance
                file="SM_Env_Door_01.glb"
                position={edge.a}
                rotationY={
                  edge.rotationY + (isOpen ? DOOR_OPEN_ROTATION_OFFSET : 0)
                }
                scale={DOOR_SCALE}
              />
            </group>
          );
        }
        // A degree-1 wall hex's far-facing edge caps a run terminus —
        // render wall-end there instead of a plain/broken/alcove variant
        // (rpg-dnd5e-web#536 phase 2, defect #3).
        if (endEdgeKeys.has(key)) {
          const fitting = FITTINGS['wall-end'];
          return (
            <GlbInstance
              key={key}
              file={fitting.file}
              position={edge.mid}
              rotationY={edge.rotationY}
              scale={fittingScale(fitting, WALL_HEIGHT)}
            />
          );
        }
        // Deterministic per-edge variant (rpg-game-assets#2): `key` is a
        // stable function of the two hex coordinates this edge sits
        // between (buildDungeonWallSegments), so the same wall always
        // picks the same plain/broken/alcove piece across renders,
        // reconnects, and remounts — never a per-render reshuffle. The
        // wall-hex half of `key` (before `->`) decides theme (#558): a
        // hex in `themeWallHexKeys` renders 'crypt'-weighted, everything
        // else stays 'default'.
        const wallHexKey = key.split('->')[0]!;
        const theme: WallTheme = themeWallHexKeys?.has(wallHexKey)
          ? 'crypt'
          : 'default';
        const variant = selectWallVariant(key, theme);
        return (
          <GlbInstance
            key={key}
            file={variant.file}
            position={edge.a}
            rotationY={edge.rotationY}
            scale={wallVariantScale(variant, WALL_HEIGHT, SYNTY_SCALE)}
            tint={WALL_TINT_BY_THEME[theme]}
          />
        );
      })}
      {vertexFittings.map(({ key, kind, position, rotationY }) => {
        const fitting = FITTINGS[kind];
        return (
          <GlbInstance
            key={key}
            file={fitting.file}
            position={position}
            rotationY={rotationY}
            scale={fittingScale(fitting, WALL_HEIGHT)}
          />
        );
      })}
    </Suspense>
  );
}
