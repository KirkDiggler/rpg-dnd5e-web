/**
 * The ways out, marked on the game map — the walk finding on
 * rpg-dnd5e-web#924 (Kirk, 2026-09-04: dropped the heirloom leaving from
 * the wrong cell, because nothing on the map said where the exit was).
 *
 * Two halves, tested apart: `sceneExits` turns the atlas into scene facts
 * and needs no canvas; `SessionExitMarkers` draws them and does, so it
 * goes through `@react-three/test-renderer` the way every other scene
 * component in this repo does.
 */
import { create } from '@bufbuild/protobuf';
import {
  GetAtlasResponseSchema,
  type GetAtlasResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { describe, expect, it } from 'vitest';
import { cubeToWorld } from '../hex-grid/hexMath';
import { sceneExits } from './atlasToScene3D';
import { SessionExitMarkers } from './SessionExitMarkers';

/** An atlas with TWO ways out — the shape the reference tomb will grow
 * into, and the one that catches a marker layer that only ever draws the
 * first entry. */
function atlasWithTwoExits(): GetAtlasResponse {
  return create(GetAtlasResponseSchema, {
    cells: [
      { x: 1, y: 3 },
      { x: 9, y: 2 },
    ],
    exits: [
      { id: 'entrance', at: { x: 1, y: 3 } },
      { id: 'sally-port', at: { x: 9, y: 2 } },
    ],
  });
}

describe('sceneExits — the atlas becomes scene facts', () => {
  it('carries every exit, with its id and its cell', () => {
    expect(sceneExits(atlasWithTwoExits())).toEqual([
      { id: 'entrance', position: { x: 1, y: -4, z: 3 } },
      { id: 'sally-port', position: { x: 9, y: -11, z: 2 } },
    ]);
  });

  it('drops an exit with no cell rather than drawing it at the origin', () => {
    // A marker in the wrong place is worse than no marker — which is the
    // whole lesson of the walk that asked for this layer.
    const atlas = create(GetAtlasResponseSchema, {
      exits: [{ id: 'nowhere' }, { id: 'entrance', at: { x: 1, y: 3 } }],
    });
    expect(sceneExits(atlas).map((e) => e.id)).toEqual(['entrance']);
  });

  it('skips an exit the author never named', () => {
    // Two unnamed exits would collide on one React key and reconcile one
    // of them away, and the label would render empty.
    const atlas = create(GetAtlasResponseSchema, {
      exits: [
        { id: '', at: { x: 0, y: 0 } },
        { id: 'entrance', at: { x: 1, y: 3 } },
      ],
    });
    expect(sceneExits(atlas).map((e) => e.id)).toEqual(['entrance']);
  });

  it('skips an exit standing on floor this member has not seen', () => {
    // `exits` is the same for every member; `cells` is what THIS one
    // knows. An exit in a room they have not opened would otherwise float
    // a cyan hex and a label over void.
    const atlas = atlasWithTwoExits();
    const onlyTheEntrance = new Set(['1,-4,3']);
    expect(sceneExits(atlas, onlyTheEntrance).map((e) => e.id)).toEqual([
      'entrance',
    ]);
    // With no floor set given at all, nothing is filtered — the caller
    // that has one passes it.
    expect(sceneExits(atlas)).toHaveLength(2);
  });

  it('is empty for a dungeon that declares no way out', () => {
    // Every dungeon authored before slice 2, and any atlas from a server
    // older than the field: the route draws what it always drew.
    expect(sceneExits(create(GetAtlasResponseSchema, {}))).toEqual([]);
    expect(sceneExits({})).toEqual([]);
    expect(sceneExits({ exits: undefined })).toEqual([]);
  });
});

describe('SessionExitMarkers — one marked cell per way out', () => {
  it('draws a marked cell for each exit', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SessionExitMarkers exits={sceneExits(atlasWithTwoExits())} hexSize={1} />
    );
    expect(
      renderer.scene.findByProps({ name: 'session-exit-markers' })
    ).toBeTruthy();
    // BOTH of them. A layer that drew only the first would still look
    // right on the reference tomb, which authors exactly one.
    expect(
      renderer.scene.findByProps({ name: 'session-exit-entrance' })
    ).toBeTruthy();
    expect(
      renderer.scene.findByProps({ name: 'session-exit-sally-port' })
    ).toBeTruthy();
    await renderer.unmount();
  });

  it('puts each label OVER ITS OWN CELL, and above head height', async () => {
    // The glyphs cannot be rasterized in jsdom, so the id itself is the
    // screenshot's job. Where the label SITS is not: a `.z`/`.x` slip in
    // the position (the two `worldOf` calls sit one line apart) would put
    // every label on a diagonal away from its cell, and a wrong
    // LABEL_HEIGHT would bury it in the floor or in the token standing on
    // it — which is the bug the first live screenshot actually found.
    const exits = sceneExits(atlasWithTwoExits());
    const renderer = await ReactThreeTestRenderer.create(
      <SessionExitMarkers exits={exits} hexSize={1} />
    );
    for (const exit of exits) {
      const label = renderer.scene.findByProps({
        name: `session-exit-label-${exit.id}`,
      });
      const world = cubeToWorld(exit.position, 1);
      const [x, y, z] = label.props.position as [number, number, number];
      expect(x).toBeCloseTo(world.x);
      expect(z).toBeCloseTo(world.z);
      // Clear of the floor AND of a character standing on the cell — the
      // reference tomb starts the party on its own exit.
      expect(y).toBeGreaterThan(1);
    }
    await renderer.unmount();
  });

  it('draws nothing at all when there is no way out', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SessionExitMarkers exits={[]} hexSize={1} />
    );
    expect(
      renderer.scene.findAllByProps({ name: 'session-exit-markers' })
    ).toHaveLength(0);
    await renderer.unmount();
  });
});
