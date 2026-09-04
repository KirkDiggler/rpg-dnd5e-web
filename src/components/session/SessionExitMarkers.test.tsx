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

  it('is empty for a dungeon that declares no way out', () => {
    // Every dungeon authored before slice 2, and any atlas from a server
    // older than the field: the route draws what it always drew.
    expect(sceneExits(create(GetAtlasResponseSchema, {}))).toEqual([]);
    expect(sceneExits({})).toEqual([]);
    expect(sceneExits({ exits: undefined })).toEqual([]);
  });
});

describe('SessionExitMarkers — one marked cell per way out', () => {
  it('draws a named group for each exit, and the id as its label', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SessionExitMarkers exits={sceneExits(atlasWithTwoExits())} hexSize={1} />
    );
    const root = renderer.scene.findByProps({ name: 'session-exit-markers' });
    expect(root).toBeTruthy();
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
