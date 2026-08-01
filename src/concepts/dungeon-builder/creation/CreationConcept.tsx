/**
 * CreationConcept — the "New Dungeon" flow's composition root: dimension
 * form, tool strip, board, palette, facing inspector, proposed-YAML pane.
 * Entirely client-side (no server calls) — see CONTRACT.md.
 */
import { useEffect, useRef, useState } from 'react';
import { Palette } from '../Palette';
import type { PaletteSelection } from '../types';
import { CreationBoard } from './CreationBoard';
import type { CreationState } from './creationTypes';
import { DEFAULT_GRID, type CreationGrid, type Tool } from './creationTypes';
import { ProposedYamlPane } from './ProposedYamlPane';
import type { CreationActions } from './useCreationState';
import { useDemoScript } from './useDemoScript';

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  {
    id: 'wall',
    label: 'Draw Walls',
    hint: 'click-drag to paint or erase wall segments',
  },
  {
    id: 'door',
    label: 'Place Door',
    hint: 'click a drawn wall to add/remove a door',
  },
  { id: 'start', label: 'Set Start', hint: 'click a cell — party spawn' },
  { id: 'end', label: 'Set End', hint: 'click a cell — the goal' },
  {
    id: 'select',
    label: 'Select / Move',
    hint: 'click a placed piece to move, rotate facing, or delete',
  },
];

const FACING_LABELS = ['E', 'NE', 'NW', 'W', 'SW', 'SE'];

interface CreationConceptProps {
  state: CreationState;
  actions: CreationActions;
  toast: (message: string) => void;
}

