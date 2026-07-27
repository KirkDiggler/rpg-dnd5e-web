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
import { type Wall } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { GlbInstance } from './GlbInstance';
import type { WorldPos } from './hexMath';
import { rememberedFitting, rememberedSegment } from './sceneKnowledge';
import {
  buildDungeonWallSegments,
  classifyWallVertices,
  DOOR_FRAME_FILE,
  DOOR_LEAF_FILE,
  doorFrameScale,
  doorLeafScale,
  doorVisualState,
  FITTINGS,
  fittingScale,
  isDoorWallKind,
  selectWallVariant,
  WALL_TINT_BY_THEME,
  wallEndEdgeKeys,
  wallVariantScale,
  type WallTheme,
} from './syntyHexWallHelpers';

// Placeholder-acceptable open pose (rpg-dnd5e-web#526, wave rpg-project#96
// Slice 2): the door leaf GLB's pivot is at one end (edge.a, like the wall
// piece), so swinging it open is a render-time Y-rotation about that same
// pivot — no second model needed (matches this file's original doc comment
// anticipating exactly this). The asset lane (web#523) owns the final open
// pose/art; this is only a clearly-observable open-vs-closed state flip.
const DOOR_OPEN_ROTATION_OFFSET = (80 * Math.PI) / 180;
const LOCKED_DOOR_TINT = new THREE.Color(0.36, 0.31, 0.27);

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
  rememberedWallHexKeys?: ReadonlySet<string>;
  /**
   * Whole-space theme (rpg-dnd5e-web#558 real-route consumption): when set
   * to `'crypt'`, EVERY wall segment renders `'crypt'`-themed, regardless of
   * `themeWallHexKeys`. This is the real-route seam — a real encounter has
   * no per-hex demo mix to disambiguate, the whole space is one theme —
   * while `themeWallHexKeys` stays the mechanism the `?cryptdemo=1` harness
   * room uses to theme only its OWN injected walls inside an otherwise
   * untamed real scene. The two are additive (a hex counts as themed if
   * EITHER says so), so passing both is safe, if unusual. Undefined (every
   * caller before this prop existed) falls back to `themeWallHexKeys`
   * exactly as before — byte-identical for every real dungeon wall today.
   */
  spaceTheme?: 'crypt';
  /**
   * Per-door exact position + rotationY override, keyed by Wall.id —
   * dungeon-walls redesign (rpg-project#133 design.md's W2 slice,
   * sharpened by the connector-single-wall follow-up rpg-project#132):
   * places a door frame/leaf exactly on its connector's own straight column
   * plane (wallRunAdapters.connectorDoorPlanes) instead of the wire's
   * `hexEdgeBetween`-derived edge geometry (the midpoint/corner between the
   * door's own cell and `doorPassageNeighbor`'s arbitrarily-picked first
   * region-tagged neighbor) — a genuinely different position AND rotation
   * than the connector's own line, close enough to look plausible but
   * never guaranteed to coincide (Kirk's live-walk regression: "can our
   * door rotate a little to line up with the wall?"). A door whose id has
   * no entry (or whose Wall.id is absent) falls back to the pre-existing
   * `edge.mid`/`edge.rotationY` exactly as before — undefined/omitted
   * (every caller before this design) is byte-identical to pre-#133
   * behavior.
   */
  doorPlaneOverrides?: ReadonlyMap<
    string,
    { position: WorldPos; rotationY: number }
  >;
  /**
   * Wall height override, world units — defaults to
   * calibrationConstants.WALL_HEIGHT so every existing caller renders
   * byte-identical to before this prop existed. Kirk's live-walk ask
   * (rpg-project#132, `?wallHeight=` dial): wall segment panels, door
   * frame/leaf, and corner/end fittings all scale off THIS value (not the
   * hardcoded WALL_HEIGHT import) so they rise together.
   */
  wallHeight?: number;
  /**
   * Cutaway prototype (rpg-project#132, `?wallCutaway=1`): per-door height
   * override, keyed by Wall.id, from `wallRunAdapters.connectorDoorHeights`
   * — a door's frame/leaf scales off ITS OWN connector run's classification
   * (stub or tall) instead of the single global `wallHeight` every door
   * used before this prototype (Kirk's requirement: "Doors/frames on a tall
   * run scale with it"). A door whose id has no entry (or whose Wall.id is
   * absent) falls back to `wallHeight` exactly as before — undefined/
   * omitted (every caller before this prototype) is byte-identical to
   * pre-cutaway behavior.
   */
  doorHeights?: ReadonlyMap<string, number>;
}

