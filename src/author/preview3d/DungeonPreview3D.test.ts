/**
 * The preview draws the atlas through the GAME's scene builder. Given a
 * fixture atlas, `previewScene` must produce exactly the floor tiles,
 * wall runs and door gaps `SessionEncounterView` would build for the
 * same message — because it is the same call (`resolveSceneLayout` +
 * `buildScene3D` at `HEX_SIZE`). And it must refuse what the game
 * refuses, by the same words.
 */
import { HEX_SIZE } from '@/components/hex-grid/hexMath';
import {
  buildScene3D,
  resolveSceneLayout,
} from '@/components/session/atlasToScene3D';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cryptPropShowcaseDoc } from '../fixtures/cryptPropShowcase';
import { fixtureAtlasOf } from '../fixtures/fixtureAtlas';
import { referenceTombDoc } from '../fixtures/referenceTomb';
import { previewScene } from './previewScene';

/** rpg-project#261: a dungeon with a faced+offset prop — round-trips
 * YAML → (fixture) atlas → `SceneProp3D` with the authored words/values
 * intact. Not a real server compile (`fixtureAtlasOf`'s own doc comment:
 * "proves nothing about the real atlas"), but it IS the same wiring
 * `PreviewProp`/`AtlasPropModel` consume, so it catches a broken
 * passthrough anywhere in that chain. */
function tombWithFacedProp() {
  const tomb = referenceTombDoc();
  return {
    ...tomb,
    place: tomb.place.map((p) =>
      p.ref === 'dnd5e:props:pillar'
        ? { ...p, facing: 'ne', offset: [0.2, -0.1] as [number, number] }
        : p
    ),
  };
}

describe('previewScene', () => {
  const atlas = fixtureAtlasOf(referenceTombDoc());

  it('mounts the shared shell rather than duplicating floor or wall leaves', () => {
    const source = readFileSync(
      'src/author/preview3d/DungeonPreview3D.tsx',
      'utf8'
    );
    expect(source.match(/<DungeonShell\b/g)).toHaveLength(1);
    expect(source).not.toMatch(/<SyntyHexFloor\b/);
    expect(source).not.toMatch(/<AtlasWalls\b/);
    expect(source).not.toMatch(/\bdoors=/);
    expect(source).not.toMatch(/\bonDoorClick=/);
    expect(source).toContain('onFallbackReason={setShellFallbackReason}');
  });

  it('produces the same tiles, runs and door gaps the session route builds', () => {
    const preview = previewScene(atlas);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const gate = resolveSceneLayout(atlas);
    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    const game = buildScene3D(atlas, HEX_SIZE, gate.layout);

    expect(preview.scene.floorTiles.size).toBe(224);
    expect(preview.scene.floorTiles).toEqual(game.floorTiles);
    expect(preview.scene.wallRuns).toEqual(game.wallRuns);
    expect(preview.scene.doorGaps).toEqual(game.doorGaps);
    expect(preview.scene.props).toEqual(game.props);
    // two seams, one doorway each
    expect(preview.scene.doorGaps).toHaveLength(2);
    expect(preview.scene.wallRuns.length).toBeGreaterThan(0);
    expect(preview.scene.props.map((p) => p.ref)).toEqual([
      'dnd5e:props:brazier',
      'dnd5e:props:pillar',
    ]);
    // rpg-project#261: the additive facing/offset fields change nothing
    // absent — every tomb prop still renders at its asset default,
    // centered. Named explicitly so a future field the golden equality
    // above doesn't happen to catch can't go silently unverified.
    for (const prop of preview.scene.props) {
      expect(prop.facing).toBe('');
      expect(prop.offset).toEqual({ x: 0, y: 0, z: 0 });
    }
  });

  it('carries an authored facing/offset intact through YAML → atlas → SceneProp3D', () => {
    const doc = tombWithFacedProp();
    const preview = previewScene(fixtureAtlasOf(doc));
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const pillar = preview.scene.props.find(
      (p) => p.ref === 'dnd5e:props:pillar'
    );
    expect(pillar?.facing).toBe('ne');
    expect(pillar?.offset).toEqual({ x: 0.2, y: -0.1, z: 0 });
    // The unfaced brazier is untouched — the additive fields are opt-in.
    const brazier = preview.scene.props.find(
      (p) => p.ref === 'dnd5e:props:brazier'
    );
    expect(brazier?.facing).toBe('');
    expect(brazier?.offset).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('builds the crypt specimen showcase identically for preview and game', () => {
    const atlas = fixtureAtlasOf(cryptPropShowcaseDoc());
    const preview = previewScene(atlas);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const gate = resolveSceneLayout(atlas);
    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    const game = buildScene3D(atlas, HEX_SIZE, gate.layout);
    expect(preview.scene.props).toEqual(game.props);
    expect(preview.scene.props.map((p) => p.ref)).toEqual([
      'dnd5e:props:skeleton-cage',
      'dnd5e:props:skeleton-table',
      'dnd5e:props:rug',
    ]);
  });

  it('refuses a flat-top atlas with the same named limitation as the game', () => {
    const flat = fixtureAtlasOf({ ...referenceTombDoc(), orientation: 'flat' });
    const preview = previewScene(flat);
    expect(preview.ok).toBe(false);
    if (preview.ok) return;
    const gate = resolveSceneLayout(flat);
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(preview.message).toBe(gate.message);
    expect(preview.message).toMatch(/#763/);
  });
});
