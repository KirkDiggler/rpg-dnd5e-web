import { useMemo, useState } from 'react';
import {
  DiceTray,
  type DiceMotion,
  type DiceTrayOutcome,
  type DiceTrayPhase,
} from '../../components/ui/dice/DiceTray';
import { BeatStage } from './BeatStage';
import { verdictLabel, type VerdictLabel } from './beatStageTypes';
import { groupByCorrelation, SCENARIOS, type Pace } from './fixtures';
import { useBeatSequencer } from './useBeatSequencer';

const FRAMES = {
  narrow: { label: '480x640 (below floor)', width: 480, height: 640 },
  floor: { label: '1024x768 (floor)', width: 1024, height: 768 },
  typical: { label: '1440x900 (typical)', width: 1440, height: 900 },
  full: { label: '1920x1080', width: 1920, height: 1080 },
} as const;
type FrameId = keyof typeof FRAMES;
const PACE_OVERRIDES: Array<'default' | Pace> = [
  'default',
  'cinematic',
  'brisk',
  'instant',
];
const DEFAULT_MOTION: Required<DiceMotion> = {
  faceCount: 8,
  initialCadenceMs: 60,
  decelerationMs: 100,
  nearSettleHoldMs: 520,
  rolloverMs: 260,
};
const DEFAULT_IMPACT_SCALE = 1;
const DEFAULT_SHAKE_STRENGTH = 1;
const DEFAULT_SHAKE_DURATION_MS = 300;
const DEFAULT_COLOR_STRENGTH = 1;
const DEFAULT_CRIT_SHAKE_MULTIPLIER = 1.5;

function trayPhase(
  beat: string,
  groupIndex: number,
  instant: boolean
): DiceTrayPhase {
  if (instant) return 'settled';
  if (beat === 'cue') return groupIndex === 0 ? 'entering' : 'ready';
  if (beat === 'armed') return 'ready';
  if (beat === 'throw') return 'rolling';
  if (beat === 'done') return 'exiting';
  if (beat === 'idle') return 'ready';
  return 'settled';
}

function presentationOutcome(
  outcome: VerdictLabel,
  beat: string,
  instant: boolean
): VerdictLabel {
  return instant || ['verdict', 'impact', 'release'].includes(beat)
    ? outcome
    : '';
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
    background: active ? 'var(--accent-primary)' : 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
  };
}

