/**
 * CreationConcept — the "New Dungeon" flow's composition root: dimension
 * form, board, palette, Inspector, proposed-YAML pane. No server calls
 * (design.md defers wall/shape authoring to P4+ — see CONTRACT.md), but
 * since the CST unification it authors onto the SAME `DungeonDoc`/CST
 * edit mode does, via the shared `Palette`'s Structural/Markers tool
 * rows and the shared `Inspector` — no more bespoke Tools strip or
 * hand-rolled facing/delete panel duplicating what those already do.
 */
import type { ValidationError } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import { useEffect, useState } from 'react';
import type { ServerCapabilities } from '../capabilityProbe';
import { CollapsibleSidePanel } from '../CollapsibleSidePanel';
import type { DungeonDoc, V1SubsetResult, WallKind } from '../dungeonYaml';
import { Inspector } from '../Inspector';
import { Palette } from '../Palette';
import type { BoardTool } from '../types';
import type { BoardEditing } from '../useBoardEditing';
import type { ServerState } from '../usePutDungeonPreview';
import type { SaveState } from '../useSaveDungeon';
import { CreationBoard } from './CreationBoard';
import type { DemoActions } from './demoScript';
import { DEFAULT_CANVAS } from './emptyCanvasDoc';
import type { CornerRef } from './hexCorner';
import { ProposedYamlPane } from './ProposedYamlPane';
import { RegionPanel } from './RegionPanel';
import { useDemoScript } from './useDemoScript';
import type { RegionEditing } from './useRegionEditing';

interface CreationConceptProps {
  doc: DungeonDoc;
  yamlText: string;
  yamlParseError: string | null;
  onChangeYamlText: (text: string) => void;
  edit: BoardEditing;
  selectedTool: BoardTool | null;
  onSelectTool: (tool: BoardTool | null) => void;
  onToggleWallEdge: (
    from: [number, number],
    to: [number, number],
    kind: WallKind,
    on: boolean
  ) => void;
  onAddStraightWall: (from: CornerRef, to: CornerRef) => void;
  onRemoveStraightWallAt: (index: number) => void;
  onSetStraightWallEndpoint: (
    lineIndex: number,
    which: 'from' | 'to',
    corner: CornerRef
  ) => void;
  onToggleStraightWallDoorAt: (
    lineIndex: number,
    cell: [number, number]
  ) => void;
  onToggleHole: (col: number, row: number) => void;
  onSetPoint: (kind: 'start' | 'end', col: number, row: number) => void;
  onNewCanvas: (width: number, height: number) => void;
  demoActions: DemoActions;
  toast: (message: string) => void;
  /** Cell-authored semantic region editing (rpg-project#180) —
   * creation-mode-only this round. See `useRegionEditing.ts`. */
  regionEdit: RegionEditing;
  /** Collapse state for the left Palette and the right proposed-schema
   * pane — owned by the parent (`DungeonBuilderConcept`) so it's
   * remembered across an edit<->create tab switch instead of resetting
   * every time this component mounts. See `CollapsibleSidePanel.tsx`'s
   * doc comment. */
  paletteCollapsed: boolean;
  onTogglePalette: () => void;
  yamlCollapsed: boolean;
  onToggleYaml: () => void;
  /** Capability-probed graduation (this unit) — same server-capabilities
   * truth edit mode's `YamlPane` reads, threaded down to
   * `ProposedYamlPane` so creation mode's Save & Play gates on the real
   * server, not a permanently-disabled placeholder. See
   * `ProposedYamlPane.tsx`'s own doc comment for why the button still
   * reads disabled in practice today. */
  serverState: ServerState;
  capabilities: ServerCapabilities | null;
  onRefreshCapabilities: () => void;
  v1Subset: V1SubsetResult | null;
  onSaveAndPlay: () => void;
  saveState: SaveState;
  savedKey: string | null;
  saveFieldErrors: ValidationError[];
  saveErrorMessage: string | null;
}

