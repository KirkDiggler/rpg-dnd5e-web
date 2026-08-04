/**
 * RegionPanel — the region-authoring floating panel (rpg-project#180,
 * "cell-authored semantic room regions"). Same visual language/position
 * discipline as `Inspector.tsx`/`ConnectorInspector.tsx` (a small fixed
 * panel near the board), shown whenever the Region tool has something to
 * say: cells pending for a not-yet-created region, or an existing region
 * selected for editing. Creation-mode only this round (TARGET-YAML.md's
 * "regions:" section) — edit mode renders any authored regions read-only
 * (`Board.tsx`), with no panel of its own yet.
 */
import { useEffect, useRef, useState } from 'react';
import type { DungeonDoc } from '../dungeonYaml';
import { sharedBoundaryEdges } from '../regionGeometry';
import type { RegionEditing } from './useRegionEditing';

const ARCHETYPE_OPTIONS = ['entrance', 'chamber', 'corridor', 'boss'];

function TargetDialectBadge() {
  return (
    <span
      title="target dialect, proposed — not yet compiled server-side (TARGET-YAML.md)"
      style={{
        fontSize: 9,
        color: '#c9aeff',
        background: '#241a33',
        border: '1px solid #4a3a63',
        borderRadius: 3,
        padding: '1px 5px',
        marginLeft: 6,
      }}
    >
      dialect
    </span>
  );
}

/** `region-N`, skipping any id already in use (a deleted-then-recreated
 * region, or a hand-authored id in the YAML pane, shouldn't collide). */
function suggestRegionId(doc: DungeonDoc): string {
  const existing = new Set(doc.regions.map((r) => r.id));
  let n = doc.regions.length + 1;
  while (existing.has(`region-${n}`)) n++;
  return `region-${n}`;
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  right: 434,
  bottom: 18,
  width: 260,
  background: '#221d19',
  border: '1px solid #3a9b6a',
  borderRadius: 8,
  padding: 12,
  boxShadow: '0 6px 24px rgba(0,0,0,.5)',
  zIndex: 20,
  fontSize: 12,
  color: '#e8e2d8',
};

const fieldRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  margin: '6px 0',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 4,
  padding: '3px 6px',
  fontSize: 12,
};

const buttonStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
};

interface RegionPanelProps {
  doc: DungeonDoc;
  regionEdit: RegionEditing;
}

