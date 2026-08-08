/**
 * Fixture-first Learn surface for #728. This intentionally sits beside the
 * production DungeonBuilderConcept rather than adding persistence/schema to it:
 * it reuses the real authoring 3D preview, PropModel pipeline, and tactical Play
 * camera while keeping every experimental value local and resettable.
 */
import { useMemo, useReducer } from 'react';
import { deriveCanvasFloorCells } from './creation/canvasFloor';
import { parseDungeon } from './dungeonYaml';
import { DungeonPreview3D } from './preview3d/DungeonPreview3D';
import {
  ALONG_WALL_LIMIT_METERS,
  BOOKCASE_REF,
  compositionPreviewResolver,
  createInitialPropCompositionState,
  NUDGE_STEP_METERS,
  ORNATE_TORCH_REF,
  propCompositionReducer,
  selectedCompositionPlacement,
  TOWARD_WALL_LIMIT_METERS,
  type CompositionSlotId,
} from './propCompositionExperiment';
import type { PlacementSelection } from './types';

/**
 * Local specimen only. Its structure is NOT a proposed document contract.
 * The three cells are consecutive cube-E neighbors, so their world centers
 * share one straight X-axis run. The wall line spans their wall-side corners.
 */
export const PROP_COMPOSITION_FIXTURE_YAML = `version: 1
spec: draft
key: precise-prop-composition-probe
name: "Wall run composition probe"
height: 1
canvas: { width: 6, height: 5 }
rooms: []
connectors: []
walls: []
wallLines:
  - from: { cell: [1, 2], corner: 2 }
    to: { cell: [3, 3], corner: 0 }
    doors: []
holes: []
start: [2, 4]
end: null
lighting: { ambient: 0.62 }
place:
  - { ref: "dnd5e:props:bookcase", at: [1, 2], facing: E }
  - { ref: "dnd5e:props:bookcase", at: [2, 3], facing: E }
  - { ref: "dnd5e:props:bookcase", at: [3, 3], facing: E }
`;

function selectionSlot(
  selection: PlacementSelection
): CompositionSlotId | null {
  if (selection.boss || selection.roomId !== null) return null;
  return (['left', 'center', 'right'] as const)[selection.index] ?? null;
}

