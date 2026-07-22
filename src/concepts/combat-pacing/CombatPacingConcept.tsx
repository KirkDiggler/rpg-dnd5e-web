/**
 * CombatPacingConcept (rpg-dnd5e-web#561) — the round-one design-review
 * bench for the attack-loop beat model (design.md). Fixture-first, same
 * method as the equipment concept (#557): real presentation components
 * (`BeatStage`) fed by typed fixtures (`fixtures.ts`), driven by the pure
 * `useBeatSequencer` state machine, plus an event/intent inspector.
 *
 * Placement is NOT pre-decided (design.md §2/§7/§8) — this page renders
 * BOTH token-anchored and center-stage placements side by side against
 * the SAME `useBeatSequencer` state for every scenario, so Kirk can
 * compare them directly instead of toggling between two separate views.
 *
 * Viewport frames EXTEND `combat-panel/CombatPanelConcept.tsx`'s FRAMES
 * pattern (floor/typical/full) with one addition: a `narrow` frame below
 * the 1024×768 floor, to prove the non-breaking fallback design.md §8
 * requires.
 *
 * `effectiveScenario` is `useMemo`'d on `[scenario, paceOverride]` — both
 * primitive-or-stable-reference deps — rather than recomputed as a fresh
 * object literal every render. Without this, selecting any NON-default
 * pace override would spread a brand-new `{ ...scenario, pace }` object
 * on every render; `useBeatSequencer`'s own `useEffect(() => {...},
 * [scenario])` would then see a "changed" argument on every re-render
 * (including ones the sequencer's OWN internal timers trigger) and reset
 * back to `cue` in a loop, so the beat would never progress past `cue`
 * whenever an override was active. `useBeatSequencer.test.tsx`'s
 * dedicated regression tests below cover this directly.
 *
 * Accessibility: this page renders two `BeatStage`s off the SAME beat
 * data (see above), and `BeatStage`'s verdict is a `role=status`/
 * `aria-live=polite` live region when `announce` is true (its default —
 * see `BeatStage.tsx`'s header). If both stages announced, a screen
 * reader would hear the same verdict twice for one moment. Only the
 * token-anchored stage announces here (`announce` omitted, defaulting to
 * true); the center-stage comparison passes `announce={false}` so its
 * verdict renders visually but carries no live-region semantics.
 * `CombatPacingConcept.test.tsx`'s dedicated announcement-composition
 * test asserts exactly one rendered verdict has `role=status`.
 */

import { useMemo, useState } from 'react';
import { BeatStage } from './BeatStage';
import type { Pace } from './fixtures';
import { SCENARIOS } from './fixtures';
import { useBeatSequencer } from './useBeatSequencer';

const FRAMES = {
  narrow: { label: '480×640 (below floor)', width: 480, height: 640 },
  floor: { label: '1024×768 (floor)', width: 1024, height: 768 },
  typical: { label: '1440×900 (typical)', width: 1440, height: 900 },
  full: { label: '1920×1080', width: 1920, height: 1080 },
} as const;
type FrameId = keyof typeof FRAMES;

type PaceOverride = 'default' | Pace;
const PACE_OVERRIDES: PaceOverride[] = [
  'default',
  'cinematic',
  'brisk',
  'instant',
];

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
  const [paceOverride, setPaceOverride] = useState<PaceOverride>('default');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [frame, setFrame] = useState<FrameId>('floor');

  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];

  // See file header — this useMemo is load-bearing, not decorative.
  const effectiveScenario = useMemo(
    () =>
      paceOverride === 'default'
        ? scenario
        : { ...scenario, pace: paceOverride },
    [scenario, paceOverride]
  );

  const seq = useBeatSequencer(effectiveScenario, { reducedMotion });

  const selectScenario = (id: string) => setScenarioId(id);

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 14 }}>
        Round-one bench for the attack-loop beat model (web#561). Both
        placements render side by side against the SAME fixture — token-
        anchored (left) promotes to center-stage on a crit/nat-1; the pure
        center-stage placement (right) never moves. Pace override and reduced
        motion apply to both. `/concepts` needs no backend.
      </p>

      <div
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}
      >
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            data-testid={`scenario-button-${s.id}`}
            style={chipStyle(s.id === scenarioId)}
            onClick={() => selectScenario(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}
      >
        {PACE_OVERRIDES.map((p) => (
          <button
            key={p}
            data-testid={`pace-override-${p}`}
            style={chipStyle(paceOverride === p)}
            onClick={() => setPaceOverride(p)}
          >
            Pace: {p}
          </button>
        ))}
        <button
          data-testid="reduced-motion-toggle"
          style={chipStyle(reducedMotion)}
          onClick={() => setReducedMotion((v) => !v)}
        >
          Reduced motion: {reducedMotion ? 'on' : 'off'}
        </button>
      </div>

      <div
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}
      >
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

      <p style={{ color: 'var(--text-muted)', marginBottom: 8, fontSize: 13 }}>
        <em>{scenario.description}</em>
      </p>

      <div
        style={{
          width: FRAMES[frame].width,
          maxWidth: '100%',
          minHeight: FRAMES[frame].height / 2,
          border: '2px solid var(--border-primary)',
          borderRadius: 8,
          padding: 16,
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
          background: 'var(--bg-primary)',
        }}
      >
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
            Token-anchored (promotes on crit/nat-1)
          </div>
          <BeatStage
            beat={seq.beat}
            placement="token-anchored"
            attack={seq.group?.attack}
            damage={seq.group?.damage}
            reducedMotion={reducedMotion}
          />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
            Pure center-stage
          </div>
          <BeatStage
            beat={seq.beat}
            placement="center-stage"
            attack={seq.group?.attack}
            damage={seq.group?.damage}
            reducedMotion={reducedMotion}
            announce={false}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {seq.beat === 'armed' && (
          <button
            data-testid="throw-die-button"
            style={chipStyle(false)}
            onClick={seq.throwDie}
          >
            🎲 Throw
          </button>
        )}
        <button
          data-testid="skip-button"
          style={chipStyle(false)}
          onClick={seq.skip}
        >
          Skip
        </button>
        <span style={{ fontSize: 12, opacity: 0.7, alignSelf: 'center' }}>
          Group {seq.groupIndex + 1} / {seq.groupCount} — beat: {seq.beat}
        </span>
      </div>

      <div
        data-testid="event-inspector"
        style={{
          marginTop: 12,
          fontFamily: 'monospace',
          fontSize: 12,
          background: 'var(--bg-secondary)',
          borderRadius: 8,
          padding: 10,
          maxHeight: 160,
          overflowY: 'auto',
        }}
      >
        <div style={{ opacity: 0.7, marginBottom: 4 }}>
          Event/intent inspector — this scenario's fixture events verbatim
        </div>
        {scenario.events.map((e) => (
          <div key={e.sequence}>
            seq {e.sequence} · corr {e.correlationId} · {e.case}
          </div>
        ))}
      </div>
    </div>
  );
}