export function CombatPacingConcept() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [paceOverride, setPaceOverride] = useState<'default' | Pace>('default');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [frame, setFrame] = useState<FrameId>('floor');
  const [replay, setReplay] = useState(0);
  const [motion, setMotion] = useState<DiceMotion>(DEFAULT_MOTION);
  const [impactScale, setImpactScale] = useState(DEFAULT_IMPACT_SCALE);
  const [shakeStrength, setShakeStrength] = useState(DEFAULT_SHAKE_STRENGTH);
  const [shakeDurationMs, setShakeDurationMs] = useState(
    DEFAULT_SHAKE_DURATION_MS
  );
  const [colorStrength, setColorStrength] = useState(DEFAULT_COLOR_STRENGTH);
  const [critShakeMultiplier, setCritShakeMultiplier] = useState(
    DEFAULT_CRIT_SHAKE_MULTIPLIER
  );
  const scenario =
    SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[0];
  const effectiveScenario = useMemo(
    () => ({
      ...scenario,
      pace: paceOverride === 'default' ? scenario.pace : paceOverride,
      replay,
    }),
    [paceOverride, replay, scenario]
  );
  const seq = useBeatSequencer(effectiveScenario, { reducedMotion });
  const group = seq.group;
  const label = verdictLabel(group?.attack);
  const impactTier = group
    ? effectiveScenario.presentationByCorrelation?.[group.correlationId]
        ?.impactTier
    : undefined;
  const isInstant = effectiveScenario.pace === 'instant';
  const visibleOutcome: DiceTrayOutcome = presentationOutcome(
    label,
    seq.beat,
    isInstant
  );
  const released = groupByCorrelation(effectiveScenario.events).slice(
    0,
    seq.releasedGroupCount
  );

  return (
    <div
      className="combat-pacing-concept"
      style={
        {
          '--concept-impact-scale': impactScale,
          '--concept-shake-strength': shakeStrength,
          '--concept-shake-duration': `${shakeDurationMs}ms`,
          '--concept-color-strength': colorStrength,
          '--concept-crit-shake-multiplier': critShakeMultiplier,
        } as React.CSSProperties
      }
    >
      <p>
        Fixture-first combat theater. Results are authoritative fixture events;
        only the preview narrative waits for Release.
      </p>
      <div className="concept-control-row">
        {SCENARIOS.map((item) => (
          <button
            key={item.id}
            data-testid={`scenario-button-${item.id}`}
            style={chipStyle(item.id === scenarioId)}
            onClick={() => setScenarioId(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="concept-control-row concept-control-row--spaced">
        {PACE_OVERRIDES.map((pace) => (
          <button
            key={pace}
            data-testid={`pace-override-${pace}`}
            style={chipStyle(paceOverride === pace)}
            onClick={() => setPaceOverride(pace)}
          >
            Pace: {pace}
          </button>
        ))}
        <button
          data-testid="reduced-motion-toggle"
          style={chipStyle(reducedMotion)}
          onClick={() => setReducedMotion((value) => !value)}
        >
          Reduced motion: {reducedMotion ? 'on' : 'off'}
        </button>
        <button
          className="concept-action-button"
          onClick={() => setReplay((value) => value + 1)}
        >
          Replay
        </button>
        <button
          className="concept-action-button"
          onClick={() => {
            setMotion(DEFAULT_MOTION);
            setImpactScale(DEFAULT_IMPACT_SCALE);
            setShakeStrength(DEFAULT_SHAKE_STRENGTH);
            setShakeDurationMs(DEFAULT_SHAKE_DURATION_MS);
            setColorStrength(DEFAULT_COLOR_STRENGTH);
            setCritShakeMultiplier(DEFAULT_CRIT_SHAKE_MULTIPLIER);
          }}
        >
          Reset defaults
        </button>
      </div>
      <div className="concept-control-row concept-control-row--frame">
        {(Object.keys(FRAMES) as FrameId[]).map((id) => (
          <button
            key={id}
            data-testid={`frame-button-${id}`}
            style={chipStyle(frame === id)}
            onClick={() => setFrame(id)}
          >
            {FRAMES[id].label}
          </button>
        ))}
      </div>
      <div className="concept-dials">
        <label className="concept-dials__control">
          Face count{' '}
          <span data-testid="dial-value-face-count">{motion.faceCount}</span>
          <input
            aria-label="Face count"
            type="range"
            min="1"
            max="8"
            value={motion.faceCount}
            onChange={(event) =>
              setMotion({ ...motion, faceCount: Number(event.target.value) })
            }
          />
        </label>
        <label className="concept-dials__control">
          Initial cadence{' '}
          <span data-testid="dial-value-initial-cadence">
            {motion.initialCadenceMs}ms
          </span>
          <input
            aria-label="Initial cadence"
            type="range"
            min="40"
            max="300"
            step="10"
            value={motion.initialCadenceMs}
            onChange={(event) =>
              setMotion({
                ...motion,
                initialCadenceMs: Number(event.target.value),
              })
            }
          />
        </label>
        <label className="concept-dials__control">
          Deceleration{' '}
          <span data-testid="dial-value-deceleration">
            {motion.decelerationMs}ms
          </span>
          <input
            aria-label="Deceleration"
            type="range"
            min="0"
            max="250"
            step="10"
            value={motion.decelerationMs}
            onChange={(event) =>
              setMotion({
                ...motion,
                decelerationMs: Number(event.target.value),
              })
            }
          />
        </label>
        <label className="concept-dials__control">
          Near-settle hold{' '}
          <span data-testid="dial-value-near-settle-hold">
            {motion.nearSettleHoldMs}ms
          </span>
          <input
            aria-label="Near-settle hold"
            type="range"
            min="0"
            max="800"
            step="20"
            value={motion.nearSettleHoldMs}
            onChange={(event) =>
              setMotion({
                ...motion,
                nearSettleHoldMs: Number(event.target.value),
              })
            }
          />
        </label>
        <label className="concept-dials__control">
          Rollover{' '}
          <span data-testid="dial-value-rollover">{motion.rolloverMs}ms</span>
          <input
            aria-label="Rollover"
            type="range"
            min="0"
            max="500"
            step="20"
            value={motion.rolloverMs}
            onChange={(event) =>
              setMotion({ ...motion, rolloverMs: Number(event.target.value) })
            }
          />
        </label>
        <label className="concept-dials__control">
          Impact scale{' '}
          <span data-testid="dial-value-impact-scale">{impactScale}x</span>
          <input
            aria-label="Impact scale"
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={impactScale}
            onChange={(event) => setImpactScale(Number(event.target.value))}
          />
        </label>
        <label className="concept-dials__control">
          Shake strength{' '}
          <span data-testid="dial-value-shake-strength">{shakeStrength}x</span>
          <input
            aria-label="Shake strength"
            type="range"
            min="0"
            max="3"
            step="0.1"
            value={shakeStrength}
            onChange={(event) => setShakeStrength(Number(event.target.value))}
          />
        </label>
        <label className="concept-dials__control">
          Shake duration{' '}
          <span data-testid="dial-value-shake-duration">
            {shakeDurationMs}ms
          </span>
          <input
            aria-label="Shake duration"
            type="range"
            min="0"
            max="1000"
            step="50"
            value={shakeDurationMs}
            onChange={(event) => setShakeDurationMs(Number(event.target.value))}
          />
        </label>
        <label className="concept-dials__control">
          Color strength{' '}
          <span data-testid="dial-value-color-strength">{colorStrength}x</span>
          <input
            aria-label="Color strength"
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={colorStrength}
            onChange={(event) => setColorStrength(Number(event.target.value))}
          />
        </label>
        <label className="concept-dials__control">
          Crit shake multiplier{' '}
          <span data-testid="dial-value-crit-shake-multiplier">
            {critShakeMultiplier}x
          </span>
          <input
            aria-label="Crit shake multiplier"
            type="range"
            min="1"
            max="3"
            step="0.1"
            value={critShakeMultiplier}
            onChange={(event) =>
              setCritShakeMultiplier(Number(event.target.value))
            }
          />
        </label>
      </div>
      <div
        data-testid="concept-review-surface"
        className="concept-review-surface"
        style={{
          width: FRAMES[frame].width,
          maxWidth: '100%',
          minHeight: FRAMES[frame].height / 2,
          border: '2px solid var(--border-primary)',
          borderRadius: 8,
          padding: 16,
          background: 'var(--bg-primary)',
        }}
      >
        <DiceTray
          phase={trayPhase(seq.beat, seq.groupIndex, isInstant)}
          finalFace={group?.attack?.attackRoll ?? 20}
          outcome={visibleOutcome}
          reducedMotion={reducedMotion}
          motion={motion}
        >
          <BeatStage
            beat={seq.beat}
            placement={
              visibleOutcome === 'CRIT' || visibleOutcome === 'NAT-1'
                ? 'center-stage'
                : 'token-anchored'
            }
            presentationOutcome={visibleOutcome}
            attack={group?.attack}
            reducedMotion={reducedMotion}
            persistResult={isInstant}
            impactTier={impactTier}
          />
        </DiceTray>
      </div>
      <div className="concept-playback-controls">
        {seq.beat === 'armed' && (
          <button data-testid="throw-die-button" onClick={seq.throwDie}>
            Roll d20
          </button>
        )}
        <button data-testid="skip-button" onClick={seq.skip}>
          Skip
        </button>
        <span>
          Group {seq.groupIndex + 1} / {seq.groupCount} - beat: {seq.beat}
        </span>
      </div>
      {released.length > 0 && (
        <div
          data-testid="concept-log-preview"
          className="concept-narrative-preview"
        >
          {released.map((item) => (
            <div key={item.correlationId}>
              {item.correlationId}:{' '}
              {item.attack ? verdictLabel(item.attack) : 'resolved'}
            </div>
          ))}
        </div>
      )}
      <div data-testid="event-inspector" className="concept-event-inspector">
        Event/intent inspector - fixture events received immediately
        {scenario.events.map((event) => (
          <div key={event.sequence}>
            seq {event.sequence} - corr {event.correlationId} - {event.case}
          </div>
        ))}
      </div>
    </div>
  );
}
