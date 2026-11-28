import type {
  ChannelAdjustment,
  ChannelCapability,
  MaterialChannelAdjustment,
} from './materialChannelTypes';

/** Immutable baseline after fitting/complete-look selection, before overlays.
 * The caller retains image/tint ownership; this value grants no capability. */
export interface MaterialChannelSource {
  readonly normalScale: readonly [number, number];
  readonly hasNormalMap: boolean;
  readonly emissive: readonly [number, number, number];
  readonly emissiveIntensity: number;
  readonly hasEmissiveMap: boolean;
}

export interface MaterialChannelValuesInput {
  readonly source: MaterialChannelSource;
  readonly capabilities: {
    readonly normal: ChannelCapability;
    readonly emissive: ChannelCapability;
  };
  readonly adjustment?: Pick<MaterialChannelAdjustment, 'normal' | 'emissive'>;
}

/** Values for the existing material owner to apply only after all targets pass. */
export interface MaterialChannelValues {
  normalScale: [number, number];
  emissiveIntensity: number;
}

function finiteShaderValue(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value)))
    throw Error(`${label}: must be finite and representable by shader floats.`);
}

function multiplier(
  role: 'normal' | 'emissive',
  capability: ChannelCapability,
  adjustment: ChannelAdjustment | undefined
): number | undefined {
  if (adjustment === undefined) return undefined;
  if (capability.kind !== 'adjustable')
    throw Error(`${role}: target is not adjustable.`);
  const { minMultiplier: min, maxMultiplier: max } = capability;
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min <= 0 ||
    min > 1 ||
    max < 1 ||
    min > max
  )
    throw Error(`${role}: invalid provider multiplier interval.`);
  if (adjustment.mode === 'off') {
    if (Object.hasOwn(adjustment, 'multiplier'))
      throw Error(`${role}: Off cannot carry a multiplier.`);
    return 0;
  }
  if (
    adjustment.mode !== 'scale' ||
    !Number.isFinite(adjustment.multiplier) ||
    adjustment.multiplier <= 0 ||
    adjustment.multiplier < min ||
    adjustment.multiplier > max
  )
    throw Error(
      `${role}: multiplier is invalid or outside the provider interval.`
    );
  return adjustment.multiplier;
}

/** Resolve against the immutable effective baseline, never a prior treatment.
 * Refuses invalid capabilities, absent/zero sources and nonfinite results before
 * returning any values. It never mutates materials, maps, tint or authored intent. */
export function resolveMaterialChannelValues(
  input: MaterialChannelValuesInput
): MaterialChannelValues {
  const { source, capabilities, adjustment } = input;
  if (source.normalScale.length !== 2 || source.emissive.length !== 3)
    throw Error('Material channel source has invalid vector dimensions.');
  source.normalScale.forEach((value) =>
    finiteShaderValue(value, 'normal source')
  );
  source.emissive.forEach((value) => {
    finiteShaderValue(value, 'emissive source');
    if (value < 0) throw Error('emissive source: negative tint is invalid.');
  });
  finiteShaderValue(source.emissiveIntensity, 'emissive source intensity');
  if (source.emissiveIntensity < 0)
    throw Error('emissive source: negative intensity is invalid.');

  const normal = multiplier('normal', capabilities.normal, adjustment?.normal);
  const emissive = multiplier(
    'emissive',
    capabilities.emissive,
    adjustment?.emissive
  );
  if (
    normal !== undefined &&
    (source.hasNormalMap !== true ||
      !source.normalScale.some((value) => value !== 0))
  )
    throw Error('normal: adjustment needs an effective nonzero mapped source.');
  if (
    emissive !== undefined &&
    (source.hasEmissiveMap !== true ||
      source.emissiveIntensity === 0 ||
      !source.emissive.some((value) => value > 0))
  )
    throw Error(
      'emissive: adjustment cannot supply or activate a zero source.'
    );

  const normalScale: [number, number] =
    normal === 0
      ? [0, 0]
      : [
          source.normalScale[0] * (normal ?? 1),
          source.normalScale[1] * (normal ?? 1),
        ];
  const emissiveIntensity = source.emissiveIntensity * (emissive ?? 1);
  normalScale.forEach((value) =>
    finiteShaderValue(value, 'resolved normal scale')
  );
  finiteShaderValue(emissiveIntensity, 'resolved emissive intensity');
  source.emissive.forEach((value) =>
    finiteShaderValue(
      value * emissiveIntensity,
      'resolved emissive contribution'
    )
  );
  return { normalScale, emissiveIntensity };
}
