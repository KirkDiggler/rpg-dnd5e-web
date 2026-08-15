import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import type {
  AttackDie3DProps,
  AttackDieRendererInfo,
  AttackDieTelemetry,
} from '../../components/ui/dice/AttackDie3D';
import type { DicePresentationEvent } from '../../components/ui/dice/dicePresentationEvent';
import {
  DiceTrayPresentation,
  type DiceTrayPresentationBoundaryDiagnostic,
} from '../../components/ui/dice/DiceTrayPresentation';
import { DiceTrayEncounterPreview } from './DiceTrayEncounterPreview';
import {
  appendDiceTrayWitnessEvent,
  createDiceTrayWitnessInitialEvents,
  scheduleMonsterDiceTrayWitnessRelease,
  type DiceTrayWitnessMode,
} from './diceTrayWitnessFixture';

type DiceTrayEvidenceExercise =
  | 'original'
  | 'unknown-safe-preset'
  | 'unmapped-result'
  | 'shader-failure';

interface Stone0TrayEvidenceBridge {
  requestIdentity: string;
  presetId: string;
  result: number;
  mode: DiceTrayWitnessMode;
  eventCount: number;
  witnesses: {
    roller: {
      boundary?: {
        eventArrayId: number;
        providerId: number;
        eventCount: number;
        eventsFrozen: boolean;
        providerFrozen: boolean;
      };
      telemetry?: AttackDieTelemetry;
      rendererInfo?: AttackDieRendererInfo;
    };
    spectator: {
      boundary?: {
        eventArrayId: number;
        providerId: number;
        eventCount: number;
        eventsFrozen: boolean;
        providerFrozen: boolean;
      };
      telemetry?: AttackDieTelemetry;
      rendererInfo?: AttackDieRendererInfo;
    };
  };
}

declare global {
  interface Window {
    __stone0TrayEvidence?: Stone0TrayEvidenceBridge;
  }
}

const evidenceObjectIds = new WeakMap<object, number>();
let nextEvidenceObjectId = 1;
function evidenceObjectId(value: object) {
  const existing = evidenceObjectIds.get(value);
  if (existing !== undefined) return existing;
  const identity = nextEvidenceObjectId++;
  evidenceObjectIds.set(value, identity);
  return identity;
}

interface DiceTray3DConceptPanelProps {
  token: number;
  reducedMotion: boolean;
  sceneOverride?: AttackDie3DProps['sceneOverride'];
  sidecarOverride?: AttackDie3DProps['sidecarOverride'];
}

export function DiceTray3DConceptPanel(props: DiceTray3DConceptPanelProps) {
  return <TokenDiceTray3DConceptPanel key={props.token} {...props} />;
}

function TokenDiceTray3DConceptPanel({
  token,
  reducedMotion,
}: DiceTray3DConceptPanelProps) {
  const [mode, setMode] = useState<DiceTrayWitnessMode>('player');
  const [result, setResult] = useState(10);
  const [exercise, setExercise] =
    useState<DiceTrayEvidenceExercise>('original');

  return (
    <section className="dice-tray-3d-concept-panel">
      <header>
        <h3>Gameplay placement checkpoint</h3>
        <p>
          Fixture event delivery · shared component contract · no production
          transport
        </p>
        <label>
          Authoritative fixture result{' '}
          <input
            aria-label="Authoritative fixture result"
            type="number"
            min={1}
            max={20}
            value={result}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isInteger(next) && next >= 1 && next <= 20)
                setResult(next);
            }}
          />
        </label>
        <label>
          Evidence-only renderer exercise{' '}
          <select
            aria-label="Evidence-only renderer exercise"
            value={exercise}
            onChange={(event) =>
              setExercise(event.target.value as DiceTrayEvidenceExercise)
            }
          >
            <option value="original">Original provider</option>
            <option value="unknown-safe-preset">Unknown safe preset</option>
            <option value="unmapped-result">Synthetic unmapped result</option>
            <option value="shader-failure">Shader failure</option>
          </select>
        </label>
        <fieldset
          className="dice-tray-3d-concept-panel__modes"
          aria-label="Dice witness roller mode"
        >
          <legend>Roller mode</legend>
          {(['player', 'monster'] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="dice-tray-witness-mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {value === 'player' ? 'Player' : 'Monster'}
            </label>
          ))}
        </fieldset>
      </header>
      <DiceTrayWitnessDeliveryHost
        key={`${token}:${mode}:${result}:${exercise}`}
        token={token}
        mode={mode}
        result={result}
        exercise={exercise}
        reducedMotion={reducedMotion}
      />
    </section>
  );
}

interface DiceTrayWitnessDeliveryHostProps extends DiceTray3DConceptPanelProps {
  mode: DiceTrayWitnessMode;
  result: number;
  exercise: DiceTrayEvidenceExercise;
}

