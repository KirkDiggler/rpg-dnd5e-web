/**
 * ThumbHarness — dev-only, chrome-free R3F viewer for baking the dungeon
 * builder palette's thumbnails (rpg-dnd5e-web#667, Kirk's "rich entries
 * that SHOW the assets" ask). Reads a single GLB path off `?thumbGlb=`
 * (relative to `public/`, e.g. `/models/synty/props/SM_Env_Pillar_Round_01
 * .glb`), auto-frames it with drei's `Bounds`, and fills the viewport with
 * zero app chrome — same dev-deep-link shape as PlaytestHarness's
 * `?encounterId=` gate in App.tsx, gated the same way (development mode
 * only).
 *
 * Baking process: point `game-dev/tools/browser/screenshot.mjs` at
 * `http://localhost:PORT/?thumbGlb=<path>` with a small square viewport
 * (128x128) and save straight into `./  *.png` — no cropping/resizing
 * needed since the canvas already fills the viewport. See paletteData.ts's
 * `thumbForRef` doc comment for the filename convention
 * (`<ref's last segment>.png`) and CONTRACT.md's "Thumbnail provenance"
 * section for the one-off orchestration script (not committed — it's a
 * throwaway loop over `game-dev/tools/browser/screenshot.mjs`, same as any
 * other `_job_*.mjs` in that gitignored directory).
 *
 * Kept in the tree (not deleted after baking) so a future new palette
 * entry can be re-baked the same way without reconstructing this file.
 */
import { Bounds, useGLTF } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';

function Model({ url }: { url: string }) {
  const gltf = useGLTF(url);
  return <primitive object={gltf.scene} />;
}

export function ThumbHarness() {
  const url = new URLSearchParams(window.location.search).get('thumbGlb');

  if (!url) {
    return (
      <div style={{ padding: 20, color: '#ff9a8a' }}>
        ThumbHarness: missing required <code>?thumbGlb=/models/...</code> query
        param.
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#14110f' }}>
      <Canvas camera={{ fov: 32, position: [2, 1.6, 2.6] }}>
        <ambientLight intensity={1.0} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} />
        <directionalLight position={[-4, 2, -3]} intensity={0.5} />
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.35}>
            <Model url={url} />
          </Bounds>
        </Suspense>
      </Canvas>
    </div>
  );
}
