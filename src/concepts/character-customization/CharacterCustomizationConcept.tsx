import { useGLTF } from '@react-three/drei';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { preloadCharacterCustomizationAccessories } from './characterCustomizationAssets';
import { CharacterCustomizationControls } from './CharacterCustomizationControls';
import {
  EMPTY_CUSTOMIZATION_DIAGNOSTICS,
  type CharacterCustomizationDiagnostics,
} from './characterCustomizationDiagnostics';
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
  type StyleSelection,
  type SurfacePresetName,
} from './characterCustomizationExperiment';
import { CharacterCustomizationInspector } from './CharacterCustomizationInspector';
import { CharacterCustomizationPreview } from './CharacterCustomizationPreview';

function readStyleParam(name: string): StyleSelection {
  if (typeof window === 'undefined') return 'default';
  return new URLSearchParams(window.location.search).get(name) ?? 'default';
}

function observationKey(
  observation: CharacterCustomizationRenderObservation
): string {
  return JSON.stringify(observation);
}

export function CharacterCustomizationConcept() {
  const [fixture, setFixture] = useState<CharacterCustomizationFixture>(() => ({
    ...DEFAULT_CUSTOMIZATION_FIXTURE,
    scalp: readStyleParam('scalp'),
    facialHair: readStyleParam('facialHair'),
  }));
  const [surfacePreset, setSurfacePreset] =
    useState<ActiveSurfacePreset>('hair');
  const [diagnostics, setDiagnostics] =
    useState<CharacterCustomizationDiagnostics>(
      EMPTY_CUSTOMIZATION_DIAGNOSTICS
    );
  const [observations, setObservations] = useState<
    CharacterCustomizationRenderObservation[]
  >([]);
  const [verdictJson, setVerdictJson] = useState<string>();
  const observedKeys = useRef(new Set<string>());

  useEffect(() => {
    preloadCharacterCustomizationAccessories(useGLTF.preload);
  }, []);

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
  const recordVerdict = useCallback(() => {
    setVerdictJson(
      JSON.stringify(customizationConceptVerdict(observations), null, 2)
    );
  }, [observations]);

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

      <div
        data-testid="character-customization-workspace"
        className="grid gap-6 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] lg:items-start 2xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)_minmax(20rem,25rem)]"
      >
        <div
          data-testid="character-customization-controls-pane"
          className="lg:sticky lg:top-4 lg:max-h-[560px] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
        >
          <CharacterCustomizationControls
            fixture={fixture}
            surfacePreset={surfacePreset}
            onFixtureChange={updateFixture}
            onTreatmentChange={updateTreatment}
            onPreset={applyPreset}
          />
        </div>

        <section
          data-testid="character-customization-preview-pane"
          className="rounded border p-2 lg:sticky lg:top-4 lg:self-start"
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

        <div
          data-testid="character-customization-inspector-pane"
          className="lg:sticky lg:top-4 lg:col-span-2 lg:max-h-[560px] lg:self-start lg:overflow-y-auto lg:overscroll-contain 2xl:sticky 2xl:col-span-1"
        >
          <CharacterCustomizationInspector
            fixture={fixture}
            surfacePreset={surfacePreset}
            resolution={resolution}
            storedDiagnostics={diagnostics}
            coverage={coverage}
            canRecord={canRecord}
            verdictJson={verdictJson}
            onRecord={recordVerdict}
          />
        </div>
      </div>
    </div>
  );
}
