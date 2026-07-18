/**
 * SyntyShowcase — dev-only preview of converted Synty GLB assets on the
 * playtest map. Rendered as HexGrid children when the harness URL has
 * `&synty=1`. Verification surface for the asset pipeline
 * (assets/synty/pipeline/fbx_to_glb.py): confirms scale, orientation, and
 * atlas texturing inside the real game camera/lighting before assets get
 * promoted into game routes.
 *
 * The GLBs live in public/models/synty/ which is gitignored — Synty's
 * license allows shipping them in the built game but not redistributing
 * them as files via a public repo.
 */

import { useGLTF } from '@react-three/drei';
import { Suspense } from 'react';
import { SYNTY_SCALE } from '../../rendering/calibrationConstants';
import { cubeToWorld, HEX_SIZE, type CubeCoord } from '../hex-grid/hexMath';

const SYNTY_BASE = '/models/synty/';

interface PlacedModelProps {
  file: string;
  hex: CubeCoord;
  /** Rotation around Y in radians. */
  rotationY?: number;
}

function PlacedModel({ file, hex, rotationY = 0 }: PlacedModelProps) {
  const { scene } = useGLTF(SYNTY_BASE + file);
  const world = cubeToWorld(hex, HEX_SIZE);
  return (
    <primitive
      object={scene}
      position={[world.x, 0, world.z]}
      rotation={[0, rotationY, 0]}
      scale={SYNTY_SCALE}
    />
  );
}

/** Which showcase models exist locally. Keep in sync with what the asset
 * pipeline has copied into public/models/synty/. */
// Clustered within a few hexes of the origin so everything sits inside the
// camera's initial framing (it seeds on the fallback player tile at 0,0,0).
// Demo cast decided on rpg-dnd5e-web#469: party row (back), monster row
// (front), environment pieces on the flank.
const SHOWCASE: PlacedModelProps[] = [
  // Party: Barbarian, Fighter, Rogue, Monk
  { file: 'SK_BR_Character_BarbarianGiant_01.glb', hex: { x: 0, y: 1, z: -1 } },
  { file: 'SK_BR_Character_Slayer_01.glb', hex: { x: 1, y: 0, z: -1 } },
  { file: 'SK_Character_DarkElf_01.glb', hex: { x: 2, y: -1, z: -1 } },
  { file: 'SK_Character_Mystic_01.glb', hex: { x: 3, y: -2, z: -1 } },
  // Monsters: goblin skin variants A/B/C + boss
  { file: 'Character_Goblin_Warrior_Male.glb', hex: { x: 0, y: -1, z: 1 } },
  { file: 'Character_Goblin_Warrior_Male_B.glb', hex: { x: 1, y: -2, z: 1 } },
  { file: 'Character_Goblin_Warrior_Male_C.glb', hex: { x: 2, y: -3, z: 1 } },
  { file: 'Character_Goblin_WarChief.glb', hex: { x: 3, y: -4, z: 1 } },
  // Downed variants (death wave): a fallen goblin and a fallen party member
  {
    file: 'downed/Character_Goblin_Warrior_Male_Downed.glb',
    hex: { x: 4, y: -5, z: 1 },
  },
  {
    file: 'downed/SK_Character_DarkElf_01_Downed.glb',
    hex: { x: 4, y: -3, z: -1 },
  },
  // Environment
  { file: 'SM_Prop_Barrel_01.glb', hex: { x: -1, y: 1, z: 0 } },
  {
    file: 'SM_Env_Door_01.glb',
    hex: { x: -1, y: 0, z: 1 },
    rotationY: Math.PI / 2,
  },
  { file: 'SM_Env_Wall_01.glb', hex: { x: -2, y: 1, z: 1 } },
];

export function SyntyShowcase() {
  return (
    <Suspense fallback={null}>
      {SHOWCASE.map((m) => (
        <PlacedModel key={m.file} {...m} />
      ))}
    </Suspense>
  );
}
