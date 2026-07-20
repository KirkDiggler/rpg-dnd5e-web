/**
 * SelfIndicatorRing — "this is me" ground marker under the local player's
 * own entity (rpg-dnd5e-web#515).
 *
 * Selection tint (emissive glow on the model itself) used to double as the
 * local player's self-identifier, because `selectedEntityId` was always
 * wired to the local player's own id (see selectionVisuals.ts's doc
 * comment). That made "this is me" and "this is selected/targeted" share
 * one visual, and it read as a permanent washed-out tint on your own
 * character. This component gives "this is me" its own subtle, persistent
 * marker instead, reusing the existing ground-overlay visual language
 * already established by MovementRangeBorder.tsx/PathPreview.tsx (a flat
 * shape on the hex plane, emissive-glow material, Y-offset tuned to clear
 * the floor extrusion) rather than inventing a new one.
 *
 * A ring (annulus), not a filled hex like PathPreview — filled would read
 * as "you can move/attack here", which this explicitly isn't. Deliberately
 * NOT gated on turn state (unlike MovementRangeBorder) — "this is me" is
 * true regardless of whose turn it is.
 */

import { useMemo } from 'react';
import * as THREE from 'three';

interface SelfIndicatorRingProps {
  /** World-space X/Z position (Y is fixed by RING_Y_OFFSET below). */
  x: number;
  z: number;
  hexSize: number;
  color?: string;
}

const DEFAULT_COLOR = '#f5d76e'; // warm gold — distinct from player/monster/
// obstacle faction colors (blue/red/purple) and from PathPreview's blue /
// the attack-path preview's red, so it never reads as a targeting cue.
const OPACITY = 0.55;
const GLOW_INTENSITY = 1.2;
// Y offset must clear BOTH floor renderers' tops: ShadedHexFloor extrudes to
// y=0.15, but SyntyHexFloor.tsx (the default-on renderer for the real game
// route — EncounterMap.tsx's syntyDungeon flag) deliberately floats above
// that at y=0.2 to avoid z-fighting the two if ever mounted together. An
// earlier version of this offset (0.155) only cleared ShadedHexFloor's top —
// verified live against the real game route (rpg-dnd5e-web#515 evidence)
// that this rendered the ring INVISIBLE under the actual Synty floor tiles,
// the same "renders below the floor" failure mode MovementRangeBorder's own
// comment history documents. 0.21 clears SyntyHexFloor's 0.2 top; it now sits
// slightly above MovementRangeBorder (0.17) / PathPreview (0.16) too, which
// is harmless (different geometry, rare overlap — the mover's own hex isn't
// normally itself a highlighted path/border step).
const RING_Y_OFFSET = 0.21;
const RING_SEGMENTS = 32;

export function SelfIndicatorRing({
  x,
  z,
  hexSize,
  color = DEFAULT_COLOR,
}: SelfIndicatorRingProps) {
  const geometry = useMemo(() => {
    const outerRadius = hexSize * 0.55;
    const innerRadius = hexSize * 0.42;
    return new THREE.RingGeometry(innerRadius, outerRadius, RING_SEGMENTS);
  }, [hexSize]);

  return (
    <mesh
      position={[x, RING_Y_OFFSET, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      geometry={geometry}
    >
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={GLOW_INTENSITY}
        transparent
        opacity={OPACITY}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
