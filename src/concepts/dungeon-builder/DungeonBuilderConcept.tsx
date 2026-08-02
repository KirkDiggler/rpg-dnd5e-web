/**
 * DungeonBuilderConcept — composition root for the /concepts port of the
 * standalone dungeon-builder HTML concept (rpg-project#170/#169 S4a/S4b).
 * Owns the CST/doc state board clicks and YAML edits both mutate, the
 * live-vs-fixtures data source (`usePutDungeonPreview`), and the
 * hex-true/flattened layout toggle. See CONTRACT.md for the full findings
 * writeup.
 */
import { useEffect, useRef, useState } from 'react';
import { Board } from './Board';
import { CollapsibleSidePanel } from './CollapsibleSidePanel';
import { ConnectorInspector } from './ConnectorInspector';
import { CreationConcept } from './creation/CreationConcept';
import { useCreationState } from './creation/useCreationState';
import './DungeonBuilderConcept.css';
import {
  buildWalkItYaml,
  deletePlacement,
  DungeonParseError,
  moveBoss,
  movePlacement,
  parseDungeon,
  placeItem,
  serializeDungeon,
  setConnectorLocked,
  setPlacementFlags,
  toDungeonDoc,
  type DungeonDoc,
  type LockedDoc,
} from './dungeonYaml';
import { SHOWCASE_YAML } from './fixtures';
import type { LayoutMode } from './hexLayout';
import { Inspector } from './Inspector';
import { Palette } from './Palette';
import { PALETTE_PROPS } from './paletteData';
import { DungeonPreview3D } from './preview3d/DungeonPreview3D';
import { RolledContentPanel } from './RolledContentPanel';
import type { PaletteSelection, PlacementSelection } from './types';
import { usePutDungeonPreview } from './usePutDungeonPreview';
import { useSaveDungeon } from './useSaveDungeon';
import { WallGashExplainer } from './WallGashExplainer';
import { YamlPane } from './YamlPane';

const APPLY_DEBOUNCE_MS = 700;

type BuilderMode = 'edit' | 'create';

