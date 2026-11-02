export interface PerfProbeRendererCounterStats {
  /** Mean and max over the frames whose counter was a finite number. */
  mean: number;
  max: number;
  /** Frames whose counter was not finite and were left out of mean/max.
   * three.js adds `instanceCount * (count / 3)` per draw; a drei/troika
   * `<Text>` draws once with `instanceCount = Infinity` before its glyphs
   * sync (no instanced attribute yet bounds it), which makes that frame's
   * `gl.info.render.triangles` Infinity, or NaN for an empty draw. One such
   * frame used to turn the whole window's mean and max into JSON null. */
  nonFinite: number;
}

export function counterStats(values: number[]): PerfProbeRendererCounterStats {
  const finite = values.filter((value) => Number.isFinite(value));
  return {
    mean: finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : 0,
    max: finite.length ? Math.max(...finite) : 0,
    nonFinite: values.length - finite.length,
  };
}
