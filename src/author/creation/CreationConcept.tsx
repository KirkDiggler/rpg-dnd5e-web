/**
 * CreationConcept — the "New Dungeon" flow's composition root, and (since
 * the "Edit: The Shrine Hall" tab's retirement, 2026-08-07, rpg-project#194)
 * the Dungeon Builder's ONLY composition root: dimension form, board,
 * palette, Inspector, YAML pane. Authors onto the SAME `DungeonDoc`/CST
 * the (now-retired) edit mode used, via the shared `Palette`'s Structural/
 * Markers tool rows and the shared `Inspector` — no bespoke Tools strip or
 * hand-rolled facing/delete panel duplicating what those already do. Real
 * server calls (capability-probed Save & Play, live floor-plan preview)
 * since the capability-probed-graduation and v0.3-wire-consumption units —
 * "no server calls" was true only in this concept's earliest, P4-deferred
 * form; see CONTRACT.md for the history.
 */
import type { FloorPlan } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { ValidationError } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import { useMemo, useState } from 'react';
import type { ServerCapabilities } from '../capabilityProbe';
import { CollapsibleSidePanel } from '../CollapsibleSidePanel';
import type { DungeonDoc, V1SubsetResult, WallKind } from '../dungeonYaml';
import { Inspector } from '../Inspector';
import { Palette } from '../Palette';
import { DungeonPreview3D } from '../preview3d/DungeonPreview3D';
import type { SpecCompatReport } from '../specCompat';
import type { BoardTool } from '../types';
import type { BoardEditing } from '../useBoardEditing';
import type { ServerState } from '../usePutDungeonPreview';
import type { SaveState } from '../useSaveDungeon';
import { resolveCanvasFloor } from './canvasFloor';
import { CreationBoard } from './CreationBoard';
import { DEFAULT_CANVAS } from './emptyCanvasDoc';
import type { CornerRef } from './hexCorner';
import { ProposedYamlPane } from './ProposedYamlPane';
import { RegionPanel } from './RegionPanel';
import type { RegionEditing } from './useRegionEditing';

/** Same 2D/3D board-dimension toggle edit mode's own board header already
 * has (`DungeonBuilderConcept.tsx`'s `boardDim`) — reused idiom, not a
 * second one invented for this mode. Owned by the same never-unmounting
 * parent (`DungeonBuilderConcept`) that already owns this mode's
 * palette/YAML collapse flags, for the identical "remembered per mode"
 * reason CONTRACT.md's "Collapsible side panels" section records: state
 * kept in a component that unmounts (this one, whenever the edit/create
 * tab flips away from 'create') resets on remount, so it has to live one
 * level up to survive a tab switch. */