export function DungeonBuilderConcept() {
  const [mode, setMode] = useState<BuilderMode>('edit');
  const creation = useCreationState();
  const initial = parseDungeon(SHOWCASE_YAML);
  const [cst, setCst] = useState(initial.cst);
  const [doc, setDoc] = useState<DungeonDoc>(initial.doc);
  const [yamlText, setYamlText] = useState(serializeDungeon(initial.cst));
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedPalette, setSelectedPalette] =
    useState<PaletteSelection | null>(null);
  const [selectedPlacement, setSelectedPlacement] =
    useState<PlacementSelection | null>(null);
  // Door/wall editing (Kirk's 2026-08-02 ask). Mutually exclusive with
  // selectedPalette/selectedPlacement above — every setter for one of
  // these four clears the other three, so only one floating panel
  // (Inspector/ConnectorInspector/WallGashExplainer) is ever open, same
  // discipline the existing palette/placement pair already followed.
  const [selectedConnectorIndex, setSelectedConnectorIndex] = useState<
    number | null
  >(null);
  const [wallGashExplainerOpen, setWallGashExplainerOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('hex-true');
  const [boardDim, setBoardDim] = useState<'2d' | '3d'>('2d');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Collapse state for the side panels (Kirk's 2026-08-02 ask), kept HERE
  // rather than inside Palette/YamlPane/CreationConcept — this component
  // never unmounts across an edit<->create tab switch (only the JSX
  // subtree it returns differs), so state living here is genuinely
  // "remembered per mode": edit's flags and create's flags are two
  // independent pairs that each survive leaving and returning to their
  // own mode. See CollapsibleSidePanel.tsx's own doc comment.
  const [editPaletteCollapsed, setEditPaletteCollapsed] = useState(false);
  const [editYamlCollapsed, setEditYamlCollapsed] = useState(false);
  const [createPaletteCollapsed, setCreatePaletteCollapsed] = useState(false);
  const [createYamlCollapsed, setCreateYamlCollapsed] = useState(false);

  const preview = usePutDungeonPreview(doc, yamlText);
  const save = useSaveDungeon();
  // Separate instance from `save` above — "Walk it" is an independent
  // save action (its own key, its own idle/saving/saved/invalid/error
  // lifecycle) that can succeed or fail without disturbing the main
  // Save & Play result already on screen, or vice versa.
  const walkSave = useSaveDungeon();

  const handleWalkIt = () => {
    const walkKey = `${doc.key}-walk`;
    walkSave.save(walkKey, buildWalkItYaml(yamlText, walkKey));
  };

  // Clears every OTHER selection kind — called at the start of each of the
  // four selection setters below so only one floating panel is ever open.
  const clearOtherSelections = (
    keep: 'palette' | 'placement' | 'connector' | 'wall-gash' | 'none'
  ) => {
    if (keep !== 'palette') setSelectedPalette(null);
    if (keep !== 'placement') setSelectedPlacement(null);
    if (keep !== 'connector') setSelectedConnectorIndex(null);
    if (keep !== 'wall-gash') setWallGashExplainerOpen(false);
  };

  const handleSelectConnector = (index: number) => {
    clearOtherSelections('connector');
    setSelectedConnectorIndex(index);
  };

  const handleWallGashClick = () => {
    clearOtherSelections('wall-gash');
    setWallGashExplainerOpen(true);
  };

  const flashToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const applyText = (text: string) => {
    try {
      const parsed = parseDungeon(text);
      setCst(parsed.cst);
      setDoc(parsed.doc);
      setParseError(null);
      setSelectedPlacement(null);
    } catch (err) {
      setParseError(
        err instanceof DungeonParseError ? err.message : String(err)
      );
    }
  };

  const handleChangeText = (text: string) => {
    setYamlText(text);
    if (applyDebounce.current) clearTimeout(applyDebounce.current);
    applyDebounce.current = setTimeout(
      () => applyText(text),
      APPLY_DEBOUNCE_MS
    );
  };

  useEffect(
    () => () => {
      if (applyDebounce.current) clearTimeout(applyDebounce.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  // After any board-driven CST mutation: re-derive doc, re-serialize text.
  const syncFromCst = (nextCst: typeof cst) => {
    setCst(nextCst);
    setDoc(toDungeonDoc(nextCst));
    setYamlText(serializeDungeon(nextCst));
    setParseError(null);
  };

  const handleSetConnectorLocked = (locked: LockedDoc | null) => {
    if (selectedConnectorIndex === null) return;
    setConnectorLocked(cst, selectedConnectorIndex, locked);
    syncFromCst(cst);
  };

  const handlePlace = (roomId: string, at: [number, number]) => {
    if (!selectedPalette) return;
    const isMonster = selectedPalette.kind === 'monster';
    if (selectedPalette.kind === 'boss') {
      moveBoss(cst, roomId, at);
      flashToast('Boss pin placed.');
    } else {
      placeItem(cst, roomId, selectedPalette.ref, at);
      if (isMonster) {
        flashToast(
          'Monster placed — blocks_movement/blocks_los are forced off and disabled (dungeonspec.Validate rejects both flags on monster placements).'
        );
      }
    }
    syncFromCst(cst);
  };

  const handleMove = (
    sel: PlacementSelection,
    roomId: string,
    at: [number, number]
  ) => {
    if (sel.boss) {
      moveBoss(cst, roomId, at);
    } else if (roomId === sel.roomId) {
      movePlacement(cst, sel.roomId, sel.index, at);
    } else {
      // Cross-room move: delete + re-place, since a placement's index is
      // room-scoped (dungeonYaml.ts's own movePlacement is same-room only).
      const room = doc.rooms.find((r) => r.id === sel.roomId);
      const item = room?.place[sel.index];
      if (!item) return;
      deletePlacement(cst, sel.roomId, sel.index);
      placeItem(cst, roomId, item.ref, at);
    }
    syncFromCst(cst);
    if (!sel.boss)
      setSelectedPlacement({
        roomId,
        index: doc.rooms.find((r) => r.id === roomId)!.place.length,
      });
  };

  const handleDelete = () => {
    if (!selectedPlacement || selectedPlacement.boss) return;
    deletePlacement(cst, selectedPlacement.roomId, selectedPlacement.index);
    setSelectedPlacement(null);
    syncFromCst(cst);
  };

  const handleSetFlags = (blocksMovement: boolean, blocksLos: boolean) => {
    if (!selectedPlacement || selectedPlacement.boss) return;
    setPlacementFlags(cst, selectedPlacement.roomId, selectedPlacement.index, {
      blocksMovement,
      blocksLos,
    });
    syncFromCst(cst);
  };

  const usageCounts: Record<string, number> = {};
  for (const room of doc.rooms) {
    for (const p of room.place) {
      usageCounts[p.ref] = (usageCounts[p.ref] ?? 0) + 1;
    }
  }
  // Guard against the palette silently drifting from the manifest.
  for (const p of PALETTE_PROPS) usageCounts[p.ref] ??= 0;

  const modeBannerText =
    boardDim === '3d'
      ? '3D preview — view only (spike). Orbit/zoom with the mouse; edit via the palette/YAML in 2D.'
      : selectedPalette
        ? `Palette: ${selectedPalette.ref.split(':').pop()} selected — click an empty legal cell to place it.`
        : selectedPlacement
          ? 'Selected a placed piece — drag to move, Delete key to remove, toggle flags in the inspector.'
          : 'Nothing selected — pick a palette item, or click a placed piece.';

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPlacement) {
        e.preventDefault();
        if (selectedPlacement.boss) {
          flashToast(
            'Boss required — can’t delete (dungeonspec: "boss room must declare boss"). Drag it instead.'
          );
        } else {
          handleDelete();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlacement, cst]);

  const modeTabs = (
    <div style={{ display: 'flex', gap: 6, padding: '10px 16px 0' }}>
      {(['edit', 'create'] as const).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          style={{
            padding: '6px 14px',
            borderRadius: '6px 6px 0 0',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
            border: '1px solid var(--border-primary)',
            borderBottom:
              mode === m
                ? '1px solid transparent'
                : '1px solid var(--border-primary)',
            background: mode === m ? 'var(--bg-secondary)' : 'transparent',
            color: mode === m ? '#ffd76a' : 'var(--text-primary)',
          }}
        >
          {m === 'edit' ? 'Edit: The Shrine Hall' : 'New Dungeon'}
        </button>
      ))}
    </div>
  );

  if (mode === 'create') {
    return (
      <div>
        {modeTabs}
        <CreationConcept
          state={creation.state}
          actions={creation.actions}
          toast={flashToast}
          paletteCollapsed={createPaletteCollapsed}
          onTogglePalette={() => setCreatePaletteCollapsed((c) => !c)}
          yamlCollapsed={createYamlCollapsed}
          onToggleYaml={() => setCreateYamlCollapsed((c) => !c)}
        />
        {toast && <ToastBanner message={toast} />}
      </div>
    );
  }

  if (!preview.floorPlan) {
    return (
      <div>
        {modeTabs}
        <div style={{ padding: 20 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div>
      {modeTabs}
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
            alignItems: 'baseline',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <h2
            style={{
              fontSize: 16,
              margin: 0,
              color: '#ffd76a',
              fontWeight: 600,
            }}
          >
            Dungeon Builder — board
          </h2>
          <span style={{ fontSize: 12, color: '#a89e90' }}>
            rpg-project#170/#169 · The Shrine Hall
          </span>
          <div
            role="group"
            aria-label="2D or 3D board"
            style={{
              marginLeft: 'auto',
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
                onClick={() => setBoardDim(d)}
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
          {boardDim === '2d' && (
            <label
              style={{
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              Layout:
              <select
                value={layoutMode}
                onChange={(e) => setLayoutMode(e.target.value as LayoutMode)}
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 4,
                  padding: '2px 6px',
                }}
              >
                <option value="hex-true">
                  hex-true (shears — real game math)
                </option>
                <option value="flattened">flattened (plain grid)</option>
              </select>
            </label>
          )}
          <div
            style={{
              fontSize: 12.5,
              color: '#ffb347',
              background: '#2a2117',
              border: '1px solid #4a3a1f',
              borderRadius: 4,
              padding: '4px 10px',
              minWidth: 260,
              textAlign: 'right',
            }}
          >
            {modeBannerText}
          </div>
        </header>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <CollapsibleSidePanel
            side="left"
            width={250}
            label="Palette"
            collapsed={editPaletteCollapsed}
            onToggle={() => setEditPaletteCollapsed((c) => !c)}
          >
            <Palette
              selected={selectedPalette}
              onSelect={(sel) => {
                clearOtherSelections('palette');
                setSelectedPalette(sel);
              }}
              usageCounts={usageCounts}
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
              <>
                <div
                  style={{
                    padding: '4px 16px 0',
                    fontSize: 11,
                    color: '#8a7a5a',
                  }}
                >
                  Board renders the game's actual odd-q pointy-top hex math when
                  "hex-true" is selected — the diagonal shear across the chain
                  is a real property of that addressing, not a rendering bug.
                  Toggle to "flattened" to compare. See CONTRACT.md.
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
                  <Board
                    floorPlan={preview.floorPlan}
                    doc={doc}
                    layoutMode={layoutMode}
                    selectedPalette={selectedPalette}
                    selectedPlacement={selectedPlacement}
                    selectedConnectorIndex={selectedConnectorIndex}
                    onPlace={handlePlace}
                    onSelect={(sel) => {
                      clearOtherSelections('placement');
                      setSelectedPlacement(sel);
                    }}
                    onMove={handleMove}
                    onReject={flashToast}
                    onSelectConnector={handleSelectConnector}
                    onWallGashClick={handleWallGashClick}
                  />
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    padding: '4px 16px 0',
                    fontSize: 11,
                    color: '#8a7a5a',
                  }}
                >
                  Spike: floor + props + monsters only — no walls/doors (not on
                  the FloorPlan wire), no combat/fog. See CONTRACT.md's "3D
                  preview spike" section.
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <DungeonPreview3D floorPlan={preview.floorPlan} doc={doc} />
                </div>
              </>
            )}
            <RolledContentPanel doc={doc} />
          </main>
          <CollapsibleSidePanel
            side="right"
            width={420}
            label="YAML"
            collapsed={editYamlCollapsed}
            onToggle={() => setEditYamlCollapsed((c) => !c)}
          >
            <YamlPane
              yamlText={yamlText}
              onChangeText={handleChangeText}
              onApply={() => applyText(yamlText)}
              parseError={parseError}
              serverState={preview.serverState}
              requestError={preview.requestError}
              fieldErrors={preview.fieldErrors}
              onRetryProbe={preview.retryProbe}
              onSaveAndPlay={() => save.save(doc.key, yamlText)}
              saveState={save.state}
              savedKey={save.savedKey}
              saveFieldErrors={save.fieldErrors}
              saveErrorMessage={save.errorMessage}
              onWalkIt={handleWalkIt}
              walkState={walkSave.state}
              walkSavedKey={walkSave.savedKey}
              walkFieldErrors={walkSave.fieldErrors}
              walkErrorMessage={walkSave.errorMessage}
            />
          </CollapsibleSidePanel>
        </div>

        <Inspector
          doc={doc}
          floorPlan={preview.floorPlan}
          selected={selectedPlacement}
          onSetFlags={handleSetFlags}
          onDelete={handleDelete}
        />

        {selectedConnectorIndex !== null && (
          <ConnectorInspector
            doc={doc}
            floorPlan={preview.floorPlan}
            connectorIndex={selectedConnectorIndex}
            onSetLocked={handleSetConnectorLocked}
            onClose={() => setSelectedConnectorIndex(null)}
          />
        )}

        {wallGashExplainerOpen && (
          <WallGashExplainer
            onClose={() => setWallGashExplainerOpen(false)}
            onPrototypeInCreation={() => {
              setWallGashExplainerOpen(false);
              setMode('create');
            }}
          />
        )}

        {toast && <ToastBanner message={toast} />}
      </div>
    </div>
  );
}

function ToastBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 18,
        transform: 'translateX(-50%)',
        background: '#2a2117',
        border: '1px solid #ffb347',
        color: '#ffb347',
        padding: '8px 16px',
        borderRadius: 6,
        fontSize: 12.5,
        zIndex: 30,
        maxWidth: 480,
        textAlign: 'center',
      }}
    >
      {message}
    </div>
  );
}
