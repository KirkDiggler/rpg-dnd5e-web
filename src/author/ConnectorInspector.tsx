/**
 * ConnectorInspector — the door/connector editing surface (Kirk's
 * 2026-08-02 ask: "I cannot set a wall or a door — just realized the
 * gashes are walls"). Verified against the real dungeonspec.Validate
 * (rpg-toolkit encounter/dungeonspec/validate.go's `validateChain`): a
 * connector's `from`/`to` are fixed by room chain order — a spec must
 * have exactly `len(rooms)-1` connectors and connector `i` must always
 * join `rooms[i]` to `rooms[i+1]` — never independently authorable, so
 * this offers no add/remove/repoint affordance, only what the schema
 * actually allows: `locked: {dc, ability}` present or absent. Same
 * floating-panel position as `Inspector.tsx` — mutually exclusive with
 * it and `WallGashExplainer`, only one of placement/connector/wall-gash
 * selection is ever open at a time.
 */
import type { FloorPlan } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { DungeonDoc, LockedDoc } from './dungeonYaml';

/** rpg-toolkit rulebooks/dnd5e/abilities.List() — the six abbreviations
 * dungeonspec's validateLocked accepts via abilities.GetByID. */
const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

interface ConnectorInspectorProps {
  doc: DungeonDoc;
  floorPlan: FloorPlan;
  connectorIndex: number;
  onSetLocked: (locked: LockedDoc | null) => void;
  onClose: () => void;
}

export function ConnectorInspector({
  doc,
  floorPlan,
  connectorIndex,
  onSetLocked,
  onClose,
}: ConnectorInspectorProps) {
  const connector = doc.connectors[connectorIndex];
  const fpConnector = floorPlan.connectors[connectorIndex];
  if (!connector) return null;

  const locked = connector.locked;

  return (
    <div
      role="dialog"
      aria-label="Connector inspector"
      style={{
        position: 'fixed',
        right: 434,
        bottom: 18,
        width: 280,
        background: '#221d19',
        border: '1px solid #ffb347',
        borderRadius: 8,
        padding: 12,
        boxShadow: '0 6px 24px rgba(0,0,0,.5)',
        zIndex: 20,
        fontSize: 12,
        color: '#e8e2d8',
      }}
    >
      <h4 style={{ margin: '0 0 6px', fontSize: 13, color: '#ffb347' }}>
        Door: {connector.from} ↔ {connector.to}
      </h4>
      <p
        style={{
          margin: '0 0 10px',
          fontSize: 11,
          color: '#8a7a5a',
          lineHeight: 1.4,
        }}
      >
        Position is derived
        {fpConnector
          ? ` — column ${fpConnector.column}, door_row ${floorPlan.doorRow}`
          : ''}
        , not authorable: from/to are fixed by room chain order
        (dungeonspec.Validate's validateChain). "locked" is the only field this
        connector actually varies.
      </p>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: '6px 0',
        }}
      >
        <input
          type="checkbox"
          id="db-chk-locked"
          checked={locked !== null}
          onChange={(e) =>
            onSetLocked(e.target.checked ? { dc: 12, ability: 'dex' } : null)
          }
        />
        <label htmlFor="db-chk-locked">locked</label>
      </div>

      {locked && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              margin: '6px 0',
            }}
          >
            <label htmlFor="db-locked-dc" style={{ minWidth: 60 }}>
              dc (1-30)
            </label>
            <input
              id="db-locked-dc"
              type="number"
              min={1}
              max={30}
              value={locked.dc}
              onChange={(e) =>
                onSetLocked({
                  ...locked,
                  dc: Number(e.target.value) || locked.dc,
                })
              }
              style={{
                width: 60,
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 4,
                padding: '2px 6px',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              margin: '6px 0',
            }}
          >
            <label htmlFor="db-locked-ability" style={{ minWidth: 60 }}>
              ability
            </label>
            <select
              id="db-locked-ability"
              value={locked.ability}
              onChange={(e) =>
                onSetLocked({ ...locked, ability: e.target.value })
              }
              style={{
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 4,
                padding: '2px 6px',
              }}
            >
              {ABILITIES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <button
        onClick={onClose}
        style={{
          marginTop: 8,
          width: '100%',
          background: 'transparent',
          color: 'var(--text-secondary, #8a7a5a)',
          border: '1px solid var(--border-primary)',
          borderRadius: 4,
          padding: 6,
          cursor: 'pointer',
        }}
      >
        Close
      </button>
    </div>
  );
}