export type BoardDim = '2d' | '3d';

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
  allowNewCanvas: boolean;
  toast: (message: string) => void;
  /** Cell-authored semantic region editing (rpg-project#180) —
   * creation-mode-only this round. See `useRegionEditing.ts`. */
  regionEdit: RegionEditing;
  /** Collapse state for the left Palette and the right YAML pane —
   * owned by the parent (`DungeonBuilderConcept`) so it survives a
   * `CreationConcept` remount (e.g. an /author <-> Concepts Lab
   * navigation). See `CollapsibleSidePanel.tsx`'s doc comment. */
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
  /** The creation document's own live `PutDungeon(validate_only)` response
   * (v0.3 wire consumption unit, 2026-08-05 — `usePutDungeonPreview.ts`'s
   * `useCreationFloorPlanPreview`). `null` in fixtures mode, mid-debounce,
   * or while a live server hasn't shipped `floor_cells`/`regions` yet
   * (every server today — dormant by design, see that hook's own doc
   * comment). Threaded down to `resolveCanvasFloor`/the region tree so
   * this concept flips to server truth automatically the day the platform
   * ships Wave 0/1, with zero further client changes. */
  liveFloorPlan: FloorPlan | null;
  v1Subset: V1SubsetResult | null;
  onSaveAndPlay: () => void;
  saveState: SaveState;
  savedKey: string | null;
  saveFieldErrors: ValidationError[];
  saveErrorMessage: string | null;
  /** 2D/3D board toggle — see `BoardDim`'s own doc comment above for why
   * this is owned by the parent rather than local `useState` here. */
  boardDim: BoardDim;
  onSetBoardDim: (dim: BoardDim) => void;
  /** Local drafts + versioned save/load (this unit) — threaded straight
   * to `ProposedYamlPane`. See `YamlPane.tsx`'s own doc comment on the
   * matching edit-mode props. */
  yamlDownloadFilename: string;
  onLoadYamlFile: (text: string) => void;
  onLoadYamlFileError: (message: string) => void;
  allowYamlFileIO: boolean;
  showSaveResultLink: boolean;
  specCompat: SpecCompatReport;
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
  allowNewCanvas,
  toast,
  regionEdit,
  paletteCollapsed,
  onTogglePalette,
  yamlCollapsed,
  onToggleYaml,
  serverState,
  capabilities,
  onRefreshCapabilities,
  liveFloorPlan,
  v1Subset,
  onSaveAndPlay,
  saveState,
  savedKey,
  saveFieldErrors,
  saveErrorMessage,
  boardDim,
  onSetBoardDim,
  yamlDownloadFilename,
  onLoadYamlFile,
  onLoadYamlFileError,
  allowYamlFileIO,
  showSaveResultLink,
  specCompat,
}: CreationConceptProps) {
  const [dims, setDims] = useState(DEFAULT_CANVAS);

  // Canvas floor resolution (rpg-project#169's creation-mode 3D preview
  // unit; wire-consumption-aware since the v0.3 wire consumption unit,
  // 2026-08-05) — the 3D preview's own floor semantic for a from-scratch
  // canvas, since it has no compiled `FloorPlan` to render from at all
  // (`creation/canvasFloor.ts`'s own doc comment has the full rationale).
  // Computed here, not inside `DungeonPreview3D` itself, per that
  // component's own "clean interfaces" doc comment — derived only when
  // actually needed (`boardDim === '3d'`) since both `resolveCanvasFloor`
  // paths scan the whole canvas grid or the whole wire cell list.
  // `resolveCanvasFloor` prefers `liveFloorPlan.floorCells` the moment a
  // live response carries a non-empty one, falling back to
  // `deriveCanvasFloorCells` otherwise (dormant against every server
  // today — see `liveFloorPlan`'s own doc comment).
  const resolvedFloor = useMemo(
    () =>
      boardDim === '3d'
        ? resolveCanvasFloor(doc, liveFloorPlan)
        : { cells: [], source: 'derived' as const },
    [boardDim, doc, liveFloorPlan]
  );
  const floorCells = resolvedFloor.cells;

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
        {allowNewCanvas && (
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
          </div>
        )}
        <div
          role="group"
          aria-label="2D or 3D board"
          style={{
            display: 'flex',
            gap: 2,
            border: '1px solid var(--border-primary)',
            borderRadius: 5,
            padding: 2,
          }}
        >
          {(['2d', '3d'] as const).map((d) => (
            <button
              key={d}
              onClick={() => onSetBoardDim(d)}
              style={{
                padding: '3px 10px',
                fontSize: 11.5,
                fontWeight: 600,
                borderRadius: 3,
                border: 'none',
                cursor: 'pointer',
                background: boardDim === d ? '#5fd1c9' : 'transparent',
                color: boardDim === d ? '#14110f' : 'var(--text-primary)',
              }}
            >
              {d.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      {boardDim === '3d' && (
        <div
          style={{
            padding: '4px 16px',
            fontSize: 11,
            color: '#8a7a5a',
            borderBottom: '1px solid var(--border-primary)',
          }}
        >
          Canvas floor = every cell minus holes (no compiled floor plan exists
          for a from-scratch canvas yet — see CONTRACT.md). Straight-wall
          footprint cells render dimmed; region cells render tinted with a
          floating label.{' '}
          {edit.selectedPalette
            ? `Palette: ${edit.selectedPalette.ref.split(':').pop()} selected — click an empty floor hex to place it (highlighted teal); orbit/zoom with the mouse.`
            : 'Click a placed prop/monster to select it (opens the Inspector — rotate/delete there), or pick a palette item to place one here too. Region/wall/hole/start/end tools stay 2D-only this round — switch to the 2D board for those.'}
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

        <main
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {boardDim === '2d' ? (
            <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
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
            </div>
          ) : (
            // Creation-mode 3D editing parity (rpg-project#169's
            // creation-3D-editing unit) — graduates edit-mode's existing
            // 3D click-to-place/select/rotate machinery onto the canvas,
            // closing the "read-only this round" follow-up the
            // creation-mode-3D-preview unit named. Wiring mirrors
            // `DungeonBuilderConcept.tsx`'s own edit-mode call site
            // exactly (`selectedPlacement`/`onSelect`/`selectedPalette`/
            // `onPlace`/`onReject`), plus `selectedTool` so a 2D-only
            // tool (region/wall/hole/start/end) armed while the author
            // clicks in 3D gets an honest "switch to 2D" message instead
            // of the generic "pick a palette item" one.
            // `floorPlan` stays unset — a canvas has none — so
            // `floorCells` (this component's own derivation above) is
            // the only floor input; `onPlace`'s `roomId` argument is
            // always `null` on this path (`DungeonPreview3D.tsx`'s own
            // `handleClickCell` doc comment) — the same top-level shape
            // `CreationBoard.tsx`'s 2D brush already produces via
            // `edit.handlePlace(null, cell)`. Region/wall 3D editing
            // itself stays out of scope this round — see CONTRACT.md.
            <div style={{ flex: 1, minHeight: 0 }}>
              <DungeonPreview3D
                floorCells={floorCells}
                floorSource={resolvedFloor.source}
                doc={doc}
                selectedPlacement={edit.selectedPlacement}
                onSelect={(sel) => {
                  clearOtherSelections('placement');
                  edit.setSelectedPlacement(sel);
                }}
                selectedPalette={edit.selectedPalette}
                onPlace={edit.handlePlace}
                onReject={toast}
                selectedTool={selectedTool}
              />
            </div>
          )}
        </main>

        <CollapsibleSidePanel
          side="right"
          width={420}
          label="YAML"
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
            downloadFilename={yamlDownloadFilename}
            onLoadFile={onLoadYamlFile}
            onLoadFileError={onLoadYamlFileError}
            allowYamlFileIO={allowYamlFileIO}
            showSaveResultLink={showSaveResultLink}
            specCompat={specCompat}
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
        <RegionPanel
          doc={doc}
          regionEdit={regionEdit}
          liveFloorPlan={liveFloorPlan}
        />
      )}
    </div>
  );
}
