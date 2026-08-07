/**
 * PreviewMonsterModel — entityId threading (2026-08-07 "palette content
 * sync" unit). Before this unit's fix, `DungeonPreview3D.tsx` never passed
 * an `entityId` through to `resolveMonsterModelUrl`, so every zombie
 * placement in the 3D preview rendered the SAME candidate (index 0,
 * zombie-mutant/hulking) regardless of which entity it actually was — a
 * real bug, only surfaced by adding `zombie` as a placeable palette entry
 * and checking the preview path end-to-end (as the task brief that added
 * this component explicitly asked to verify).
 *
 * Same "stub the loader, not the logic" mocking shape as
 * `../../components/hex-grid/HexEntityZombieSelection.test.tsx` — only the
 * GLTF network fetch is stubbed; `resolveMonsterModelUrl` and this
 * component's own prop wiring run for real, unmocked.
 */
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  useGLTFSpy: vi.fn<
    (url: string) => { scene: THREE.Group; animations: never[] }
  >(() => {
    const scene = new THREE.Group();
    scene.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      )
    );
    return { scene, animations: [] };
  }),
}));

vi.mock('@react-three/drei', () => ({
  useGLTF: hoisted.useGLTFSpy,
}));

// Imported AFTER the mock so the mocked drei AND the REAL
// resolveMonsterModelUrl are both in effect.
import { resolveMonsterModelUrl } from '@/components/hex-grid/monsterModels';
import { PreviewMonsterModel } from './PreviewMonsterModel';

const ZOMBIE_MUTANT_URL = '/models/synty/npcs/zombie-mutant.glb';
const ZOMBIE_PEASANT_URL = '/models/synty/npcs/zombie-peasant-female.glb';

/** Same search-not-hardcode approach as HexEntityZombieSelection.test.tsx's
 * own `findIdsForBothStyles` — stays correct even if the hash internals
 * change, as long as the resolver still discriminates. */
function findKeysForBothStyles(): { mutantKey: string; peasantKey: string } {
  let mutantKey: string | undefined;
  let peasantKey: string | undefined;
  for (let i = 0; i < 500 && (!mutantKey || !peasantKey); i++) {
    const key = `room-1:${i},0:dnd5e:monsters:zombie`;
    const url = resolveMonsterModelUrl('zombie', undefined, false, key);
    if (url === ZOMBIE_MUTANT_URL && !mutantKey) mutantKey = key;
    if (url === ZOMBIE_PEASANT_URL && !peasantKey) peasantKey = key;
  }
  if (!mutantKey || !peasantKey) {
    throw new Error(
      'could not find sample placement keys resolving to both zombie ' +
        'styles — resolveMonsterModelUrl may no longer discriminate'
    );
  }
  return { mutantKey, peasantKey };
}

function calledUrls(): string[] {
  return hoisted.useGLTFSpy.mock.calls.map((call) => call[0] as string);
}

describe('PreviewMonsterModel — entityId threading fixes the "every zombie looks the same" preview bug', () => {
  beforeEach(() => {
    hoisted.useGLTFSpy.mockClear();
  });

  it('two zombie placements with different entityId (their own PlacedMonster.key) resolve to the two DIFFERENT promoted looks', async () => {
    const { mutantKey, peasantKey } = findKeysForBothStyles();

    await ReactThreeTestRenderer.create(
      <>
        <PreviewMonsterModel
          monsterRefId="zombie"
          position={[0, 0, 0]}
          entityId={mutantKey}
        />
        <PreviewMonsterModel
          monsterRefId="zombie"
          position={[1, 0, 1]}
          entityId={peasantKey}
        />
      </>
    );

    const urls = Array.from(new Set(calledUrls())).sort();
    expect(urls).toEqual([ZOMBIE_MUTANT_URL, ZOMBIE_PEASANT_URL].sort());
  });

  it('the SAME entityId resolves the SAME look across separate renders — deterministic, not random', async () => {
    const { mutantKey } = findKeysForBothStyles();

    await ReactThreeTestRenderer.create(
      <PreviewMonsterModel
        monsterRefId="zombie"
        position={[0, 0, 0]}
        entityId={mutantKey}
      />
    );
    const firstUrls = calledUrls();

    hoisted.useGLTFSpy.mockClear();
    await ReactThreeTestRenderer.create(
      <PreviewMonsterModel
        monsterRefId="zombie"
        position={[5, 0, 5]}
        entityId={mutantKey}
      />
    );
    expect(calledUrls()).toEqual(firstUrls);
  });

  it('an absent entityId (backward-compat) still degrades gracefully to candidate 0, never a crash', async () => {
    await ReactThreeTestRenderer.create(
      <PreviewMonsterModel monsterRefId="zombie" position={[0, 0, 0]} />
    );
    expect(calledUrls()).toEqual([ZOMBIE_MUTANT_URL]);
  });

  it('a single-candidate ref (skeleton-captain) is unaffected by entityId either way', async () => {
    await ReactThreeTestRenderer.create(
      <PreviewMonsterModel
        monsterRefId="skeleton-captain"
        position={[0, 0, 0]}
        entityId="any-key-at-all"
      />
    );
    expect(calledUrls()).toEqual(['/models/synty/npcs/skeleton-knight.glb']);
  });
});
