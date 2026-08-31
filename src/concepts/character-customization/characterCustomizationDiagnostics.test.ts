import type { MainHandAttachmentStatus } from '@/components/hex-grid/mainHandPresentation';
import type {
  SkinnedAccessoryMaterialEvidence,
  SkinnedAccessoryStatus,
} from '@/components/hex-grid/SkinnedAccessoryAttachment';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FACIAL_HAIR_STYLE_REF,
  DEFAULT_SCALP_STYLE_REF,
  FACIAL_HAIR_OPTIONS,
  SCALP_OPTIONS,
} from './characterCustomizationAssets';
import {
  CUSTOMIZATION_WEAPON_PRESENTATION,
  commitCustomizationObservationAfterRendererFrame,
  customizationObservationKey,
  deriveCustomizationEvidence,
  type DeriveCustomizationEvidenceInput,
} from './characterCustomizationDiagnostics';
import {
  DEFAULT_CUSTOMIZATION_FIXTURE,
  REFERENCE_CUSTOMIZATION_FIXTURE,
  SURFACE_PRESETS,
  resolveCustomizationFixture,
  type CharacterCustomizationFixture,
} from './characterCustomizationExperiment';

const RED_TREATMENT = {
  baseColorSrgb: '#C02626',
  roughness: 0.33,
  metalness: 0.66,
} as const;

function material(
  materialUuid: string,
  treatment: CharacterCustomizationFixture['treatment']
): SkinnedAccessoryMaterialEvidence {
  return { materialUuid, ...treatment };
}

function attached(
  slot: 'scalp' | 'facial-hair',
  styleRef: string,
  url: string,
  identity: string,
  treatment: CharacterCustomizationFixture['treatment'],
  materialUuid = `${identity}-${slot}-material`
): SkinnedAccessoryStatus {
  return {
    code: 'attached',
    slot,
    styleRef,
    url,
    bodyRootBoneUuid: `${identity}-root`,
    mappedBoneNames: ['Root', 'Head'],
    mappedBoneUuids: [`${identity}-root`, `${identity}-head`],
    instanceMaterials: [material(materialUuid, treatment)],
  };
}

function input(
  overrides: Partial<DeriveCustomizationEvidenceInput> = {}
): DeriveCustomizationEvidenceInput {
  const fixture: CharacterCustomizationFixture = {
    ...DEFAULT_CUSTOMIZATION_FIXTURE,
    treatment: RED_TREATMENT,
  };
  return {
    fixture,
    surfacePreset: 'custom',
    resolution: resolveCustomizationFixture(fixture),
    controlledStatuses: {
      scalp: attached(
        'scalp',
        DEFAULT_SCALP_STYLE_REF,
        SCALP_OPTIONS[0].url,
        'controlled',
        fixture.treatment
      ),
      'facial-hair': attached(
        'facial-hair',
        DEFAULT_FACIAL_HAIR_STYLE_REF,
        FACIAL_HAIR_OPTIONS[1].url,
        'controlled',
        fixture.treatment
      ),
    },
    referenceStatuses: {
      scalp: attached(
        'scalp',
        DEFAULT_SCALP_STYLE_REF,
        SCALP_OPTIONS[0].url,
        'reference',
        REFERENCE_CUSTOMIZATION_FIXTURE.treatment
      ),
      'facial-hair': attached(
        'facial-hair',
        DEFAULT_FACIAL_HAIR_STYLE_REF,
        FACIAL_HAIR_OPTIONS[1].url,
        'reference',
        REFERENCE_CUSTOMIZATION_FIXTURE.treatment
      ),
    },
    weaponStatus: { code: 'unarmed' },
    ...overrides,
  };
}

function committedInput(
  overrides: Partial<DeriveCustomizationEvidenceInput> = {}
): DeriveCustomizationEvidenceInput {
  const readyInput = input(overrides);
  const ready = deriveCustomizationEvidence(readyInput);
  if (!ready.pendingObservation) throw new Error('expected ready evidence');
  return {
    ...readyInput,
    committedObservationKey: customizationObservationKey(
      ready.pendingObservation
    ),
  };
}