export function CreationConcept({
  doc,
  yamlText,
  yamlParseError,
  onChangeYamlText,
  edit,
  selectedTool,
  onSelectTool,
  onToggleWallEdge,
  onAddStraightWall,
  onRemoveStraightWallAt,
  onSetStraightWallEndpoint,
  onToggleStraightWallDoorAt,
  onToggleHole,
  onSetPoint,
  onNewCanvas,
  demoActions,
  toast,
  regionEdit,
  paletteCollapsed,
  onTogglePalette,
  yamlCollapsed,
  onToggleYaml,
  serverState,
  capabilities,
  onRefreshCapabilities,
  v1Subset,
  onSaveAndPlay,
  saveState,
  savedKey,
  saveFieldErrors,
  saveErrorMessage,
}: CreationConceptProps) {
  const [dims, setDims] = useState(DEFAULT_CANVAS);

  // buildDemoScript is pinned to the dimensions at mount — the script's
  // own first step resets to them anyway, so a live dims edit mid-script
  // doesn't need to retarget it.
  const demo = useDemoScript(demoActions, DEFAULT_CANVAS);

  useEffect(() => {
    if (demo.isPlaying) {
      clearOtherSelections('tool');
      onSelectTool(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo.isPlaying]);

  const usageCounts: Record<string, number> = {};
  for (const p of doc.place) usageCounts[p.ref] = (usageCounts[p.ref] ?? 0) + 1;

  // Mirrors edit mode's own clearOtherSelections — a tool selection, a
  // palette selection, and a placement selection are mutually exclusive
  // here too, now that both flow through the same shared Palette/
  // Inspector edit mode uses.
  const clearOtherSelections = (keep: 'palette' | 'placement' | 'tool') => {
    if (keep !== 'palette') edit.setSelectedPalette(null);
    if (keep !== 'placement') edit.setSelectedPlacement(null);
    if (keep !== 'tool') onSelectTool(null);
  };

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
            onClick={() => onNewCanvas(dims.width, dims.height)}
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
                onNewCanvas(dims.width, dims.height);
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
        <CollapsibleSidePanel
          side="left"
          width={250}
          label="Palette"
          collapsed={paletteCollapsed}
          onToggle={onTogglePalette}
        >
          <Palette
            selected={edit.selectedPalette}
            onSelect={(sel) => {
              clearOtherSelections('palette');
              edit.setSelectedPalette(sel);
            }}
            usageCounts={usageCounts}
            selectedTool={selectedTool}
            onSelectTool={(tool) => {
              clearOtherSelections('tool');
              onSelectTool(tool);
            }}
            wallCount={doc.walls.length}
            holeCount={doc.holes.length}
            showRegionTool
            regionCount={doc.regions.length}
            showStraightWallTool
            straightWallCount={doc.wallLines.length}
          />
        </CollapsibleSidePanel>

        <main style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 18 }}>
          <CreationBoard
            doc={doc}
            edit={edit}
            tool={edit.selectedPalette ? null : selectedTool}
            onSelectPlacement={(sel) => {
              clearOtherSelections('placement');
              edit.setSelectedPlacement(sel);
            }}
            onReject={toast}
            onToggleWallEdge={onToggleWallEdge}
            onAddStraightWall={onAddStraightWall}
            onRemoveStraightWallAt={onRemoveStraightWallAt}
            onSetStraightWallEndpoint={onSetStraightWallEndpoint}
            onToggleStraightWallDoorAt={onToggleStraightWallDoorAt}
            onToggleHole={onToggleHole}
            onSetPoint={onSetPoint}
            regionEdit={regionEdit}
          />
        </main>

        <CollapsibleSidePanel
          side="right"
          width={420}
          label="Proposed Schema"
          collapsed={yamlCollapsed}
          onToggle={onToggleYaml}
        >
          <ProposedYamlPane
            yamlText={yamlText}
            onChangeText={onChangeYamlText}
            parseError={yamlParseError}
            serverState={serverState}
            capabilities={capabilities}
            onRefreshCapabilities={onRefreshCapabilities}
            v1Subset={v1Subset}
            onSaveAndPlay={onSaveAndPlay}
            saveState={saveState}
            savedKey={savedKey}
            saveFieldErrors={saveFieldErrors}
            saveErrorMessage={saveErrorMessage}
          />
        </CollapsibleSidePanel>
      </div>

      <Inspector
        doc={doc}
        selected={edit.selectedPlacement}
        onSetFlags={edit.handleSetFlags}
        onClearFlag={edit.handleClearFlag}
        onDelete={edit.handleDelete}
        onSetMount={edit.handleSetMount}
        onSetHeight={edit.handleSetHeight}
        onSetRotationDegrees={edit.handleSetRotationDegrees}
        onSnapFlush={edit.handleSnapFlush}
        onSetTargeting={edit.handleSetTargeting}
        onSetFacing={edit.handleSetFacing}
        onFlipMountSide={edit.handleFlipMountSide}
      />
      {/* Gated on the Region tool being active — `regionEdit`'s own
          pending/selected state is preserved when the author switches to
          a different tool and back, but the panel itself only shows while
          Region is the live tool, matching every other tool-scoped panel
          in this concept. */}
      {selectedTool === 'region' && (
        <RegionPanel doc={doc} regionEdit={regionEdit} />
      )}
    </div>
  );
}
