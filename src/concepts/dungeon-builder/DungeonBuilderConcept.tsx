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
import { CreationConcept } from './creation/CreationConcept';
import { useCreationState } from './creation/useCreationState';
import './DungeonBuilderConcept.css';
import {
  deletePlacement,
  DungeonParseError,
  moveBoss,
  movePlacement,
  parseDungeon,
  placeItem,
  serializeDungeon,
  setPlacementFlags,
  toDungeonDoc,
  type DungeonDoc,
} from './dungeonYaml';
import { SHOWCASE_YAML } from './fixtures';
import type { LayoutMode } from './hexLayout';
import { Inspector } from './Inspector';
import { Palette } from './Palette';
import { PALETTE_PROPS } from './paletteData';
import { RolledContentPanel } from './RolledContentPanel';
import type { PaletteSelection, PlacementSelection } from './types';
import { usePutDungeonPreview } from './usePutDungeonPreview';
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
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('hex-true');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const preview = usePutDungeonPreview(doc, yamlText);

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

  const modeBannerText = selectedPalette
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
          <label
            style={{
              marginLeft: 'auto',
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
          <Palette
            selected={selectedPalette}
            onSelect={(sel) => {
              setSelectedPalette(sel);
              setSelectedPlacement(null);
            }}
            usageCounts={usageCounts}
          />
          <main
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{ padding: '4px 16px 0', fontSize: 11, color: '#8a7a5a' }}
            >
              Board renders the game's actual odd-q pointy-top hex math when
              "hex-true" is selected — the diagonal shear across the chain is a
              real property of that addressing, not a rendering bug. Toggle to
              "flattened" to compare. See CONTRACT.md.
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
              <Board
                floorPlan={preview.floorPlan}
                doc={doc}
                layoutMode={layoutMode}
                selectedPalette={selectedPalette}
                selectedPlacement={selectedPlacement}
                onPlace={handlePlace}
                onSelect={(sel) => {
                  setSelectedPlacement(sel);
                  setSelectedPalette(null);
                }}
                onMove={handleMove}
                onReject={flashToast}
              />
            </div>
            <RolledContentPanel doc={doc} />
          </main>
          <YamlPane
            yamlText={yamlText}
            onChangeText={handleChangeText}
            onApply={() => applyText(yamlText)}
            parseError={parseError}
            serverState={preview.serverState}
            requestError={preview.requestError}
            fieldErrors={preview.fieldErrors}
            onRetryProbe={preview.retryProbe}
          />
        </div>

        <Inspector
          doc={doc}
          floorPlan={preview.floorPlan}
          selected={selectedPlacement}
          onSetFlags={handleSetFlags}
          onDelete={handleDelete}
        />

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
