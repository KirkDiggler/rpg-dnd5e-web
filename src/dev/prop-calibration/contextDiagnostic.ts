export interface RendererCounters {
  memory: { geometries: number; textures: number };
  render: { calls: number; triangles: number };
}

export interface ContextLossDiagnostic {
  kind: 'webgl-context-lost';
  statusMessage: string;
  geometries: number;
  textures: number;
  calls: number;
  triangles: number;
}

export function contextLossDiagnostic(
  statusMessage: string,
  counters: RendererCounters
): ContextLossDiagnostic {
  return {
    kind: 'webgl-context-lost',
    statusMessage: statusMessage || '(browser supplied no status message)',
    geometries: counters.memory.geometries,
    textures: counters.memory.textures,
    calls: counters.render.calls,
    triangles: counters.render.triangles,
  };
}