describe('deriveCustomizationEvidence identity fences', () => {
  it('drops stale slot facts synchronously during rapid style changes', () => {
    const fixture: CharacterCustomizationFixture = {
      ...DEFAULT_CUSTOMIZATION_FIXTURE,
      scalp: SCALP_OPTIONS[2].styleRef,
      facialHair: FACIAL_HAIR_OPTIONS[2].styleRef,
      treatment: RED_TREATMENT,
    };
    const result = deriveCustomizationEvidence(
      input({
        fixture,
        resolution: resolveCustomizationFixture(fixture),
      })
    );

    expect(result.diagnostics.scalpStatus).toBeUndefined();
    expect(result.diagnostics.facialHairStatus).toBeUndefined();
    expect(result.diagnostics.sceneCommitted).toBe(false);
    expect(result.diagnostics.mountedAccessoryArmatures).toBe('unknown');
    expect(result.pendingObservation).toBeUndefined();
  });

  it('fences stored weapon diagnostics by the current ref, URL, and bone', () => {
    const staleWeapon: MainHandAttachmentStatus = {
      code: 'attached',
      ref: CUSTOMIZATION_WEAPON_PRESENTATION.ref,
      weaponUrl: '/stale/warhammer.glb',
      bone: CUSTOMIZATION_WEAPON_PRESENTATION.socket.bone,
    };
    const armedFixture = {
      ...DEFAULT_CUSTOMIZATION_FIXTURE,
      treatment: RED_TREATMENT,
      showWeaponWitness: true,
    };
    const armed = deriveCustomizationEvidence(
      input({
        fixture: armedFixture,
        resolution: resolveCustomizationFixture(armedFixture),
        weaponStatus: staleWeapon,
      })
    );

    expect(armed.diagnostics.weaponStatus).toEqual({
      code: 'loading',
      ref: CUSTOMIZATION_WEAPON_PRESENTATION.ref,
      weaponUrl: CUSTOMIZATION_WEAPON_PRESENTATION.weaponUrl,
      bone: CUSTOMIZATION_WEAPON_PRESENTATION.socket.bone,
    });
    expect(
      deriveCustomizationEvidence(input({ weaponStatus: staleWeapon }))
        .diagnostics.weaponStatus
    ).toEqual({ code: 'unarmed' });
  });
});

describe('deriveCustomizationEvidence readiness', () => {
  it('keeps loading unknown, derives zero for terminal none/attached, and refuses rejected binds', () => {
    const noneFixture: CharacterCustomizationFixture = {
      ...DEFAULT_CUSTOMIZATION_FIXTURE,
      scalp: 'none',
      treatment: RED_TREATMENT,
    };
    const loading = deriveCustomizationEvidence(
      input({
        fixture: noneFixture,
        resolution: resolveCustomizationFixture(noneFixture),
        controlledStatuses: {
          scalp: input().controlledStatuses.scalp,
          'facial-hair': {
            code: 'loading',
            slot: 'facial-hair',
            styleRef: DEFAULT_FACIAL_HAIR_STYLE_REF,
            url: FACIAL_HAIR_OPTIONS[1].url,
          },
        },
      })
    );
    expect(loading.diagnostics.scalpStatus).toEqual({
      code: 'none',
      slot: 'scalp',
    });
    expect(loading.diagnostics.facialHairStatus?.code).toBe('loading');
    expect(loading.diagnostics.mountedAccessoryArmatures).toBe('unknown');
    expect(loading.pendingObservation).toBeUndefined();

    const attachedTerminal = deriveCustomizationEvidence(
      input({
        fixture: noneFixture,
        resolution: resolveCustomizationFixture(noneFixture),
        controlledStatuses: {
          'facial-hair': input().controlledStatuses['facial-hair'],
        },
      })
    );
    expect(attachedTerminal.diagnostics.mountedAccessoryArmatures).toBe(0);
    expect(attachedTerminal.pendingObservation).toBeDefined();

    const rejected = deriveCustomizationEvidence(
      input({
        fixture: noneFixture,
        resolution: resolveCustomizationFixture(noneFixture),
        controlledStatuses: {
          'facial-hair': {
            code: 'rejected',
            slot: 'facial-hair',
            styleRef: DEFAULT_FACIAL_HAIR_STYLE_REF,
            url: FACIAL_HAIR_OPTIONS[1].url,
            message: 'incompatible skeleton',
          },
        },
      })
    );
    expect(rejected.diagnostics.mountedAccessoryArmatures).toBe(0);
    expect(rejected.pendingObservation).toBeUndefined();
    expect(rejected.diagnostics.sceneCommitted).toBe(false);
  });

  it('requires a renderer frame strictly after readiness before commitment', () => {
    const ready = deriveCustomizationEvidence(input());
    expect(ready.pendingObservation).toBeDefined();
    expect(ready.diagnostics.sceneCommitted).toBe(false);

    expect(
      commitCustomizationObservationAfterRendererFrame(
        ready.pendingObservation,
        41,
        41
      )
    ).toBeUndefined();
    const committed = commitCustomizationObservationAfterRendererFrame(
      ready.pendingObservation,
      41,
      42
    );
    expect(committed).toMatchObject({ sceneCommitted: true });

    const published = deriveCustomizationEvidence(committedInput());
    expect(published.diagnostics.sceneCommitted).toBe(true);
    expect(published.diagnostics.referenceTwinIsolation).toBe(true);
  });
});