export function SyntyHexWall({
  walls,
  hexSize,
  onDoorClick,
  themeWallHexKeys,
  rememberedWallHexKeys,
  spaceTheme,
  doorPlaneOverrides,
  wallHeight = WALL_HEIGHT,
  doorHeights,
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
        const isRemembered = rememberedSegment(key, rememberedWallHexKeys);
        if (isDoorWallKind(kind)) {
          const visualState = doorVisualState(kind)!;
          const plane =
            id !== undefined ? doorPlaneOverrides?.get(id) : undefined;
          const rotationY = plane?.rotationY ?? edge.rotationY;
          const framePosition = plane?.position ?? edge.mid;
          // Door frame/leaf height rises the SAME proportion the wall-height
          // dial moves its effective height away from the calibrated
          // default — 1.0 (no-op) at the default, so every existing caller
          // is byte-identical (doorFrameScale/doorLeafScale's own doc
          // comments). `doorHeights` (cutaway prototype) overrides THIS
          // door's own effective height ahead of the global `wallHeight`
          // when present.
          const effectiveDoorHeight =
            (id !== undefined ? doorHeights?.get(id) : undefined) ?? wallHeight;
          const doorHeightRatio = effectiveDoorHeight / WALL_HEIGHT;
          // The leaf's pivot sits at one end of the edge, like the wall
          // pieces (this file's own doc comment) — `edge.a` is exactly
          // `edge.mid` offset by half the edge's own length, along the
          // direction matching `edge.rotationY`. Preserve that SAME offset
          // MAGNITUDE (not a re-derived hex-geometry constant) when a plane
          // override moves the frame, applied along the override's own
          // (possibly different) direction so the leaf still sits flush
          // against the frame instead of at the old wire-edge corner.
          const leafPosition = plane
            ? (() => {
                const offsetDistance = Math.hypot(
                  edge.a.x - edge.mid.x,
                  edge.a.z - edge.mid.z
                );
                const dirX = Math.cos(rotationY);
                const dirZ = -Math.sin(rotationY);
                return {
                  x: framePosition.x - dirX * offsetDistance,
                  z: framePosition.z - dirZ * offsetDistance,
                };
              })()
            : edge.a;
          return (
            <group
              key={key}
              {...(!isRemembered && {
                onClick: (e: { stopPropagation: () => void }) => {
                  e.stopPropagation();
                  if (id) onDoorClick?.(id);
                },
                onPointerOver: (e: { stopPropagation: () => void }) => {
                  e.stopPropagation();
                  if (id) document.body.style.cursor = 'pointer';
                },
                onPointerOut: () => {
                  document.body.style.cursor = 'auto';
                },
              })}
            >
              <GlbInstance
                file={DOOR_FRAME_FILE}
                position={framePosition}
                rotationY={rotationY}
                scale={doorFrameScale(doorHeightRatio)}
                remembered={isRemembered}
              />
              <GlbInstance
                file={DOOR_LEAF_FILE}
                position={leafPosition}
                rotationY={
                  rotationY +
                  (visualState === 'open' ? DOOR_OPEN_ROTATION_OFFSET : 0)
                }
                scale={doorLeafScale(doorHeightRatio)}
                tint={visualState === 'locked' ? LOCKED_DOOR_TINT : undefined}
                remembered={isRemembered}
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
              scale={fittingScale(fitting, wallHeight)}
              remembered={isRemembered}
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
        // else stays 'default' — UNLESS `spaceTheme` says the whole space
        // is 'crypt', in which case every hex is, regardless of
        // `themeWallHexKeys` membership (real-route consumption, #558).
        const wallHexKey = key.split('->')[0]!;
        const theme: WallTheme =
          spaceTheme === 'crypt' || themeWallHexKeys?.has(wallHexKey)
            ? 'crypt'
            : 'default';
        const variant = selectWallVariant(key, theme);
        return (
          <GlbInstance
            key={key}
            file={variant.file}
            position={edge.a}
            rotationY={edge.rotationY}
            scale={wallVariantScale(variant, wallHeight, SYNTY_SCALE)}
            tint={WALL_TINT_BY_THEME[theme]}
            remembered={isRemembered}
          />
        );
      })}
      {vertexFittings.map(({ key, kind, position, rotationY }) => {
        const fitting = FITTINGS[kind];
        const isRemembered = rememberedFitting(key, rememberedWallHexKeys);
        return (
          <GlbInstance
            key={key}
            file={fitting.file}
            position={position}
            rotationY={rotationY}
            scale={fittingScale(fitting, wallHeight)}
            remembered={isRemembered}
          />
        );
      })}
    </Suspense>
  );
}
