import { describe, expect, it, vi } from 'vitest';
import { createWorldMaterialPreviewLoader } from './worldMaterialPreviewLoader';
describe('shared material preview request', () => {
  it('shares one validated metadata request across Studio and renderer consumers', async () => {
    const catalog = {
      kind: 'candidate',
      catalogSha256: 'a'.repeat(64),
      materials: [],
      surfaces: [],
    };
    const fetcher = vi.fn(
      async () => ({ ok: true, json: async () => catalog }) as Response
    );
    const load = createWorldMaterialPreviewLoader(fetcher);
    const a = load(),
      b = load();
    expect(a).toBe(b);
    expect(await a).toEqual(catalog);
    expect(await b).toEqual(catalog);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('retains a named failure rather than installing a partial catalog', async () => {
    const fetcher = vi.fn(async () => ({ ok: false }) as Response);
    const load = createWorldMaterialPreviewLoader(fetcher);
    await expect(load()).rejects.toThrow(/staged/i);
    await expect(load()).rejects.toThrow(/staged/i);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