describe('deriveCustomizationEvidence material isolation', () => {
  it('credits disjoint instance materials with controlled actuals and preserved reference defaults', () => {
    const result = deriveCustomizationEvidence(committedInput());

    expect(result.diagnostics.referenceTwinIsolation).toBe(true);
    expect(
      result.diagnostics.scalpStatus?.code === 'attached'
        ? result.diagnostics.scalpStatus.instanceMaterials
        : []
    ).toEqual([
      {
        materialUuid: 'controlled-scalp-material',
        ...RED_TREATMENT,
      },
    ]);
  });

  it('refuses shared material identity or a reference receiving the controlled treatment', () => {
    const shared = input();
    const sharedReferenceScalp = attached(
      'scalp',
      DEFAULT_SCALP_STYLE_REF,
      SCALP_OPTIONS[0].url,
      'reference',
      SURFACE_PRESETS.hair,
      'controlled-scalp-material'
    );
    const sharedResult = deriveCustomizationEvidence(
      committedInput({
        referenceStatuses: {
          ...shared.referenceStatuses,
          scalp: sharedReferenceScalp,
        },
      })
    );
    expect(sharedResult.diagnostics.referenceTwinIsolation).toBe(false);

    const mutatedResult = deriveCustomizationEvidence(
      input({
        referenceStatuses: {
          scalp: attached(
            'scalp',
            DEFAULT_SCALP_STYLE_REF,
            SCALP_OPTIONS[0].url,
            'reference',
            RED_TREATMENT
          ),
          'facial-hair': attached(
            'facial-hair',
            DEFAULT_FACIAL_HAIR_STYLE_REF,
            FACIAL_HAIR_OPTIONS[1].url,
            'reference',
            RED_TREATMENT
          ),
        },
      })
    );
    expect(mutatedResult.pendingObservation).toBeUndefined();
    expect(mutatedResult.diagnostics.referenceTwinIsolation).toBe(false);
  });

  it('does not credit an unchanged default treatment as an isolation witness', () => {
    const fixture = DEFAULT_CUSTOMIZATION_FIXTURE;
    const defaultReady = input({
      fixture,
      surfacePreset: 'hair',
      resolution: resolveCustomizationFixture(fixture),
      controlledStatuses: {
        scalp: attached(
          'scalp',
          DEFAULT_SCALP_STYLE_REF,
          SCALP_OPTIONS[0].url,
          'controlled',
          SURFACE_PRESETS.hair
        ),
        'facial-hair': attached(
          'facial-hair',
          DEFAULT_FACIAL_HAIR_STYLE_REF,
          FACIAL_HAIR_OPTIONS[1].url,
          'controlled',
          SURFACE_PRESETS.hair
        ),
      },
    });
    const pending =
      deriveCustomizationEvidence(defaultReady).pendingObservation;
    if (!pending) throw new Error('expected default evidence readiness');
    const result = deriveCustomizationEvidence({
      ...defaultReady,
      committedObservationKey: customizationObservationKey(pending),
    });

    expect(result.diagnostics.sceneCommitted).toBe(true);
    expect(result.diagnostics.referenceTwinIsolation).toBe(false);
  });

  it('refuses missing material evidence and controlled actual-value mismatches', () => {
    const base = input();
    const missing = {
      ...(base.controlledStatuses.scalp as Extract<
        SkinnedAccessoryStatus,
        { code: 'attached' }
      >),
      instanceMaterials: [],
    };
    const missingResult = deriveCustomizationEvidence(
      input({
        controlledStatuses: {
          ...base.controlledStatuses,
          scalp: missing,
        },
      })
    );
    expect(missingResult.pendingObservation).toBeUndefined();
    expect(missingResult.diagnostics.referenceTwinIsolation).toBe(false);

    const mismatch = attached(
      'scalp',
      DEFAULT_SCALP_STYLE_REF,
      SCALP_OPTIONS[0].url,
      'controlled',
      SURFACE_PRESETS.metalLike
    );
    const mismatchResult = deriveCustomizationEvidence(
      input({
        controlledStatuses: {
          ...base.controlledStatuses,
          scalp: mismatch,
        },
      })
    );
    expect(mismatchResult.pendingObservation).toBeUndefined();
    expect(mismatchResult.diagnostics.sceneCommitted).toBe(false);
    expect(mismatchResult.diagnostics.referenceTwinIsolation).toBe(false);
  });
});
