import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FACIAL_HAIR_STYLE_REF,
  DEFAULT_SCALP_STYLE_REF,
  FACIAL_HAIR_OPTIONS,
  SCALP_OPTIONS,
} from './characterCustomizationAssets';
import {
  SURFACE_PRESETS,
  canRecordCustomizationVerdict,
  coverageFor,
  resolveCustomizationFixture,
  resolveStyleSelection,
  type CharacterCustomizationRenderObservation,
  type StyleSelection,
  type SurfacePresetName,
} from './characterCustomizationExperiment';

const attachedStatus = (
  slot: 'scalp' | 'facial-hair',
  styleRef: string,
  url: string,
  identity: string
) => ({
  code: 'attached' as const,
  slot,
  styleRef,
  url,
  bodyRootBoneUuid: `${identity}-root`,
  mappedBoneNames: ['Head'],
  mappedBoneUuids: [`${identity}-head`],
});

function observation(
  scalp: StyleSelection,
  facialHair: StyleSelection,
  preset: SurfacePresetName,
  overrides: Partial<CharacterCustomizationRenderObservation> = {}
): CharacterCustomizationRenderObservation {
  const fixture = {
    scalp,
    facialHair,
    treatment: SURFACE_PRESETS[preset],
    motion: 'idle' as const,
    view: 'close' as const,
    showWeaponWitness: false,
  };
  const resolved = resolveCustomizationFixture(fixture);
  if (resolved.scalp.code === 'unmapped') throw new Error('scalp must map');
  if (resolved.facialHair.code === 'unmapped') {
    throw new Error('facial hair must map');
  }

  const statusFor = (
    resolution: typeof resolved.scalp | typeof resolved.facialHair,
    identity: string
  ) =>
    resolution.code === 'none'
      ? { code: 'none' as const, slot: resolution.slot }
      : attachedStatus(
          resolution.slot,
          resolution.styleRef,
          resolution.asset.url,
          identity
        );

  return {
    fixture,
    surfacePreset: preset,
    scalpStatus: statusFor(resolved.scalp, 'controlled'),
    facialHairStatus: statusFor(resolved.facialHair, 'controlled'),
    referenceScalpStatus: attachedStatus(
      'scalp',
      SCALP_OPTIONS[0].styleRef,
      SCALP_OPTIONS[0].url,
      'reference'
    ),
    referenceFacialHairStatus: attachedStatus(
      'facial-hair',
      FACIAL_HAIR_OPTIONS[1].styleRef,
      FACIAL_HAIR_OPTIONS[1].url,
      'reference'
    ),
    sceneCommitted: true,
    mountedAccessoryArmatures: 0,
    referenceTwinIsolation: true,
    ...overrides,
  };
}

describe('character customization fixture resolution', () => {
  it('pins the four provisional surface presets', () => {
    expect(SURFACE_PRESETS).toEqual({
      hair: { baseColorSrgb: '#5A3825', roughness: 0.72, metalness: 0 },
      clothLike: {
        baseColorSrgb: '#5B6B8C',
        roughness: 0.95,
        metalness: 0,
      },
      leatherLike: {
        baseColorSrgb: '#6B3F26',
        roughness: 0.7,
        metalness: 0,
      },
      metalLike: {
        baseColorSrgb: '#9CA3AF',
        roughness: 0.25,
        metalness: 1,
      },
    });
  });

  it('resolves each default to its exact provider option', () => {
    const treatment = SURFACE_PRESETS.hair;
    const scalp = resolveStyleSelection('scalp', 'default', treatment);
    const facial = resolveStyleSelection('facial-hair', 'default', treatment);

    expect(scalp).toMatchObject({
      code: 'mapped',
      selection: 'default',
      styleRef: DEFAULT_SCALP_STYLE_REF,
      asset: { label: 'Hair 04' },
    });
    expect(facial).toMatchObject({
      code: 'mapped',
      selection: 'default',
      styleRef: DEFAULT_FACIAL_HAIR_STYLE_REF,
      asset: { label: 'Facial Hair 02' },
    });
  });

  it('keeps explicit none distinct and refuses unknown refs', () => {
    expect(
      resolveStyleSelection('scalp', 'none', SURFACE_PRESETS.hair)
    ).toEqual({ code: 'none', slot: 'scalp', selection: 'none' });
    expect(
      resolveStyleSelection(
        'facial-hair',
        'modular-fantasy-hero:facial-hair:unknown',
        SURFACE_PRESETS.hair
      )
    ).toEqual({
      code: 'unmapped',
      slot: 'facial-hair',
      selection: 'modular-fantasy-hero:facial-hair:unknown',
    });
  });

  it('passes one shared treatment object to both attached slots', () => {
    const treatment = {
      baseColorSrgb: '#C02626' as const,
      roughness: 0.43,
      metalness: 0.12,
    };
    const resolved = resolveCustomizationFixture({
      scalp: SCALP_OPTIONS[1].styleRef,
      facialHair: FACIAL_HAIR_OPTIONS[2].styleRef,
      treatment,
      motion: 'walk',
      view: 'orbit',
      showWeaponWitness: true,
    });

    expect(resolved.presentations).toHaveLength(2);
    expect(resolved.presentations[0]!.treatment).toBe(treatment);
    expect(resolved.presentations[1]!.treatment).toBe(treatment);
  });
});

