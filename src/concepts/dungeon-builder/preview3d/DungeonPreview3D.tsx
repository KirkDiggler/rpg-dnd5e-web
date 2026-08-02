/**
 * DungeonPreview3D — the 3D preview spike (Kirk's 2026-08-01 ask #4 on
 * rpg-dnd5e-web#667: "assess reusing the game's existing Three.js dungeon
 * rendering... floor + props + monsters from the compiled floor plan; no
 * combat/fog; static orbit camera fine"). Edit mode only — it renders the
 * server-compiled `FloorPlan` + the parallel `DungeonDoc` placements, so it
 * needs a real compiled floor plan to exist (creation mode's proposed
 * schema has no `FloorPlan` at all).
 *
 * Reuses the REAL game renderers directly, not a re-implementation:
 * `SyntyHexFloor` (floor tiles, genuinely self-contained — see its own doc
 * comment, no encounter-state coupling) and `PropModel` (props, same). The
 * one genuinely new piece is `PreviewMonsterModel` — see its own doc
 * comment for why HexEntity.tsx's monster-rendering branch couldn't be
 * reused directly (638 lines, mostly combat-movement/facing/tint machinery
 * this static preview doesn't want).
 *
 * Deliberately does NOT render walls or doors. Three real reasons, not
 * scope-cutting for its own sake: (1) Kirk's own ask omitted them — floor
 * + props + monsters only; (2) `FloorPlan` carries no wall geometry at all
 * (only `door_row`, a row index, and `connector.column`) — a real wall
 * render would need synthetic edge geometry invented for the chain's
 * boundary, not a translation of anything on the wire (see CONTRACT.md's
 * "hex orientation/parity is not on the wire" and "connector door position
 * must still be derived" findings, same gap); (3) the game's own wall
 * renderer (`WallRunMesh`/`wallRuns.computeWallRuns`, 1334 lines) consumes
 * encounter-shaped `Wall[]` edges, not a room-chain `FloorPlan` — reusing
 * it here would mean writing that synthetic-edge-geometry step first, a
 * genuinely separate piece of work. See CONTRACT.md's "3D preview spike"
 * section for the full reuse-vs-new breakdown.
 *
 * DOES render `doc.holes` (Kirk's 2026-08-02 Structural-category ask,
 * TARGET-YAML.md) — `buildFloorTiles` simply skips a hole's cell, the
 * same shape as the pre-existing door-row skip. Not the same situation
 * as walls: a hole is cell-native (no edge geometry to invent), and
 * "omit the floor tile" is the literal, honest render Kirk's own ask
 * specified, nearly free given `SyntyHexFloor` only renders whatever's
 * in the tile map it's handed.
 */
