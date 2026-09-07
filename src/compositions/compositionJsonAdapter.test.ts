import { create } from '@bufbuild/protobuf';
import {
  CompositionSchema,
  type Composition,
} from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { JsonCompositionAdapter } from './compositionJsonAdapter';
import { decodeCompositionScene } from './compositionScene';
import decoratedTableJson from './fixtures/decorated-table.scene.json?raw';

const WORLD_A = 'world-a';
const WORLD_B = 'world-b';

function composition(
  id: string,
  worldId: string,
  json = decoratedTableJson
): Composition {
  return create(CompositionSchema, { id, worldId, json });
}

describe('JsonCompositionAdapter', () => {
  it('uses the unchanged decorated-table specimen and existing scene decoder', () => {
    expect(createHash('sha256').update(decoratedTableJson).digest('hex')).toBe(
      'c6e50c800d869eecaac74dac6670a37a30ba5bbbade49ca6ccead5ecd1cdf2c8'
    );

    const scene = decodeCompositionScene(
      composition('decorated-table', WORLD_A)
    );
    expect(scene.items.map((item) => item.assetRef).sort()).toEqual([
      'dnd5e:props:books',
      'dnd5e:props:books',
      'dnd5e:props:candles',
      'dnd5e:props:candles',
      'dnd5e:props:skeleton-table',
    ]);
  });

  it('lists by WorldID and gets by WorldID plus Composition.ID', async () => {
    const adapter = new JsonCompositionAdapter([
      composition('shared-id', WORLD_A),
      composition('only-a', WORLD_A),
      composition('shared-id', WORLD_B),
    ]);

    expect(
      (await adapter.listCompositions(WORLD_A)).map(({ id }) => id)
    ).toEqual(['shared-id', 'only-a']);
    expect((await adapter.listCompositions('missing-world')).length).toBe(0);
    expect((await adapter.getComposition(WORLD_A, 'shared-id'))?.worldId).toBe(
      WORLD_A
    );
    expect((await adapter.getComposition(WORLD_B, 'shared-id'))?.worldId).toBe(
      WORLD_B
    );
    expect(await adapter.getComposition(WORLD_A, 'missing-id')).toBeNull();
  });

  it('rejects missing metadata, duplicate scoped IDs, and malformed authored JSON', () => {
    expect(
      () => new JsonCompositionAdapter([composition('', WORLD_A)])
    ).toThrow(/id/i);
    expect(
      () => new JsonCompositionAdapter([composition('valid', '')])
    ).toThrow(/world/i);
    expect(
      () =>
        new JsonCompositionAdapter([
          composition('duplicate', WORLD_A),
          composition('duplicate', WORLD_A),
        ])
    ).toThrow(/duplicate/i);
    expect(
      () =>
        new JsonCompositionAdapter([
          composition('malformed', WORLD_A, '{"not":"a scene"}'),
        ])
    ).toThrow(/scene/i);
  });

  it('returns independent proto snapshots without mutating its JSON source', async () => {
    const source = composition('decorated-table', WORLD_A);
    const sourceJson = source.json;
    const adapter = new JsonCompositionAdapter([source]);

    source.json = 'changed after construction';
    const first = await adapter.getComposition(WORLD_A, 'decorated-table');
    expect(first?.json).toBe(sourceJson);
    if (first) first.json = 'changed by caller';

    expect(
      (await adapter.getComposition(WORLD_A, 'decorated-table'))?.json
    ).toBe(sourceJson);
  });
});