export function RegionPanel({ doc, regionEdit }: RegionPanelProps) {
  const {
    pendingCells,
    clearPending,
    selectedRegionId,
    selectRegion,
    justCreatedId,
    handleCreate,
    handleRename,
    handleSetArchetype,
    handleDelete,
    handleConnect,
  } = regionEdit;

  const editingRegion = selectedRegionId
    ? (doc.regions.find((r) => r.id === selectedRegionId) ?? null)
    : null;

  // A "just created" region only gets a "connect to the previous region"
  // callout when there genuinely IS a previous region to offer (idx > 0).
  // The FIRST region anyone ever authors (idx === 0) has none — and this
  // used to leave the panel rendering nothing at all once painting
  // finished: no callout (nothing to connect to), no list (`justCreatedId`
  // was still set, so the list branch below's old `!justCreatedId` guard
  // skipped it too), no path back to the region just created. That dead
  // end is very likely the actual shape of Kirk's "is there a way to add
  // the region after we create it?" — precomputing this here lets the
  // list branch's own condition fall through to it naturally instead of
  // silently doing nothing.
  const justCreatedIdx = justCreatedId
    ? doc.regions.findIndex((r) => r.id === justCreatedId)
    : -1;
  const justCreatedRegion =
    justCreatedIdx >= 0 ? doc.regions[justCreatedIdx] : null;
  const connectCandidate =
    justCreatedIdx > 0 ? doc.regions[justCreatedIdx - 1] : null;
  const showConnectCallout = !!(justCreatedRegion && connectCandidate);

  const [draftId, setDraftId] = useState(() => suggestRegionId(doc));
  const [draftName, setDraftName] = useState('');
  const [draftArchetype, setDraftArchetype] = useState('chamber');
  const [renameDraft, setRenameDraft] = useState('');
  const [connectTarget, setConnectTarget] = useState('');

  // Re-suggest a fresh id/reset the draft fields the moment a NEW paint
  // session starts (0 -> N pending cells) — keyed on that transition, not
  // on every keystroke, so a manually-edited id survives while the author
  // keeps clicking more cells onto the same in-progress region.
  const wasEmpty = useRef(true);
  useEffect(() => {
    const isEmpty = pendingCells.length === 0;
    if (wasEmpty.current && !isEmpty) {
      setDraftId(suggestRegionId(doc));
      setDraftName('');
      setDraftArchetype('chamber');
    }
    wasEmpty.current = isEmpty;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCells.length]);

  useEffect(() => {
    setRenameDraft(editingRegion?.name ?? '');
  }, [editingRegion?.id, editingRegion?.name]);

  // --- Nothing pending/selected/just-created: the Region tool is active
  // but there's nothing to say about the CURRENT gesture. Kirk's own ask
  // ("is there a way to add the region after we create it?") is exactly
  // this state — the capability (click an existing region on the board
  // to select it for editing) already existed but was undiscoverable,
  // since this panel used to render nothing at all here. A compact list
  // of every existing region, click-to-select, fixes that without
  // requiring the author to already know to click precisely on the
  // board. Truly empty (no regions drawn yet either) still renders
  // nothing — there's nothing useful to list. ---
  if (pendingCells.length === 0 && !editingRegion && !showConnectCallout) {
    if (doc.regions.length === 0) return null;
    return (
      <div role="dialog" aria-label="Regions" style={panelStyle}>
        <h4 style={{ margin: '0 0 6px', fontSize: 13, color: '#3a9b6a' }}>
          Regions <TargetDialectBadge />
        </h4>
        <div style={{ fontSize: 11, color: '#8a7a5a', marginBottom: 6 }}>
          Click a region to edit it, or paint new board cells to start another.
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {doc.regions.map((r) => (
            <li key={r.id} style={{ marginBottom: 4 }}>
              <button
                onClick={() => selectRegion(r.id)}
                style={{
                  ...buttonStyle,
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  background: 'transparent',
                  color: '#e8e2d8',
                  border: '1px solid var(--border-primary)',
                  fontWeight: 400,
                }}
              >
                <span>{r.name ?? r.id}</span>
                <span style={{ color: '#8a7a5a' }}>
                  {r.archetype} · {r.cells.length}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // --- Create mode: painting a brand-new region ---
  if (pendingCells.length > 0) {
    const idTaken = doc.regions.some((r) => r.id === draftId);
    const idValid = /^[a-z0-9-]+$/.test(draftId);
    const canCreate = !idTaken && idValid && pendingCells.length > 0;

    // The "connect to previous" callout appears right after a successful
    // create (justCreatedId set) — but that clears pendingCells, so this
    // branch and the callout branch below never render at the same time;
    // shown here as a section instead for locality with the create form
    // it follows from.
    return (
      <div role="dialog" aria-label="Create region" style={panelStyle}>
        <h4 style={{ margin: '0 0 6px', fontSize: 13, color: '#3a9b6a' }}>
          New region <TargetDialectBadge />
        </h4>
        <div style={{ fontSize: 11, color: '#8a7a5a', marginBottom: 6 }}>
          {pendingCells.length} cell{pendingCells.length === 1 ? '' : 's'}{' '}
          selected — click more cells to add, click a selected cell to remove.
        </div>
        <div style={fieldRowStyle}>
          <span style={{ width: 56 }}>id</span>
          <input
            style={inputStyle}
            value={draftId}
            onChange={(e) => setDraftId(e.target.value)}
          />
        </div>
        {!idValid && (
          <div style={{ fontSize: 10, color: '#ff9a8a', margin: '-2px 0 6px' }}>
            id must match ^[a-z0-9-]+$
          </div>
        )}
        {idValid && idTaken && (
          <div style={{ fontSize: 10, color: '#ff9a8a', margin: '-2px 0 6px' }}>
            a region with this id already exists
          </div>
        )}
        <div style={fieldRowStyle}>
          <span style={{ width: 56 }}>name</span>
          <input
            style={inputStyle}
            placeholder="(optional)"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
        </div>
        <div style={fieldRowStyle}>
          <span style={{ width: 56 }}>archetype</span>
          <select
            style={inputStyle}
            value={draftArchetype}
            onChange={(e) => setDraftArchetype(e.target.value)}
          >
            {ARCHETYPE_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button
            style={{
              ...buttonStyle,
              background: canCreate ? '#3a9b6a' : 'var(--bg-secondary)',
              color: canCreate ? '#0d160f' : '#6a6255',
              cursor: canCreate ? 'pointer' : 'not-allowed',
            }}
            disabled={!canCreate}
            onClick={() =>
              handleCreate(draftId, draftArchetype, draftName || undefined)
            }
          >
            Create
          </button>
          <button
            style={{
              ...buttonStyle,
              background: 'transparent',
              color: '#8a7a5a',
              border: '1px solid var(--border-primary)',
            }}
            onClick={clearPending}
          >
            Clear selection
          </button>
        </div>
      </div>
    );
  }

  // --- Just created, WITH a previous region to offer: connect callout ---
  if (showConnectCallout && justCreatedRegion && connectCandidate) {
    const created = justCreatedRegion;
    const prev = connectCandidate;
    const edges = sharedBoundaryEdges(created.cells, prev.cells);
    const adjacent = edges.length > 0;
    return (
      <div role="dialog" aria-label="Connect region" style={panelStyle}>
        <h4 style={{ margin: '0 0 6px', fontSize: 13, color: '#3a9b6a' }}>
          Created "{created.name ?? created.id}"
        </h4>
        <p style={{ fontSize: 11, color: '#a89e90', lineHeight: 1.4 }}>
          {adjacent
            ? `Attach to "${prev.name ?? prev.id}"? Places a door edge on the shared boundary (${edges.length} candidate edge${edges.length === 1 ? '' : 's'}, midpoint chosen).`
            : `"${prev.name ?? prev.id}" doesn't share a boundary with this region — nothing to connect automatically. Use the region list to connect any two regions manually once more exist.`}
        </p>
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {adjacent && (
            <button
              style={{
                ...buttonStyle,
                background: '#3a9b6a',
                color: '#0d160f',
              }}
              onClick={() => handleConnect(created.id, prev.id)}
            >
              Connect
            </button>
          )}
          <button
            style={{
              ...buttonStyle,
              background: 'transparent',
              color: '#8a7a5a',
              border: '1px solid var(--border-primary)',
            }}
            onClick={() => selectRegion(null)}
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  // --- Edit mode: an existing region is selected ---
  if (editingRegion) {
    const others = doc.regions.filter((r) => r.id !== editingRegion.id);
    return (
      <div role="dialog" aria-label="Edit region" style={panelStyle}>
        <h4 style={{ margin: '0 0 6px', fontSize: 13, color: '#3a9b6a' }}>
          Region: {editingRegion.id} <TargetDialectBadge />
        </h4>
        {/* Kirk's own wording, closely matched — the discoverability gap
            this addendum exists to close ("is there a way to add the
            region after we create it?"): paint adds, ⇧-drag removes
            (CreationBoard.tsx's region-tool pointer handlers), Esc
            deselects (the keydown effect below). */}
        <div style={{ fontSize: 11, color: '#8a7a5a', marginBottom: 6 }}>
          editing {editingRegion.name ?? editingRegion.id} — paint to add, ⇧
          drag to remove, Esc to deselect ({editingRegion.cells.length} cell
          {editingRegion.cells.length === 1 ? '' : 's'}).
        </div>
        <div style={fieldRowStyle}>
          <span style={{ width: 56 }}>name</span>
          <input
            style={inputStyle}
            placeholder="(optional)"
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onBlur={() => handleRename(renameDraft)}
          />
        </div>
        <div style={fieldRowStyle}>
          <span style={{ width: 56 }}>archetype</span>
          <select
            style={inputStyle}
            value={editingRegion.archetype}
            onChange={(e) => handleSetArchetype(e.target.value)}
          >
            {ARCHETYPE_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        {others.length > 0 && (
          <div style={fieldRowStyle}>
            <span style={{ width: 56 }}>connect</span>
            <select
              style={inputStyle}
              value={connectTarget}
              onChange={(e) => setConnectTarget(e.target.value)}
            >
              <option value="">(pick a region)</option>
              {others.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name ?? r.id}
                </option>
              ))}
            </select>
            <button
              style={{
                ...buttonStyle,
                background: connectTarget ? '#3a9b6a' : 'var(--bg-secondary)',
                color: connectTarget ? '#0d160f' : '#6a6255',
                cursor: connectTarget ? 'pointer' : 'not-allowed',
              }}
              disabled={!connectTarget}
              onClick={() => handleConnect(editingRegion.id, connectTarget)}
            >
              Connect
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button
            style={{
              ...buttonStyle,
              background: 'transparent',
              color: '#8a7a5a',
              border: '1px solid var(--border-primary)',
            }}
            onClick={() => selectRegion(null)}
          >
            Done
          </button>
          <button
            style={{ ...buttonStyle, background: '#5a2a20', color: '#ff9a8a' }}
            onClick={() => handleDelete(editingRegion.id)}
          >
            Delete region
          </button>
        </div>
      </div>
    );
  }

  return null;
}
