/**
 * SessionCanvas — the actual Three.js scene for the session route, split
 * out of `SessionEncounterView.tsx` so that file's data-orchestration
 * (fetch atlas/position/character, gate on layout, show loading/error
 * states) can be unit-tested without a WebGL canvas (jsdom can't provide
 * one — same reasoning `EncounterMap.test.tsx`'s own doc comment gives for
 * stubbing `HexGrid`). This component is the thing that gets stubbed
 * there.
 *
 * `SessionScene` (the part that actually needs the R3F context — it calls
 * `useCameraControls`, which needs `useThree`) is exported separately so
 * `SessionCanvas.test.tsx` can render it directly through
 * `@react-three/test-renderer`, the same way `SyntyHexWall.test.tsx`
 * renders `SyntyHexWall` directly rather than nesting a second `<Canvas>`
 * inside the test renderer's own root.
 */

import { CAMERA_OFFSET } from '@/rendering/calibrationConstants';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Canvas } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { HexEntity } from '../hex-grid/HexEntity';
import { type CubeCoord, cubeToWorld } from '../hex-grid/hexMath';
import { SyntyHexFloor } from '../hex-grid/SyntyHexFloor';
import { useCameraControls } from '../hex-grid/useCameraControls';
import type { Scene3D } from './atlasToScene3D';
import { AtlasWalls } from './AtlasWalls';

export interface SessionCanvasProps {
  scene: Scene3D;
  hexSize: number;
  characterId: string;
  characterName: string;
  character: Character | undefined;
  classRefId: string | undefined;
  myPosition: CubeCoord;
}

/** Renders inside the Canvas — `useCameraControls` needs the R3F context
 * (`useThree`), so it cannot run in the component that owns `<Canvas>`
 * itself. */
export function SessionScene({
  hexSize,
  scene,
  characterId,
  characterName,
  character,
  classRefId,
  myPosition,
}: SessionCanvasProps) {
  // Stable base target, seeded ONCE from the character's starting position
  // and frozen after that (HexGrid.tsx's own `initialTargetRef` pattern —
  // see its doc comment). `useCameraControls` mutates this same object in
  // place as the player pans (WASD/right-drag), and its own effects
  // re-initialize whenever the TARGET REFERENCE changes — a fresh
  // `new THREE.Vector3(...)` built inline on every render (Copilot review,
  // PR #764) would snap the camera back to the character on any unrelated
  // re-render, silently discarding whatever the player just panned to.
  // Slice 1 has no movement yet, so unlike HexGrid's `focusTarget` (which
  // continuously follows a moving player), a single frozen seed is the
  // whole fix; a later slice that adds walking re-introduces
  // `focusTarget`-style continuous following, not this ref.
  const target = cubeToWorld(myPosition, hexSize);
  const initialTargetRef = useRef<THREE.Vector3 | null>(null);
  if (initialTargetRef.current === null) {
    initialTargetRef.current = new THREE.Vector3(target.x, 0, target.z);
  }
  useCameraControls({ target: initialTargetRef.current });

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight intensity={0.8} position={[10, 20, 10]} />
      <SyntyHexFloor floorTiles={scene.floorTiles} hexSize={hexSize} />
      <AtlasWalls walls={scene.walls} doors={scene.doors} />
      <HexEntity
        entityId={characterId}
        name={characterName}
        position={myPosition}
        type="player"
        hexSize={hexSize}
        character={character}
        classRefId={classRefId}
      />
    </>
  );
}

/**
 * The Canvas wrapper. Orthographic isometric camera at the same
 * `CAMERA_OFFSET`/zoom the rest of the game uses (`HexGrid.tsx`), so the
 * session route reads as the same game, not a different renderer —
 * `useCameraControls` (WASD/Q-E/wheel/right-drag) takes over placement
 * from there exactly as it does in `HexGrid`.
 */
export function SessionCanvas(props: SessionCanvasProps) {
  return (
    <Canvas
      orthographic
      frameloop="demand"
      camera={{ position: CAMERA_OFFSET, near: 0.1, far: 1000, zoom: 80 }}
      style={{ width: '100%', height: '100%' }}
    >
      <SessionScene {...props} />
    </Canvas>
  );
}
