import type { SkinnedAccessoryStatus } from '@/components/hex-grid/SkinnedAccessoryAttachment';
import { useCallback, useMemo, useRef, useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import {
  CHARACTER_CUSTOMIZATION_BODY,
  FACIAL_HAIR_OPTIONS,
  SCALP_OPTIONS,
  type CharacterCustomizationAsset,
} from './characterCustomizationAssets';
import {
  DEFAULT_CUSTOMIZATION_FIXTURE,
  SURFACE_PRESETS,
  canRecordCustomizationVerdict,
  coverageFor,
  customizationConceptVerdict,
  resolveCustomizationFixture,
  type ActiveSurfacePreset,
  type CharacterCustomizationFixture,
  type CharacterCustomizationRenderObservation,
  type StyleResolution,
  type StyleSelection,
  type SurfacePresetName,
} from './characterCustomizationExperiment';
import {
  CharacterCustomizationPreview,
  type CharacterCustomizationDiagnostics,
} from './CharacterCustomizationPreview';

const PRESET_LABELS: Readonly<Record<SurfacePresetName, string>> = {
  hair: 'Hair',
  clothLike: 'Cloth-like',
  leatherLike: 'Leather-like',
  metalLike: 'Metal-like',
};
const COLOR_SWATCHES = [
  { label: 'Black', value: '#111111' },
  { label: 'Blond', value: '#D8B36A' },
  { label: 'Red', value: '#C02626' },
] as const;
const EXACT_HEX = /^#[0-9A-F]{6}$/i;

function readStyleParam(name: string): StyleSelection {
  if (typeof window === 'undefined') return 'default';
  return new URLSearchParams(window.location.search).get(name) ?? 'default';
}

function observationKey(
  observation: CharacterCustomizationRenderObservation
): string {
  return JSON.stringify(observation);
}

function StyleSelector({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: StyleSelection;
  readonly options: readonly CharacterCustomizationAsset[];
  readonly onChange: (value: StyleSelection) => void;
}) {
  const values = [
    { value: 'default', label: 'Default' },
    { value: 'none', label: 'None' },
    ...options.map((option) => ({
      value: option.styleRef,
      label: option.label,
    })),
  ];
  return (
    <fieldset aria-label={label} className="space-y-2">
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className="rounded border px-3 py-1.5 text-sm"
              style={{
                backgroundColor: active
                  ? 'var(--accent-primary)'
                  : 'var(--bg-secondary)',
                borderColor: active
                  ? 'var(--accent-primary)'
                  : 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ToggleGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
}) {
  return (
    <fieldset aria-label={label} className="space-y-2">
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className="rounded border px-3 py-1.5 text-sm"
              style={{
                backgroundColor: active
                  ? 'var(--accent-primary)'
                  : 'var(--bg-secondary)',
                borderColor: active
                  ? 'var(--accent-primary)'
                  : 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function statusCode(
  resolution: StyleResolution,
  status: SkinnedAccessoryStatus | undefined
): string {
  if (resolution.code === 'unmapped') return 'unmapped';
  return status?.code ?? 'awaiting-render';
}

function resolvedStyleRef(resolution: StyleResolution): string {
  return resolution.code === 'mapped'
    ? resolution.styleRef
    : resolution.selection;
}

function resolvedUrl(resolution: StyleResolution): string {
  if (resolution.code === 'mapped') return resolution.asset.url;
  return resolution.code;
}

function resolvedSize(resolution: StyleResolution): string {
  return resolution.code === 'mapped'
    ? `${resolution.asset.byteSize.toLocaleString()} bytes`
    : resolution.code;
}

function resolvedHash(resolution: StyleResolution): string {
  return resolution.code === 'mapped'
    ? resolution.asset.sha256
    : resolution.code;
}

function mappedStatuses(
  diagnostics: CharacterCustomizationDiagnostics
): Extract<SkinnedAccessoryStatus, { code: 'attached' }>[] {
  return [diagnostics.scalpStatus, diagnostics.facialHairStatus].filter(
    (status): status is Extract<SkinnedAccessoryStatus, { code: 'attached' }> =>
      status?.code === 'attached'
  );
}

function missingBoneText(
  diagnostics: CharacterCustomizationDiagnostics,
  resolution: ReturnType<typeof resolveCustomizationFixture>
): string {
  if (
    resolution.scalp.code === 'unmapped' ||
    resolution.facialHair.code === 'unmapped'
  ) {
    return 'unknown until the unmapped ref is supplied by the provider';
  }
  const rejected = [
    diagnostics.scalpStatus,
    diagnostics.facialHairStatus,
  ].filter(
    (status): status is Extract<SkinnedAccessoryStatus, { code: 'rejected' }> =>
      status?.code === 'rejected'
  );
  if (rejected.length === 0) return 'none reported';
  return rejected.map((status) => status.message).join(' · ');
}

const EMPTY_DIAGNOSTICS: CharacterCustomizationDiagnostics = {
  mountedAccessoryArmatures: 'unknown',
  referenceTwinIsolation: false,
  sceneCommitted: false,
  weaponStatus: { code: 'unarmed' },
};

export function CharacterCustomizationConcept() {
  const [fixture, setFixture] = useState<CharacterCustomizationFixture>(() => ({
    ...DEFAULT_CUSTOMIZATION_FIXTURE,
    scalp: readStyleParam('scalp'),
    facialHair: readStyleParam('facialHair'),
  }));
  const [surfacePreset, setSurfacePreset] =
    useState<ActiveSurfacePreset>('hair');
  const [diagnostics, setDiagnostics] =
    useState<CharacterCustomizationDiagnostics>(EMPTY_DIAGNOSTICS);
  const [observations, setObservations] = useState<
    CharacterCustomizationRenderObservation[]
  >([]);
  const [verdictJson, setVerdictJson] = useState<string>();
  const observedKeys = useRef(new Set<string>());

  const resolution = useMemo(
    () => resolveCustomizationFixture(fixture),
    [fixture]
  );
  const coverage = useMemo(() => coverageFor(observations), [observations]);
  const canRecord = useMemo(
    () => canRecordCustomizationVerdict(observations),
    [observations]
  );

  const updateFixture = useCallback(
    (patch: Partial<CharacterCustomizationFixture>) => {
      setFixture((current) => ({ ...current, ...patch }));
      setVerdictJson(undefined);
    },
    []
  );
  const updateTreatment = useCallback(
    (patch: Partial<CharacterCustomizationFixture['treatment']>) => {
      setSurfacePreset('custom');
      setFixture((current) => ({
        ...current,
        treatment: { ...current.treatment, ...patch },
      }));
      setVerdictJson(undefined);
    },
    []
  );
  const applyPreset = useCallback((preset: SurfacePresetName) => {
    setSurfacePreset(preset);
    setFixture((current) => ({
      ...current,
      treatment: SURFACE_PRESETS[preset],
    }));
    setVerdictJson(undefined);
  }, []);
  const handleObserved = useCallback(
    (observation: CharacterCustomizationRenderObservation) => {
      const key = observationKey(observation);
      if (observedKeys.current.has(key)) return;
      observedKeys.current.add(key);
      setObservations((current) => [...current, observation]);
    },
    []
  );

  const attached = mappedStatuses(diagnostics);
  const mappedBoneNames = Array.from(
    new Set(attached.flatMap((status) => status.mappedBoneNames))
  );
  const mappedBoneUuids = Array.from(
    new Set(attached.flatMap((status) => status.mappedBoneUuids))
  );
  const controlledRoot = attached[0]?.bodyRootBoneUuid;
  const referenceRoot = [
    diagnostics.referenceScalpStatus,
    diagnostics.referenceFacialHairStatus,
  ].find((status) => status?.code === 'attached');
  const referenceRootUuid =
    referenceRoot?.code === 'attached'
      ? referenceRoot.bodyRootBoneUuid
      : undefined;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">
          Character Customization Lab · Concept
        </h1>
        <p className="text-sm text-slate-300">
          actual shared ClassCharacterModel · fixture-backed Dwarf Fighter · no
          persistence or production route
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <main className="space-y-5">
          <section
            className="grid gap-4 rounded border p-4 md:grid-cols-2"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            <StyleSelector
              label="Scalp style"
              value={fixture.scalp}
              options={SCALP_OPTIONS}
              onChange={(scalp) => updateFixture({ scalp })}
            />
            <StyleSelector
              label="Facial hair style"
              value={fixture.facialHair}
              options={FACIAL_HAIR_OPTIONS}
              onChange={(facialHair) => updateFixture({ facialHair })}
            />

            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Shared surface color</h2>
              <HexColorPicker
                color={fixture.treatment.baseColorSrgb}
                onChange={(baseColorSrgb) =>
                  updateTreatment({
                    baseColorSrgb: baseColorSrgb.toUpperCase() as `#${string}`,
                  })
                }
              />
              <label className="block text-xs">
                Exact sRGB color
                <input
                  aria-label="Shared accessory color"
                  value={fixture.treatment.baseColorSrgb}
                  onChange={(event) => {
                    const next = event.target.value.toUpperCase();
                    if (EXACT_HEX.test(next)) {
                      updateTreatment({
                        baseColorSrgb: next as `#${string}`,
                      });
                    }
                  }}
                  className="mt-1 w-full rounded border bg-transparent px-2 py-1 font-mono"
                  style={{ borderColor: 'var(--border-primary)' }}
                />
              </label>
              <div className="flex gap-2">
                {COLOR_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.label}
                    type="button"
                    aria-label={`${swatch.label} color`}
                    onClick={() =>
                      updateTreatment({ baseColorSrgb: swatch.value })
                    }
                    className="h-8 w-8 rounded-full border"
                    style={{
                      backgroundColor: swatch.value,
                      borderColor: 'var(--border-primary)',
                    }}
                  />
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-sm font-semibold">
                Provisional PBR treatment
              </h2>
              <label className="block text-xs">
                Roughness · {fixture.treatment.roughness.toFixed(2)}
                <input
                  aria-label="Roughness"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={fixture.treatment.roughness}
                  onChange={(event) =>
                    updateTreatment({ roughness: Number(event.target.value) })
                  }
                  className="block w-full"
                />
              </label>
              <label className="block text-xs">
                Metalness · {fixture.treatment.metalness.toFixed(2)}
                <input
                  aria-label="Metalness"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={fixture.treatment.metalness}
                  onChange={(event) =>
                    updateTreatment({ metalness: Number(event.target.value) })
                  }
                  className="block w-full"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(SURFACE_PRESETS) as SurfacePresetName[]).map(
                  (preset) => (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={surfacePreset === preset}
                      onClick={() => applyPreset(preset)}
                      className="rounded border px-2 py-1 text-xs"
                      style={{
                        borderColor:
                          surfacePreset === preset
                            ? 'var(--accent-primary)'
                            : 'var(--border-primary)',
                      }}
                    >
                      {PRESET_LABELS[preset]}
                    </button>
                  )
                )}
              </div>
            </section>

            <ToggleGroup
              label="Motion"
              value={fixture.motion}
              onChange={(motion) => updateFixture({ motion })}
              options={[
                { value: 'idle', label: 'Idle' },
                { value: 'walk', label: 'Walk' },
              ]}
            />
            <ToggleGroup
              label="Evidence view"
              value={fixture.view}
              onChange={(view) => updateFixture({ view })}
              options={[
                { value: 'close', label: 'Head close-up' },
                { value: 'orbit', label: 'Full orbit' },
                { value: 'play', label: 'Tactical play' },
              ]}
            />
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Socket regression</h2>
              <button
                type="button"
                aria-pressed={fixture.showWeaponWitness}
                onClick={() =>
                  updateFixture({
                    showWeaponWitness: !fixture.showWeaponWitness,
                  })
                }
                className="rounded border px-3 py-1.5 text-sm"
                style={{ borderColor: 'var(--border-primary)' }}
              >
                Canonical weapon witness
              </button>
            </section>
          </section>

          <section
            className="rounded border p-2"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            <CharacterCustomizationPreview
              fixture={fixture}
              surfacePreset={surfacePreset}
              resolution={resolution}
              onDiagnostics={setDiagnostics}
              onRenderObserved={handleObserved}
            />
          </section>
        </main>

        <aside
          className="space-y-4 rounded border p-4 text-sm"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <div>
            <p className="text-xs font-bold tracking-wider text-amber-300">
              NON-PRODUCTION CONCEPT EVIDENCE
            </p>
            <h2 className="text-lg font-semibold">Contract inspector</h2>
          </div>
          <dl className="space-y-3 break-words">
            <div>
              <dt className="font-medium">Body URL</dt>
              <dd data-testid="body-url" className="font-mono text-xs">
                {CHARACTER_CUSTOMIZATION_BODY.url}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Body asset size</dt>
              <dd data-testid="body-size">
                {CHARACTER_CUSTOMIZATION_BODY.byteSize.toLocaleString()} bytes
              </dd>
            </div>
            <div>
              <dt className="font-medium">Body SHA-256</dt>
              <dd className="font-mono text-[0.68rem]">
                {CHARACTER_CUSTOMIZATION_BODY.sha256}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Scalp style ref</dt>
              <dd data-testid="scalp-style-ref" className="font-mono text-xs">
                {resolvedStyleRef(resolution.scalp)}
              </dd>
              <dt className="mt-1 font-medium">Scalp URL · size · hash</dt>
              <dd data-testid="scalp-url" className="font-mono text-xs">
                {resolvedUrl(resolution.scalp)}
              </dd>
              <dd className="text-xs">{resolvedSize(resolution.scalp)}</dd>
              <dd className="font-mono text-[0.68rem]">
                {resolvedHash(resolution.scalp)}
              </dd>
              <dt className="mt-1 font-medium">Scalp status</dt>
              <dd data-testid="scalp-status">
                {statusCode(resolution.scalp, diagnostics.scalpStatus)}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Facial-hair style ref</dt>
              <dd className="font-mono text-xs">
                {resolvedStyleRef(resolution.facialHair)}
              </dd>
              <dt className="mt-1 font-medium">
                Facial-hair URL · size · hash
              </dt>
              <dd className="font-mono text-xs">
                {resolvedUrl(resolution.facialHair)}
              </dd>
              <dd className="text-xs">{resolvedSize(resolution.facialHair)}</dd>
              <dd className="font-mono text-[0.68rem]">
                {resolvedHash(resolution.facialHair)}
              </dd>
              <dt className="mt-1 font-medium">Facial-hair status</dt>
              <dd data-testid="facial-hair-status">
                {statusCode(
                  resolution.facialHair,
                  diagnostics.facialHairStatus
                )}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Mapped bones</dt>
              <dd data-testid="mapped-bones">
                {mappedBoneNames.length > 0
                  ? mappedBoneNames.join(', ')
                  : 'none reported'}
              </dd>
              <dt className="mt-1 font-medium">Missing bones</dt>
              <dd data-testid="missing-bones">
                {missingBoneText(diagnostics, resolution)}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Body root-bone identity</dt>
              <dd
                data-testid="body-root-identity"
                className="font-mono text-xs"
              >
                controlled {controlledRoot ?? 'not exposed'} · reference{' '}
                {referenceRootUuid ?? 'not exposed'}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Mapped bone identities</dt>
              <dd
                data-testid="mapped-bone-identities"
                className="font-mono text-xs"
              >
                {mappedBoneUuids.length > 0
                  ? mappedBoneUuids.join(', ')
                  : 'none reported'}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Mounted accessory armatures</dt>
              <dd data-testid="armature-count">
                {diagnostics.mountedAccessoryArmatures} · counted from terminal
                bind status and mapped body-bone identities, never URL success
              </dd>
            </div>
            <div>
              <dt className="font-medium">Exact attachment status</dt>
              <dd>
                <details>
                  <summary>Attachment status JSON</summary>
                  <pre
                    data-testid="attachment-status-json"
                    className="mt-1 overflow-x-auto rounded border p-2 text-xs"
                    style={{ borderColor: 'var(--border-primary)' }}
                  >
                    {JSON.stringify(
                      {
                        controlled: {
                          scalp: diagnostics.scalpStatus,
                          facialHair: diagnostics.facialHairStatus,
                        },
                        reference: {
                          scalp: diagnostics.referenceScalpStatus,
                          facialHair: diagnostics.referenceFacialHairStatus,
                        },
                        sceneCommitted: diagnostics.sceneCommitted,
                      },
                      null,
                      2
                    )}
                  </pre>
                </details>
              </dd>
            </div>
            <div>
              <dt className="font-medium">Reference twin</dt>
              <dd>
                scalp {diagnostics.referenceScalpStatus?.code ?? 'loading'} ·
                facial{' '}
                {diagnostics.referenceFacialHairStatus?.code ?? 'loading'} ·
                isolation witness{' '}
                {diagnostics.referenceTwinIsolation ? 'positive' : 'pending'}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Animation / weapon</dt>
              <dd>
                {fixture.motion === 'walk' ? 'Walk_Forward' : 'Idle_Relaxed'} ·{' '}
                {diagnostics.weaponStatus.code}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Coverage status</dt>
              <dd data-testid="coverage-status">
                {canRecord ? 'complete' : 'not complete'} · scalp{' '}
                {coverage.scalpSelections.length}/5 · facial{' '}
                {coverage.facialHairSelections.length}/5 · motion{' '}
                {coverage.motions.length}/2 · views {coverage.views.length}/3 ·
                presets {coverage.surfacePresets.length}/4 · alternate pair{' '}
                {coverage.simultaneousNonDefaultPair ? 'yes' : 'no'} · twin{' '}
                {coverage.referenceTwinIsolation ? 'yes' : 'no'}
              </dd>
            </div>
          </dl>

          <div>
            <h3 className="font-medium">Current fixture JSON</h3>
            <pre
              data-testid="fixture-json"
              className="mt-1 overflow-x-auto rounded border p-2 text-xs"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              {JSON.stringify(fixture, null, 2)}
            </pre>
          </div>

          <button
            type="button"
            disabled={!canRecord}
            onClick={() =>
              setVerdictJson(
                JSON.stringify(
                  customizationConceptVerdict(observations),
                  null,
                  2
                )
              )
            }
            className="rounded border px-3 py-1.5 disabled:opacity-50"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            Record Concept verdict
          </button>
          {verdictJson ? (
            <pre className="overflow-x-auto rounded border p-2 text-xs">
              {verdictJson}
            </pre>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