export function CreationConcept({
  state,
  actions,
  toast,
}: CreationConceptProps) {
  const [tool, setTool] = useState<Tool>('wall');
  const [paletteSelection, setPaletteSelection] =
    useState<PaletteSelection | null>(null);
  const [dims, setDims] = useState<CreationGrid>(DEFAULT_GRID);

  // buildDemoScript is pinned to the dimensions at mount — the script's
  // own first step resets to them anyway, so a live dims edit mid-script
  // doesn't need to retarget it.
  const stateRef = useRef(state);
  stateRef.current = state;
  const demo = useDemoScript(actions, () => stateRef.current, DEFAULT_GRID);

  useEffect(() => {
    if (demo.isPlaying) {
      setTool('select');
      setPaletteSelection(null);
    }
  }, [demo.isPlaying]);

  const usageCounts: Record<string, number> = {};
  for (const p of state.placements)
    usageCounts[p.ref] = (usageCounts[p.ref] ?? 0) + 1;

  const selected =
    state.placements.find((p) => p.id === state.selectedPlacementId) ?? null;

  const activeTool = paletteSelection ? null : tool;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '80vh',
        border: '1px solid var(--border-primary)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h2
          style={{ fontSize: 16, margin: 0, color: '#ffd76a', fontWeight: 600 }}
        >
          New Dungeon
        </h2>
        <span style={{ fontSize: 12, color: '#a89e90' }}>
          20×30 room → draw walls → start/end → door → monster → reaper statue,
          facing this way
        </span>
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
          }}
        >
          <label>
            W:{' '}
            <input
              type="number"
              min={4}
              max={60}
              value={dims.width}
              onChange={(e) =>
                setDims((d) => ({
                  ...d,
                  width: Number(e.target.value) || d.width,
                }))
              }
              style={{
                width: 48,
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 4,
              }}
            />
          </label>
          <label>
            H:{' '}
            <input
              type="number"
              min={4}
              max={60}
              value={dims.height}
              onChange={(e) =>
                setDims((d) => ({
                  ...d,
                  height: Number(e.target.value) || d.height,
                }))
              }
              style={{
                width: 48,
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 4,
              }}
            />
          </label>
          <button
            onClick={() => actions.resetGrid(dims)}
            style={{
              background: '#c9a227',
              color: '#14110f',
              border: 'none',
              borderRadius: 4,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            New Canvas
          </button>
          <button
            onClick={() => (demo.isPlaying ? demo.pause() : demo.play())}
            style={{
              background: demo.isPlaying ? '#3a2f18' : '#5fd1c9',
              color: demo.isPlaying ? '#ffd76a' : '#14110f',
              border: demo.isPlaying ? '1px solid #c9a227' : 'none',
              borderRadius: 4,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {demo.isPlaying
              ? '⏸ Pause'
              : demo.isDone
                ? '▶ Replay the pitch'
                : demo.stepIndex > 0
                  ? '▶ Resume the pitch'
                  : '▶ Play the pitch'}
          </button>
          {(demo.stepIndex > 0 || demo.isDone) && (
            <button
              onClick={() => {
                demo.restart();
                actions.resetGrid(dims);
              }}
              style={{
                background: 'transparent',
                color: 'var(--text-secondary, #8a7a5a)',
                border: '1px solid var(--border-primary)',
                borderRadius: 4,
                padding: '4px 8px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              ↺ restart
            </button>
          )}
        </div>
      </header>

      {demo.caption && (
        <div
          style={{
            padding: '8px 16px',
            background: '#18261f',
            borderBottom: '1px solid #3a5a45',
            color: '#8fe8b0',
            fontSize: 13,
            fontStyle: 'italic',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span>“{demo.caption}”</span>
          <span style={{ fontSize: 10, color: '#5a8a6a', marginLeft: 'auto' }}>
            step {Math.min(demo.stepIndex + 1, demo.stepCount)}/{demo.stepCount}
            {demo.isDone
              ? ' — done, take over any time'
              : !demo.isPlaying
                ? ' — paused, take over any time'
                : ''}
          </span>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <aside
          style={{
            width: 250,
            flex: '0 0 250px',
            overflowY: 'auto',
            padding: 10,
            borderRight: '1px solid var(--border-primary)',
          }}
        >
          <h3
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '.05em',
              color: 'var(--text-secondary, #8a7a5a)',
              margin: '0 0 6px',
            }}
          >
            Tools
          </h3>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTool(t.id);
                setPaletteSelection(null);
              }}
              title={t.hint}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 8px',
                marginBottom: 3,
                borderRadius: 5,
                fontSize: 12.5,
                cursor: 'pointer',
                background: activeTool === t.id ? '#3a2f18' : 'transparent',
                border:
                  activeTool === t.id
                    ? '1px solid #c9a227'
                    : '1px solid transparent',
                color: activeTool === t.id ? '#ffd76a' : 'var(--text-primary)',
              }}
            >
              {t.label}
            </button>
          ))}

          {selected && (
            <div
              style={{
                marginTop: 12,
                padding: 8,
                background: '#221d19',
                border: '1px solid #c9a227',
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <div style={{ color: '#ffd76a', marginBottom: 6 }}>
                {selected.ref.split(':').pop()} [{selected.at[0]},
                {selected.at[1]}]
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <button
                  onClick={() => actions.rotateFacing(selected.id, -1)}
                  style={rotateBtnStyle}
                >
                  ↺
                </button>
                <span style={{ minWidth: 28, textAlign: 'center' }}>
                  {selected.facing !== null
                    ? FACING_LABELS[selected.facing]
                    : '—'}
                </span>
                <button
                  onClick={() => actions.rotateFacing(selected.id, 1)}
                  style={rotateBtnStyle}
                >
                  ↻
                </button>
                <span style={{ fontSize: 10, color: '#8a7a5a' }}>facing</span>
              </div>
              <button
                onClick={() => actions.deletePlacement(selected.id)}
                style={{
                  width: '100%',
                  background: '#3a1c18',
                  color: '#ff9a8a',
                  border: '1px solid #5a2a20',
                  borderRadius: 4,
                  padding: 5,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <Palette
              selected={paletteSelection}
              onSelect={(sel) => {
                setPaletteSelection(sel);
                if (sel) setTool('select'); // placing then falls back to select/move
              }}
              usageCounts={usageCounts}
            />
          </div>
        </aside>

        <main style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 18 }}>
          <CreationBoard
            state={state}
            actions={actions}
            tool={paletteSelection ? 'select' : tool}
            paletteSelection={paletteSelection}
            onReject={toast}
          />
        </main>

        <ProposedYamlPane state={state} />
      </div>
    </div>
  );
}

const rotateBtnStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 4,
  width: 24,
  height: 24,
  cursor: 'pointer',
};
