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
import { describe, expect, it } from 'vitest';
import { fixtureAtlasOf } from '../fixtures/fixtureAtlas';
import { referenceTombDoc } from '../fixtures/referenceTomb';
import { previewScene } from './previewScene';

describe('previewScene', () => {
  const atlas = fixtureAtlasOf(referenceTombDoc());

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
