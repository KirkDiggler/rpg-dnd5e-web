import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { AssetAnchorLabPreview } from './AssetAnchorLabPreview';
import {
  ADJUST_LIMIT_METERS,
  ADJUST_STEP_METERS,
  ANCHOR_LAB_CASES,
  assetAnchorLabReducer,
  candidateOffset,
  canRecordProvisional,
  createInitialAssetAnchorLabState,
  FACING_LABELS,
  facingProgress,
  FIXTURE_VISIBLE_BOUNDS,
  fixtureBoundsKey,
  LAB_CASE_IDS,
  OWNING_HEX,
  resolveAssetAnchorUrl,
  resolvedCalibrationOffset,
  type AnchorCandidate,
  type FacingIndex,
  type LabCameraMode,
  type VisibleBounds,
} from './assetAnchorExperiment';

const panelStyle = {
  border: '1px solid #304c4a',
  borderRadius: 6,
  background: '#10191a',
  padding: 9,
} as const;
const buttonStyle = {
  border: '1px solid #42615e',
  borderRadius: 4,
  color: '#d9efeb',
  background: '#172526',
  padding: '6px 8px',
  fontSize: 11,
  cursor: 'pointer',
} as const;

function meters(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}m`;
}

function vector(values: readonly number[]): string {
  return `(${values.map(meters).join(', ')})`;
}

function BoundsReadout({ bounds }: { bounds: VisibleBounds }) {
  return (
    <div
      data-testid="bounds-readout"
      style={{ fontFamily: 'monospace', fontSize: 10 }}
    >
      <div>min {vector(bounds.min)}</div>
      <div>max {vector(bounds.max)}</div>
      <div>size {vector(bounds.size)}</div>
      <div>center {vector(bounds.center)}</div>
    </div>
  );
}

const CANDIDATE_LABELS: Record<AnchorCandidate, string> = {
  'raw-origin': 'Raw origin (no correction)',
  'bounds-center-floor': 'Visible bounds center + floor',
  'wall-face': 'Measured back face + wall reference',
};

export function AssetAnchorLabConcept() {
  const [state, dispatch] = useReducer(
    assetAnchorLabReducer,
    undefined,
    createInitialAssetAnchorLabState
  );
  const item = ANCHOR_LAB_CASES[state.caseId];
  const url = resolveAssetAnchorUrl(state.caseId, state.variant);
  const fallbackBounds =
    FIXTURE_VISIBLE_BOUNDS[fixtureBoundsKey(state.caseId, state.variant)]!;
  const [measured, setMeasured] = useState<{
    url: string;
    bounds: VisibleBounds;
  }>({ url, bounds: fallbackBounds });
  useEffect(
    () => setMeasured({ url, bounds: fallbackBounds }),
    [url, fallbackBounds]
  );
  const bounds = measured.url === url ? measured.bounds : fallbackBounds;
  const handleBounds = useCallback(
    (next: VisibleBounds) => setMeasured({ url, bounds: next }),
    [url]
  );
  const rawCandidateOffset = useMemo(
    () => candidateOffset(state.caseId, state.candidate, bounds),
    [bounds, state.candidate, state.caseId]
  );
  const calibratedOffset = useMemo(
    () => resolvedCalibrationOffset(state, bounds),
    [bounds, state]
  );
  const recordReady = canRecordProvisional(state);
  const recorded = state.recorded[state.caseId];

  return (
    <section
      aria-label="Asset Anchor Lab"
      style={{
        height: '78vh',
        minHeight: 650,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid #36514e',
        borderRadius: 8,
        background: '#071011',
      }}
    >
      <header
        style={{
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid #304c4a',
          background: '#0c1718',
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, color: '#65f1df', fontSize: 17 }}>
            Asset Anchor Lab · Learn fixture
          </h2>
          <div style={{ color: '#9eb5b1', fontSize: 10.5 }}>
            actual synced GLBs · shared 0.75 scale / canonical facings /
            tactical camera · no writer
          </div>
        </div>
        <div
          data-testid="owning-hex"
          style={{
            marginLeft: 'auto',
            color: '#ffdf54',
            font: '11px monospace',
          }}
        >
          owning hex q{OWNING_HEX.q},r{OWNING_HEX.r},s{OWNING_HEX.s} · unchanged
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <AssetAnchorLabPreview
            key={url}
            url={url}
            state={state}
            fallbackBounds={fallbackBounds}
            onBoundsMeasured={handleBounds}
          />
        </div>

        <aside
          style={{
            width: 390,
            overflowY: 'auto',
            borderLeft: '1px solid #304c4a',
            padding: 9,
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
            color: '#d9efeb',
            background: '#091314',
          }}
        >
          <div style={panelStyle}>
            <div style={{ color: '#72bdb4', fontSize: 10 }}>
              ACTUAL RESOLVED CASE
            </div>
            <div
              style={{
                display: 'flex',
                gap: 4,
                marginTop: 5,
                flexWrap: 'wrap',
              }}
            >
              {LAB_CASE_IDS.map((caseId) => (
                <button
                  key={caseId}
                  style={{
                    ...buttonStyle,
                    background:
                      state.caseId === caseId
                        ? '#27554f'
                        : buttonStyle.background,
                  }}
                  onClick={() => dispatch({ type: 'select-case', caseId })}
                >
                  {ANCHOR_LAB_CASES[caseId].label}
                </button>
              ))}
            </div>
            <div
              data-testid="asset-runtime-proof"
              style={{
                marginTop: 6,
                font: '10px monospace',
                color: '#9ee8df',
                wordBreak: 'break-all',
              }}
            >
              {item.source} → {url}
            </div>
          </div>

          {item.variants.length > 1 && (
            <div style={panelStyle}>
              <div style={{ color: '#72bdb4', fontSize: 10 }}>
                ONE ENTITY / ONE HEX · VARIANT
              </div>
              <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                {item.variants.map((variant) => (
                  <button
                    key={variant}
                    style={{
                      ...buttonStyle,
                      flex: 1,
                      background:
                        state.variant === variant
                          ? '#59335b'
                          : buttonStyle.background,
                    }}
                    onClick={() =>
                      dispatch({ type: 'select-variant', variant })
                    }
                  >
                    {variant}
                  </button>
                ))}
              </div>
              <small style={{ color: '#9eb5b1' }}>
                Toggle changes only the resolved GLB and measured geometry;
                q0,r0,s0 is retained.
              </small>
            </div>
          )}

          <div style={panelStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#72bdb4', fontSize: 10 }}>
                SIX CANONICAL FACINGS
              </span>
              <span
                data-testid="facing-progress"
                style={{ color: '#ffdf54', fontSize: 10 }}
              >
                observed {facingProgress(state)}
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: 3,
                marginTop: 5,
              }}
            >
              {FACING_LABELS.map((label, facing) => (
                <button
                  key={label}
                  aria-label={`Facing ${label}`}
                  style={{
                    ...buttonStyle,
                    padding: '5px 2px',
                    background:
                      state.facing === facing
                        ? '#66521b'
                        : buttonStyle.background,
                  }}
                  onClick={() =>
                    dispatch({
                      type: 'select-facing',
                      facing: facing as FacingIndex,
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 4, fontSize: 10, color: '#9eb5b1' }}>
              Facing {FACING_LABELS[state.facing]} uses the shared author/game
              rotation conversion. Gold arrow is the lab's local +Z forward
              probe.
            </div>
          </div>

          <div style={panelStyle}>
            <div style={{ color: '#72bdb4', fontSize: 10 }}>
              CANDIDATE ANCHOR · FIXTURE SEMANTICS ONLY
            </div>
            <div style={{ display: 'grid', gap: 4, marginTop: 5 }}>
              {item.candidates.map((candidate) => (
                <button
                  key={candidate}
                  style={{
                    ...buttonStyle,
                    textAlign: 'left',
                    background:
                      state.candidate === candidate
                        ? '#214a57'
                        : buttonStyle.background,
                  }}
                  onClick={() =>
                    dispatch({ type: 'select-candidate', candidate })
                  }
                >
                  {CANDIDATE_LABELS[candidate]}
                </button>
              ))}
            </div>
            <div
              data-testid="candidate-offset"
              style={{ marginTop: 5, font: '10px monospace' }}
            >
              measured candidate {vector(rawCandidateOffset)}
            </div>
          </div>

          <div style={panelStyle}>
            <div style={{ color: '#72bdb4', fontSize: 10 }}>
              BOUNDED LOCAL ADJUSTMENT · ±{ADJUST_LIMIT_METERS.toFixed(2)}m ·{' '}
              {ADJUST_STEP_METERS.toFixed(2)}m step
            </div>
            {(['X tangent', 'Y up', 'Z wall-normal'] as const).map(
              (axisLabel, axis) => (
                <div
                  key={axisLabel}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 42px 42px',
                    gap: 4,
                    alignItems: 'center',
                    marginTop: 4,
                  }}
                >
                  <span style={{ fontSize: 10.5 }}>
                    {axisLabel}: {meters(state.adjustment[axis]!)}
                  </span>
                  <button
                    aria-label={`Decrease ${axisLabel}`}
                    style={buttonStyle}
                    onClick={() =>
                      dispatch({
                        type: 'adjust',
                        axis: axis as 0 | 1 | 2,
                        delta: -ADJUST_STEP_METERS,
                      })
                    }
                  >
                    −
                  </button>
                  <button
                    aria-label={`Increase ${axisLabel}`}
                    style={buttonStyle}
                    onClick={() =>
                      dispatch({
                        type: 'adjust',
                        axis: axis as 0 | 1 | 2,
                        delta: ADJUST_STEP_METERS,
                      })
                    }
                  >
                    +
                  </button>
                </div>
              )
            )}
            <button
              style={{ ...buttonStyle, marginTop: 5, width: '100%' }}
              onClick={() => dispatch({ type: 'reset-adjustment' })}
            >
              Reset to selected candidate
            </button>
            <div
              data-testid="calibrated-offset"
              style={{ marginTop: 5, font: '10px monospace', color: '#39e7ff' }}
            >
              calibrated {vector(calibratedOffset)}
            </div>
          </div>

          <div style={panelStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: '#72bdb4', fontSize: 10 }}>
                CAMERA VERDICT
              </span>
              {(['orbit', 'play'] as LabCameraMode[]).map((mode) => (
                <button
                  key={mode}
                  style={{
                    ...buttonStyle,
                    background:
                      state.cameraMode === mode
                        ? '#36533b'
                        : buttonStyle.background,
                  }}
                  onClick={() => dispatch({ type: 'select-camera', mode })}
                >
                  {mode === 'play' ? 'Play · tactical' : 'Orbit · inspect'}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: '#9eb5b1', marginTop: 4 }}>
              Both views consume the same raw and calibrated transforms. Play
              uses the shared tactical rig constants.
            </div>
          </div>

          <div style={panelStyle}>
            <div style={{ color: '#72bdb4', fontSize: 10 }}>
              MEASURED VISIBLE BOUNDS · SHARED SCALE
            </div>
            <BoundsReadout bounds={bounds} />
            <div style={{ marginTop: 4, color: '#ffdf54', fontSize: 10 }}>
              Raw origin remains gold at (0,0,0); magenta raw result is never
              hidden.
            </div>
          </div>

          <div
            style={{
              ...panelStyle,
              borderColor: recordReady ? '#56b881' : '#5f4931',
            }}
          >
            <div style={{ color: '#72bdb4', fontSize: 10 }}>
              PROVISIONAL FIXTURE OUTPUT GATE
            </div>
            <div style={{ fontSize: 10, color: '#b9aaa0', margin: '4px 0' }}>
              Explicitly choose a candidate, view Orbit + Play, and inspect all
              six facings
              {item.variants.length > 1 ? ' for both standing and downed' : ''}.
              Nothing here writes production state.
            </div>
            <button
              disabled={!recordReady}
              style={{
                ...buttonStyle,
                width: '100%',
                opacity: recordReady ? 1 : 0.45,
              }}
              onClick={() => dispatch({ type: 'record-provisional' })}
            >
              Record non-production candidate
            </button>
            {!recorded ? (
              <div
                data-testid="output-gated"
                style={{ color: '#c39868', marginTop: 5, fontSize: 10 }}
              >
                Output withheld until actual visual experimentation is recorded.
              </div>
            ) : (
              <pre
                data-testid="provisional-output"
                style={{
                  whiteSpace: 'pre-wrap',
                  fontSize: 9.5,
                  color: '#9ee8df',
                  margin: '6px 0 0',
                }}
              >
                {JSON.stringify(recorded, null, 2)}
              </pre>
            )}
          </div>

          <div style={{ ...panelStyle, borderColor: '#6d4d6e' }}>
            <div style={{ color: '#d7a5da', fontSize: 10 }}>
              CURRENT LEARN CLASSIFICATION
            </div>
            <strong data-testid="classification" style={{ fontSize: 11 }}>
              {item.finding}
            </strong>
            <div style={{ color: '#9eb5b1', fontSize: 9.5, marginTop: 4 }}>
              Alternatives kept distinct: re-export defect · stable asset anchor
              · per-variant anchor · true multi-hex footprint · scene-specific
              nudge.
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
