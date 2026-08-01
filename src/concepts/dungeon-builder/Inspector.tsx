/**
 * Inspector — the selected placement's flag controls. Ref-type-gated:
 * blocks_movement/blocks_los are live checkboxes for props, disabled/gray
 * for monsters (dungeonspec.Validate rejects both on monster placements —
 * S4b's own spec). Also the entrance-blocked warning, the single most
 * persuasive interaction in the standalone concept (see CONTRACT.md).
 */
import type { FloorPlan } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { DungeonDoc } from './dungeonYaml';
import type { PlacementSelection } from './types';

interface InspectorProps {
  doc: DungeonDoc;
  floorPlan: FloorPlan;
  selected: PlacementSelection | null;
  onSetFlags: (blocksMovement: boolean, blocksLos: boolean) => void;
  onDelete: () => void;
}

export function Inspector({
  doc,
  floorPlan,
  selected,
  onSetFlags,
  onDelete,
}: InspectorProps) {
  if (!selected) return null;
  const room = doc.rooms.find((r) => r.id === selected.roomId);
  if (!room) return null;

  // Boss is always a monster ref (flags never apply); a place: entry
  // carries its own isMonster/blocksMovement/blocksLos already resolved
  // by dungeonYaml.ts's parser.
  const ref = selected.boss ? room.boss?.ref : room.place[selected.index]?.ref;
  const at = selected.boss ? room.boss?.at : room.place[selected.index]?.at;
  if (!ref || !at) return null;
  const isMonster = selected.boss
    ? true
    : (room.place[selected.index]?.isMonster ?? true);
  const blocksMovement = selected.boss
    ? false
    : (room.place[selected.index]?.blocksMovement ?? false);
  const blocksLos = selected.boss
    ? false
    : (room.place[selected.index]?.blocksLos ?? false);

  const fpRoom = floorPlan.rooms.find((r) => r.id === selected.roomId);
  const absCol = (fpRoom?.startColumn ?? 0) + at[0];
  const row = at[1];
  const onEntrance =
    !!floorPlan.entrance &&
    floorPlan.entrance.column === absCol &&
    floorPlan.entrance.row === row &&
    blocksMovement;

  return (
    <div
      role="dialog"
      aria-label="Placement inspector"
      style={{
        position: 'fixed',
        right: 434,
        bottom: 18,
        width: 260,
        background: '#221d19',
        border: '1px solid #c9a227',
        borderRadius: 8,
        padding: 12,
        boxShadow: '0 6px 24px rgba(0,0,0,.5)',
        zIndex: 20,
        fontSize: 12,
        color: '#e8e2d8',
      }}
    >
      <h4 style={{ margin: '0 0 6px', fontSize: 13, color: '#ffd76a' }}>
        {selected.boss ? 'Boss: ' : ''}
        {ref} [{at[0]},{at[1]}]
      </h4>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: '6px 0',
          opacity: isMonster ? 0.5 : 1,
        }}
      >
        <input
          type="checkbox"
          id="db-chk-bm"
          checked={blocksMovement}
          disabled={isMonster}
          onChange={(e) => onSetFlags(e.target.checked, blocksLos)}
        />
        <label htmlFor="db-chk-bm">blocks_movement</label>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: '6px 0',
          opacity: isMonster ? 0.5 : 1,
        }}
      >
        <input
          type="checkbox"
          id="db-chk-bl"
          checked={blocksLos}
          disabled={isMonster}
          onChange={(e) => onSetFlags(blocksMovement, e.target.checked)}
        />
        <label htmlFor="db-chk-bl">blocks_los</label>
      </div>

      {isMonster && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: '#ffb347',
            background: '#2a2015',
            border: '1px solid #4a3a1f',
            borderRadius: 4,
            padding: 6,
            lineHeight: 1.4,
          }}
        >
          Flags disabled: dungeonspec.Validate rejects
          blocks_movement/blocks_los on monster placements.
        </div>
      )}

      {onEntrance && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: '#ffb347',
            background: '#2a2015',
            border: '1px solid #4a3a1f',
            borderRadius: 4,
            padding: 6,
            lineHeight: 1.4,
          }}
        >
          ⚠ This sits on the party’s spawn cell (FloorPlan.entrance) and blocks
          movement. dungeonspec.Validate does NOT check this — it would save
          green server-side. Only the board can warn.
        </div>
      )}

      {!selected.boss ? (
        <button
          onClick={onDelete}
          style={{
            marginTop: 8,
            width: '100%',
            background: '#3a1c18',
            color: '#ff9a8a',
            border: '1px solid #5a2a20',
            borderRadius: 4,
            padding: 6,
            cursor: 'pointer',
          }}
        >
          Delete (or press Delete key)
        </button>
      ) : (
        <div style={{ marginTop: 8, fontSize: 11, color: '#ffb347' }}>
          Drag to move. Delete is blocked — a boss room must declare a boss.
        </div>
      )}
    </div>
  );
}
