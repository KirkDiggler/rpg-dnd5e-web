// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createDevelopmentCompositionSource,
  DEVELOPMENT_COMPOSITION_WORLD_ID,
  DEVELOPMENT_DECORATED_TABLE_ID,
} from './developmentCompositionSource';

describe('development composition source', () => {
  it('requires both development mode and the explicit enable flag', () => {
    expect(
      createDevelopmentCompositionSource('production', '1')
    ).toBeUndefined();
    expect(
      createDevelopmentCompositionSource('development', undefined)
    ).toBeUndefined();
    expect(
      createDevelopmentCompositionSource('development', '0')
    ).toBeUndefined();
  });

  it('scopes the exact decorated-table snapshot to one named development world', async () => {
    const source = createDevelopmentCompositionSource('development', '1');
    expect(source?.worldId).toBe(DEVELOPMENT_COMPOSITION_WORLD_ID);
    const listed = await source!.reader.listCompositions(source!.worldId);
    expect(listed.map(({ id }) => id)).toEqual([
      DEVELOPMENT_DECORATED_TABLE_ID,
    ]);
    expect(JSON.parse(listed[0]!.json)).toMatchObject({
      kind: 'rpg-world-building-scene',
      version: 1,
      scene: { items: expect.any(Array) },
    });
    expect(await source!.reader.listCompositions('some-other-world')).toEqual(
      []
    );
  });
});
