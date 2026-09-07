import { describe, expect, it } from 'vitest';
import { contextLossDiagnostic } from './contextDiagnostic';

describe('contextLossDiagnostic', () => {
  it('captures the browser reason and bounded renderer counters', () => {
    expect(
      contextLossDiagnostic('GPU reset', {
        memory: { geometries: 14, textures: 3 },
        render: { calls: 8, triangles: 9200 },
      })
    ).toEqual({
      kind: 'webgl-context-lost',
      statusMessage: 'GPU reset',
      geometries: 14,
      textures: 3,
      calls: 8,
      triangles: 9200,
    });
  });
});