function meters(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} m`;
}

function centimeters(value: number): string {
  return `${Math.round(Math.abs(value) * 100)} cm`;
}

const panelStyle = {
  border: '1px solid #4a3a2c',
  borderRadius: 6,
  background: '#17130f',
  padding: 10,
} as const;

const buttonStyle = {
  border: '1px solid #5a4937',
  borderRadius: 4,
  color: '#e8e2d8',
  background: '#282018',
  padding: '6px 8px',
  fontSize: 11,
  cursor: 'pointer',
} as const;

export function PropCompositionConcept() {
  const [state, dispatch] = useReducer(
    propCompositionReducer,
    undefined,
    createInitialPropCompositionState
  );
  const fixture = useMemo(
    () => parseDungeon(PROP_COMPOSITION_FIXTURE_YAML).doc,
    []
  );
  const floorCells = useMemo(() => deriveCanvasFloorCells(fixture), [fixture]);
  const previewOverride = useMemo(
    () => compositionPreviewResolver(state),
    [state]
  );
  const selected = selectedCompositionPlacement(state);
  const selectedName =
    selected.assetRef === BOOKCASE_REF ? 'bookcase' : 'ornate torch';
  const isReplaced = selected.assetRef === ORNATE_TORCH_REF;

  return (
    <section
      aria-label="Precise prop composition experiment"
      style={{
        height: '76vh',
        minHeight: 560,
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--border-primary)',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#0c0a08',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '9px 14px',
          borderBottom: '1px solid #3c3025',
          background: '#15110e',
        }}
      >
        <div>
          <h2 style={{ margin: 0, color: '#ffd76a', fontSize: 16 }}>
            Precise prop alignment
          </h2>
          <div style={{ color: '#a89e90', fontSize: 11 }}>
            fixture-only Learn probe · actual bookcase + ornate-torch GLBs · no
            save/persistence
          </div>
        </div>
        <div
          data-testid="composition-status"
          style={{ marginLeft: 'auto', color: '#8fe8e0', fontSize: 11 }}
        >
          {state.placements.filter((p) => p.assetRef === BOOKCASE_REF).length}{' '}
          bookcases ·{' '}
          {
            state.placements.filter((p) => p.assetRef === ORNATE_TORCH_REF)
              .length
          }{' '}
          ornate torches
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <DungeonPreview3D
            floorCells={floorCells}
            floorSource="derived"
            doc={fixture}
            selectedPlacement={selected.selection}
            onSelect={(selection) => {
              if (!selection) return;
              const slotId = selectionSlot(selection);
              if (slotId) dispatch({ type: 'select', slotId });
            }}
            placementPreviewOverride={previewOverride}
          />
          <div
            style={{
              position: 'absolute',
              left: 8,
              bottom: 8,
              borderRadius: 4,
              padding: '5px 8px',
              background: 'rgba(12,10,8,0.78)',
              color: '#c9bfae',
              fontSize: 10.5,
              pointerEvents: 'none',
            }}
          >
            Orbit = author · Play = fidelity verdict · both consume one resolved
            transform
          </div>
        </div>

        <aside
          style={{
            width: 330,
            overflowY: 'auto',
            borderLeft: '1px solid #3c3025',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            color: '#e8e2d8',
            background: '#110e0b',
          }}
        >
          <div style={panelStyle}>
            <div style={{ color: '#8a7a5a', fontSize: 10 }}>SELECTED SPAN</div>
            <strong
              data-testid="selected-placement"
              style={{ color: '#ffd76a' }}
            >
              {selected.slotId} · {selectedName}
            </strong>
            <div style={{ marginTop: 4, fontSize: 10.5, color: '#a89e90' }}>
              Click any model to select its span. Only that placement moves.
            </div>
          </div>

          <div style={panelStyle}>
            <div style={{ color: '#8fe8e0', fontSize: 10, fontWeight: 700 }}>
              NUDGE · WALL-LOCAL BASIS
            </div>
            <div style={{ margin: '5px 0', color: '#a89e90', fontSize: 10.5 }}>
              Step {centimeters(NUDGE_STEP_METERS)} · along wall ±
              {centimeters(ALONG_WALL_LIMIT_METERS)} · toward/away ±
              {centimeters(TOWARD_WALL_LIMIT_METERS)}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 5,
              }}
            >
              <button
                style={buttonStyle}
                aria-label="Nudge left along wall"
                onClick={() =>
                  dispatch({
                    type: 'nudge',
                    axis: 'along-wall',
                    delta: -NUDGE_STEP_METERS,
                  })
                }
              >
                ← along wall
              </button>
              <button
                style={buttonStyle}
                aria-label="Nudge right along wall"
                onClick={() =>
                  dispatch({
                    type: 'nudge',
                    axis: 'along-wall',
                    delta: NUDGE_STEP_METERS,
                  })
                }
              >
                along wall →
              </button>
              <button
                style={buttonStyle}
                aria-label="Nudge toward wall"
                onClick={() =>
                  dispatch({
                    type: 'nudge',
                    axis: 'toward-wall',
                    delta: -NUDGE_STEP_METERS,
                  })
                }
              >
                ↑ toward wall
              </button>
              <button
                style={buttonStyle}
                aria-label="Nudge away from wall"
                onClick={() =>
                  dispatch({
                    type: 'nudge',
                    axis: 'toward-wall',
                    delta: NUDGE_STEP_METERS,
                  })
                }
              >
                ↓ away from wall
              </button>
            </div>
            <div
              data-testid="nudge-values"
              style={{ marginTop: 6, color: '#c9bfae', fontSize: 10.5 }}
            >
              along {meters(selected.alongWallMeters)} · normal{' '}
              {meters(selected.towardWallMeters)}
            </div>
          </div>

          <div style={panelStyle}>
            <div style={{ color: '#8fe8e0', fontSize: 10, fontWeight: 700 }}>
              SNAP · PREVIEWED ANCHORS
            </div>
            <button
              style={{
                ...buttonStyle,
                width: '100%',
                marginTop: 5,
                textAlign: 'left',
              }}
              onClick={() => dispatch({ type: 'snap', anchor: 'slot-center' })}
            >
              Snap to span center
              <small style={{ display: 'block', color: '#a89e90' }}>
                moves {centimeters(selected.alongWallMeters)} along wall;
                neighbors unchanged
              </small>
            </button>
            <button
              style={{
                ...buttonStyle,
                width: '100%',
                marginTop: 5,
                textAlign: 'left',
              }}
              onClick={() => dispatch({ type: 'snap', anchor: 'wall-line' })}
            >
              Snap to wall clearance
              <small style={{ display: 'block', color: '#a89e90' }}>
                moves {centimeters(selected.towardWallMeters)} normal to wall;
                neighbors unchanged
              </small>
            </button>
          </div>

          <div style={panelStyle}>
            <div style={{ color: '#8fe8e0', fontSize: 10, fontWeight: 700 }}>
              REPLACE · ONE ACTION
            </div>
            <button
              style={{
                ...buttonStyle,
                width: '100%',
                marginTop: 5,
                background: isReplaced ? '#20342f' : '#6e5420',
                borderColor: isReplaced ? '#3a655c' : '#c9a227',
              }}
              disabled={isReplaced}
              onClick={() => dispatch({ type: 'replace-with-ornate-torch' })}
            >
              {isReplaced
                ? 'Ornate torch in this span'
                : 'Replace with ornate torch'}
            </button>
            <div
              data-testid="replacement-ownership"
              style={{ marginTop: 6, fontSize: 10.5, color: '#a89e90' }}
            >
              Preserve: span center + local nudge. Refresh: model/variant +
              fixture-resolved visual anchor, footprint, and light behavior.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              style={{ ...buttonStyle, flex: 1 }}
              onClick={() => dispatch({ type: 'reset-adjustment' })}
            >
              Reset adjustment
            </button>
            <button
              style={{ ...buttonStyle, flex: 1, color: '#ffd76a' }}
              onClick={() => dispatch({ type: 'reset-fixture' })}
            >
              Reset fixture
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