describe('character customization verdict coverage', () => {
  it('requires every default/style/none state, motions, views, presets, a non-default pair, and twin isolation', () => {
    const rows: CharacterCustomizationRenderObservation[] = [];
    const scalpStates: StyleSelection[] = [
      'default',
      'none',
      ...SCALP_OPTIONS.map((option) => option.styleRef),
    ];
    const facialStates: StyleSelection[] = [
      'default',
      'none',
      ...FACIAL_HAIR_OPTIONS.map((option) => option.styleRef),
    ];

    scalpStates.forEach((scalp) =>
      rows.push(observation(scalp, 'default', 'hair'))
    );
    facialStates.forEach((facialHair) =>
      rows.push(observation('default', facialHair, 'hair'))
    );
    rows.push(
      observation(
        SCALP_OPTIONS[1].styleRef,
        FACIAL_HAIR_OPTIONS[2].styleRef,
        'clothLike',
        {
          fixture: {
            ...observation('default', 'default', 'hair').fixture,
            scalp: SCALP_OPTIONS[1].styleRef,
            facialHair: FACIAL_HAIR_OPTIONS[2].styleRef,
            treatment: SURFACE_PRESETS.clothLike,
            motion: 'walk',
            view: 'orbit',
          },
        }
      ),
      observation('default', 'default', 'leatherLike', {
        fixture: {
          ...observation('default', 'default', 'hair').fixture,
          treatment: SURFACE_PRESETS.leatherLike,
          view: 'play',
        },
      }),
      observation('default', 'default', 'metalLike')
    );

    const coverage = coverageFor(rows);
    expect(coverage.scalpSelections).toEqual(scalpStates);
    expect(coverage.facialHairSelections).toEqual(facialStates);
    expect(coverage.motions).toEqual(['idle', 'walk']);
    expect(coverage.views).toEqual(['close', 'orbit', 'play']);
    expect(coverage.surfacePresets).toEqual([
      'hair',
      'clothLike',
      'leatherLike',
      'metalLike',
    ]);
    expect(coverage.simultaneousNonDefaultPair).toBe(true);
    expect(coverage.referenceTwinIsolation).toBe(true);
    expect(canRecordCustomizationVerdict(rows)).toBe(true);
  });

  it('does not credit stale, uncommitted, armature-retaining, or non-isolated evidence', () => {
    const good = observation('default', 'default', 'hair');
    const stale = observation('default', 'default', 'hair', {
      scalpStatus: attachedStatus(
        'scalp',
        SCALP_OPTIONS[1].styleRef,
        SCALP_OPTIONS[1].url,
        'controlled'
      ),
    });
    const invalid = [
      stale,
      { ...good, sceneCommitted: false },
      { ...good, mountedAccessoryArmatures: 1 },
    ];
    const nonIsolated = { ...good, referenceTwinIsolation: false };

    expect(coverageFor(invalid).scalpSelections).toEqual([]);
    expect(coverageFor([nonIsolated])).toMatchObject({
      scalpSelections: ['default'],
      referenceTwinIsolation: false,
    });
    expect(canRecordCustomizationVerdict([...invalid, nonIsolated])).toBe(
      false
    );
  });
});