function DiceTrayWitnessDeliveryHost({
  token,
  mode,
  result,
  exercise,
  reducedMotion,
}: DiceTrayWitnessDeliveryHostProps) {
  const presetId =
    exercise === 'unknown-safe-preset'
      ? 'stone0.unknown.safe.d20'
      : 'dice.original.carved.d20';
  const forceFailure =
    exercise === 'unmapped-result'
      ? ('unmapped' as const)
      : exercise === 'shader-failure'
        ? ('shader' as const)
        : undefined;
  const [events, append] = useReducer(
    (
      current: readonly DicePresentationEvent[],
      input: unknown
    ): readonly DicePresentationEvent[] =>
      appendDiceTrayWitnessEvent(current, input),
    createDiceTrayWitnessInitialEvents(token, mode, result, presetId)
  );

  useEffect(() => {
    if (mode !== 'monster') return;
    return scheduleMonsterDiceTrayWitnessRelease(
      token,
      result,
      append,
      presetId
    );
  }, [append, mode, presetId, result, token]);

  const requestIdentity = events[0]?.presentationId ?? 'unavailable';
  const bridgeRef = useRef<Stone0TrayEvidenceBridge | undefined>(undefined);
  if (
    !bridgeRef.current ||
    bridgeRef.current.requestIdentity !== requestIdentity ||
    bridgeRef.current.presetId !== presetId
  )
    bridgeRef.current = {
      requestIdentity,
      presetId,
      result,
      mode,
      eventCount: events.length,
      witnesses: { roller: {}, spectator: {} },
    };
  const bridge = bridgeRef.current;
  bridge.eventCount = events.length;

  useLayoutEffect(() => {
    window.__stone0TrayEvidence = bridge;
    return () => {
      if (window.__stone0TrayEvidence === bridge)
        delete window.__stone0TrayEvidence;
    };
  }, [bridge]);

  const publishBoundaryDiagnostic = useCallback(
    (
      witness: 'roller' | 'spectator',
      diagnostic: DiceTrayPresentationBoundaryDiagnostic
    ) => {
      if (window.__stone0TrayEvidence !== bridge) return;
      bridge.witnesses[witness].boundary = {
        eventArrayId: evidenceObjectId(diagnostic.events),
        providerId: evidenceObjectId(diagnostic.provider),
        eventCount: diagnostic.events.length,
        eventsFrozen: Object.isFrozen(diagnostic.events),
        providerFrozen: Object.isFrozen(diagnostic.provider),
      };
      window.__stone0TrayEvidence = bridge;
    },
    [bridge]
  );
  const publishTelemetry = useCallback(
    (witness: 'roller' | 'spectator', telemetry: AttackDieTelemetry) => {
      if (window.__stone0TrayEvidence !== bridge) return;
      bridge.witnesses[witness].telemetry = telemetry;
      window.__stone0TrayEvidence = bridge;
    },
    [bridge]
  );
  const publishRendererInfo = useCallback(
    (witness: 'roller' | 'spectator', rendererInfo: AttackDieRendererInfo) => {
      if (window.__stone0TrayEvidence !== bridge) return;
      bridge.witnesses[witness].rendererInfo = rendererInfo;
      window.__stone0TrayEvidence = bridge;
    },
    [bridge]
  );
  const publishRollerBoundaryDiagnostic = useCallback(
    (diagnostic: DiceTrayPresentationBoundaryDiagnostic) =>
      publishBoundaryDiagnostic('roller', diagnostic),
    [publishBoundaryDiagnostic]
  );
  const publishSpectatorBoundaryDiagnostic = useCallback(
    (diagnostic: DiceTrayPresentationBoundaryDiagnostic) =>
      publishBoundaryDiagnostic('spectator', diagnostic),
    [publishBoundaryDiagnostic]
  );
  const publishRollerTelemetry = useCallback(
    (telemetry: AttackDieTelemetry) => publishTelemetry('roller', telemetry),
    [publishTelemetry]
  );
  const publishSpectatorTelemetry = useCallback(
    (telemetry: AttackDieTelemetry) => publishTelemetry('spectator', telemetry),
    [publishTelemetry]
  );
  const publishRollerRendererInfo = useCallback(
    (rendererInfo: AttackDieRendererInfo) =>
      publishRendererInfo('roller', rendererInfo),
    [publishRendererInfo]
  );
  const publishSpectatorRendererInfo = useCallback(
    (rendererInfo: AttackDieRendererInfo) =>
      publishRendererInfo('spectator', rendererInfo),
    [publishRendererInfo]
  );

  return (
    <DiceTrayEncounterPreview
      trays={[
        {
          label: 'Roller',
          content: (
            <DiceTrayPresentation
              label="Roller attack dice"
              events={events}
              witnessRole="roller"
              onReleaseRequest={mode === 'player' ? append : undefined}
              onTelemetry={publishRollerTelemetry}
              onRendererInfo={publishRollerRendererInfo}
              onBoundaryDiagnostic={publishRollerBoundaryDiagnostic}
              reducedMotion={reducedMotion}
              forceFailure={forceFailure}
            />
          ),
        },
        {
          label: 'Spectator',
          content: (
            <DiceTrayPresentation
              label="Spectator attack dice"
              events={events}
              witnessRole="spectator"
              onTelemetry={publishSpectatorTelemetry}
              onRendererInfo={publishSpectatorRendererInfo}
              onBoundaryDiagnostic={publishSpectatorBoundaryDiagnostic}
              reducedMotion={reducedMotion}
              forceFailure={forceFailure}
            />
          ),
        },
      ]}
    />
  );
}
