/**
 * DungeonPreview3D — the 3D preview tab (design §1): the atlas
 * `PutDungeon(validate_only)` answered with, drawn by the GAME's own
 * renderer. `previewScene` runs the same `resolveSceneLayout` +
 * `buildScene3D` the session route runs (`SessionEncounterView`), then
 * the same leaf renderers draw it: `SyntyHexFloor`, `AtlasWalls`,
 * `AtlasPropModel`, `DungeonSceneLights`. There is no builder-side
 * geometry; if the preview and the game ever differ, one of them is
 * lying and `DungeonPreview3D.test.ts` says which.
 *
 * Two things the atlas does not carry are drawn from the document on
 * top, both through game renderers: the start cell as a `PathPreview`
 * ring (the game's own floor marker), and monster placements as
 * `HexEntity`s (the game's own monster models) — the atlas is world
 * geometry; monsters are encounter state the session places at start.
 *
 * Camera: drei's `OrbitControls` on the game's own orthographic rig
 * (`CAMERA_OFFSET`, zoom 80 — `SessionCanvas`), so the preview reads as
 * the same game. `useCameraControls` is not required here.
 */
import { HexEntity } from '@/components/hex-grid/HexEntity';
import {
  coordToKey,
  cubeToWorld,
  HEX_SIZE,
  type CubeCoord,
} from '@/components/hex-grid/hexMath';
import { PathPreview } from '@/components/hex-grid/PathPreview';
import { SyntyHexFloor } from '@/components/hex-grid/SyntyHexFloor';
import { AtlasPropModel } from '@/components/session/AtlasPropModel';
import { AtlasWalls } from '@/components/session/AtlasWalls';
import { DungeonSceneLights } from '@/components/session/DungeonSceneLights';
import { CAMERA_OFFSET } from '@/rendering/calibrationConstants';
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import {
  isMonsterRef,
  MONSTER_REF_PREFIX,
  type DungeonDoc,
} from '../dungeonYaml';
import { type Axial } from '../hexOffset';
import { START_COLOR } from '../markerStyle';
import { previewScene } from './previewScene';

const axialToCube = (a: Axial): CubeCoord => ({
  x: a.q,
  y: -a.q - a.r,
  z: a.r,
});

export interface DungeonPreview3DProps {
  atlas: GetAtlasResponse | null;
  doc: DungeonDoc;
  /** Why there is no atlas yet (errors, unreachable, validating). */
  status: string;
  /** Non-null when `atlas` is NOT the current document's own compile
   * (`staleAtlasNotice`) — rendered as a banner over the canvas so a
   * lagging 3D picture reads as stale, never as broken geometry
   * (#804 walk finding: freshly drawn walls missing from the 3D view
   * looked like the views disagreeing). */
  staleNotice?: string | null;
}

export function DungeonPreview3D({
  atlas,
  doc,
  status,
  staleNotice = null,
}: DungeonPreview3DProps) {
  const built = useMemo(() => (atlas ? previewScene(atlas) : null), [atlas]);
  const target = useMemo(() => {
    const cells = doc.regions.flatMap((r) => r.cells);
    if (cells.length === 0) return [0, 0, 0] as const;
    let x = 0;
    let z = 0;
    for (const c of cells) {
      const w = cubeToWorld(axialToCube(c), HEX_SIZE);
      x += w.x;
      z += w.z;
    }
    return [x / cells.length, 0, z / cells.length] as const;
  }, [doc.regions]);

  if (!built) {
    return (
      <div className="dg-preview-empty" data-testid="preview-empty">
        No compiled atlas yet — {status}
      </div>
    );
  }
  if (!built.ok) {
    return (
      <div className="dg-preview-empty" data-testid="preview-gate">
        {built.message}
      </div>
    );
  }
  const scene = built.scene;
  const monsters = doc.place.filter((p) => isMonsterRef(p.ref));

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {staleNotice && (
        <div
          data-testid="preview-stale"
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            right: 8,
            zIndex: 1,
            padding: '4px 8px',
            borderRadius: 4,
            background: '#7c2d12cc',
            color: '#fed7aa',
            fontSize: 12,
            pointerEvents: 'none',
          }}
        >
          {staleNotice}
        </div>
      )}
      <Canvas
        orthographic
        frameloop="demand"
        camera={{
          position: [
            target[0] + CAMERA_OFFSET[0],
            CAMERA_OFFSET[1],
            target[2] + CAMERA_OFFSET[2],
          ],
          near: 0.1,
          far: 1000,
          zoom: 28,
        }}
        style={{ width: '100%', height: '100%' }}
        data-testid="preview-canvas"
      >
        <DungeonSceneLights />
        <SyntyHexFloor floorTiles={scene.floorTiles} hexSize={HEX_SIZE} />
        <AtlasWalls wallRuns={scene.wallRuns} doorGaps={scene.doorGaps} />
        {scene.props.map((prop, index) => (
          <AtlasPropModel
            key={`${prop.ref}-${coordToKey(prop.position)}-${index}`}
            prop={prop}
            hexSize={HEX_SIZE}
            orientation="pointy"
          />
        ))}
        {doc.start && (
          <PathPreview
            path={[axialToCube(doc.start)]}
            hexSize={HEX_SIZE}
            color={START_COLOR}
            opacity={0.5}
          />
        )}
        {monsters.map((m, i) => (
          <HexEntity
            key={`${m.ref}-${m.at.q},${m.at.r}-${i}`}
            entityId={`preview-${i}`}
            name={m.ref.slice(MONSTER_REF_PREFIX.length)}
            position={axialToCube(m.at)}
            type="monster"
            hexSize={HEX_SIZE}
            monsterRefId={m.ref.slice(MONSTER_REF_PREFIX.length)}
          />
        ))}
        <OrbitControls makeDefault target={[target[0], 0, target[2]]} />
      </Canvas>
    </div>
  );
}