import { cubeToWorld, HEX_SIZE } from '@/components/hex-grid/hexMath';
import { resolvePropVariant } from '@/components/hex-grid/propManifest';
import { PropModel } from '@/components/hex-grid/PropModel';
import { SyntyHexFloor } from '@/components/hex-grid/SyntyHexFloor';
import type { AbsoluteFloorTile } from '@/hooks/dungeonMapGeometry';
import type { FloorPlan } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { Bounds, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';
import type { DungeonDoc } from '../dungeonYaml';
import { cubeAtColRow } from '../hexLayout';
import { PreviewMonsterModel } from './PreviewMonsterModel';

interface DungeonPreview3DProps {
  floorPlan: FloorPlan;
  doc: DungeonDoc;
}

interface PlacedProp {
  key: string;
  position: [number, number, number];
  variantRef: string;
}

interface PlacedMonster {
  key: string;
  position: [number, number, number];
  monsterRefId: string;
}

/** `holes` are v2, proposed (TARGET-YAML.md's Structural category, Kirk's
 * 2026-08-02 ask) — absolute [col,row] cells with no floor. Skipping them
 * here is the SAME shape as the existing door-row skip just below (both
 * are "don't generate a tile for this cell"), and it's the honest render
 * Kirk's own ask specified: "3D preview = simply omit the floor hex" —
 * nearly free given `SyntyHexFloor` only ever renders whatever's in the
 * tile map handed to it. */
function buildFloorTiles(
  floorPlan: FloorPlan,
  holes: readonly [number, number][]
): Map<string, AbsoluteFloorTile> {
  const holeSet = new Set(holes.map(([c, r]) => `${c},${r}`));
  const tiles = new Map<string, AbsoluteFloorTile>();
  for (const room of floorPlan.rooms) {
    for (
      let col = room.startColumn;
      col < room.startColumn + room.width;
      col++
    ) {
      for (let row = 0; row < floorPlan.height; row++) {
        if (row === floorPlan.doorRow) continue; // same legality rule Board.tsx uses
        if (holeSet.has(`${col},${row}`)) continue;
        const cube = cubeAtColRow(col, row);
        const key = `${cube.x},${cube.y},${cube.z}`;
        tiles.set(key, { x: cube.x, y: cube.y, z: cube.z, roomId: room.id });
      }
    }
  }
  return tiles;
}

function worldPosition(absCol: number, row: number): [number, number, number] {
  const cube = cubeAtColRow(absCol, row);
  const world = cubeToWorld(cube, HEX_SIZE);
  return [world.x, 0, world.z];
}

function buildPlacements(
  floorPlan: FloorPlan,
  doc: DungeonDoc
): { props: PlacedProp[]; monsters: PlacedMonster[] } {
  const props: PlacedProp[] = [];
  const monsters: PlacedMonster[] = [];

  for (const room of doc.rooms) {
    const fpRoom = floorPlan.rooms.find((r) => r.id === room.id);
    if (!fpRoom) continue;

    for (const p of room.place) {
      const absCol = fpRoom.startColumn + p.at[0];
      const position = worldPosition(absCol, p.at[1]);
      const key = `${room.id}:${p.at[0]},${p.at[1]}:${p.ref}`;
      if (p.isMonster) {
        const monsterRefId = p.ref.split(':').pop();
        if (monsterRefId) monsters.push({ key, position, monsterRefId });
      } else {
        props.push({ key, position, variantRef: p.ref });
      }
    }

    if (room.boss) {
      const absCol = fpRoom.startColumn + room.boss.at[0];
      const position = worldPosition(absCol, room.boss.at[1]);
      const monsterRefId = room.boss.ref.split(':').pop();
      if (monsterRefId) {
        monsters.push({
          key: `${room.id}:boss`,
          position,
          monsterRefId,
        });
      }
    }
  }

  return { props, monsters };
}

export function DungeonPreview3D({ floorPlan, doc }: DungeonPreview3DProps) {
  const floorTiles = useMemo(
    () => buildFloorTiles(floorPlan, doc.holes),
    [floorPlan, doc.holes]
  );
  const { props, monsters } = useMemo(
    () => buildPlacements(floorPlan, doc),
    [floorPlan, doc]
  );

  return (
    <div style={{ width: '100%', height: '100%', background: '#0c0a08' }}>
      <Canvas camera={{ fov: 45, position: [10, 14, 10] }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[6, 10, 4]} intensity={1.0} />
        <directionalLight position={[-6, 4, -4]} intensity={0.35} />
        <Suspense fallback={null}>
          <Bounds fit clip margin={1.25}>
            <SyntyHexFloor floorTiles={floorTiles} hexSize={HEX_SIZE} />
            {props.map((p) => {
              const variant = resolvePropVariant(p.variantRef);
              if (!variant) return null;
              return (
                <PropModel
                  key={p.key}
                  variant={variant}
                  position={p.position}
                />
              );
            })}
            {monsters.map((m) => (
              <PreviewMonsterModel
                key={m.key}
                monsterRefId={m.monsterRefId}
                position={m.position}
              />
            ))}
          </Bounds>
        </Suspense>
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
