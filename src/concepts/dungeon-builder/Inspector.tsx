/**
 * Inspector — the selected placement's flag controls. Ref-type-gated:
 * blocks_movement/blocks_los are live checkboxes for props, disabled/gray
 * for monsters (dungeonspec.Validate rejects both on monster placements —
 * S4b's own spec). Also the entrance-blocked warning, the single most
 * persuasive interaction in the standalone concept (see CONTRACT.md).
 *
 * Two v2, proposed controls (Kirk's 2026-08-02 dialect adds — TARGET-
 * YAML.md's "z-axis" and "Monster targeting" sections), both badged:
 * a targeting dropdown for any monster placement (boss or general), and
 * a wall-mount height field for the one palette ref this round judged
 * cheap enough to wire up (`WALL_MOUNTABLE_REFS` — `dnd5e:props:
 * wall-banner`, the only ref in this palette whose own name says
 * "wall"). Neither reaches `PutDungeon` — `stripToV1Subset` drops both
 * before any real save, same as every other v2 field.
 */
import { HEX_FACING_LABELS } from '@/components/hex-grid/authorGridHelpers';
import type { FloorPlan } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { DungeonDoc, Mount } from './dungeonYaml';
import type { PlacementSelection } from './types';

/** Wall-mountable props this round wires the mount/height inspector UI
 * up for — deliberately small (see TARGET-YAML.md's z-axis section:
 * "the placement inspector's optional height field, when cheap to add
 * for a known wall-mountable ref, is the only UI this round ships").
 * `dnd5e:props:wall-banner` is the only palette ref whose own name says
 * "wall" — not a general "any prop can mount on a wall" affordance. */
const WALL_MOUNTABLE_REFS = new Set<string>(['dnd5e:props:wall-banner']);

const TARGETING_OPTIONS = [
  { value: '', label: '(none)' },
  { value: 'lowest-health', label: 'lowest-health' },
  { value: 'lowest-ac', label: 'lowest-ac' },
  { value: 'closest', label: 'closest' },
];

function V2Badge() {
  return (
    <span
      title="v2, proposed — not yet compiled server-side (TARGET-YAML.md)"
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
      v2
    </span>
  );
}

interface InspectorProps {
  doc: DungeonDoc;
  /** Absent for the "New Dungeon" creation board — there is no compiled
   * FloorPlan for a freeform canvas (no server call at all; see
   * CreationConcept.tsx's own doc comment). Every FloorPlan-derived value
   * below degrades to the canvas-native reading when this is undefined:
   * `at` is already absolute (no room-chain startColumn to add), and the
   * entrance-blocked warning simply never fires (a canvas draft has no
   * FloorPlan.entrance to sit on). */
  floorPlan?: FloorPlan;
  selected: PlacementSelection | null;
  onSetFlags: (blocksMovement: boolean, blocksLos: boolean) => void;
  onDelete: () => void;
  onSetMount: (mount: Mount, height: number | null) => void;
  onSetTargeting: (targeting: string | null) => void;
  onSetFacing: (facing: number | null) => void;
}

export function Inspector({
  doc,
  floorPlan,
  selected,
  onSetFlags,
  onDelete,
  onSetMount,
  onSetTargeting,
  onSetFacing,
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
  // v2 — mount/height don't exist on a boss entry (bosses aren't wall
  // furniture); targeting/facing exist on both.
  const mount = selected.boss
    ? 'floor'
    : (room.place[selected.index]?.mount ?? 'floor');
  const height = selected.boss
    ? null
    : (room.place[selected.index]?.height ?? null);
  const targeting = selected.boss
    ? (room.boss?.targeting ?? null)
    : (room.place[selected.index]?.targeting ?? null);
  const facing = selected.boss
    ? (room.boss?.facing ?? null)
    : (room.place[selected.index]?.facing ?? null);
  const isWallMountable = !selected.boss && WALL_MOUNTABLE_REFS.has(ref);

  const fpRoom = floorPlan?.rooms.find((r) => r.id === selected.roomId);
  const absCol = (fpRoom?.startColumn ?? 0) + at[0];
  const row = at[1];
  const onEntrance =
    !!floorPlan?.entrance &&
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
          gap: 6,
          margin: '6px 0',
          fontSize: 11,
        }}
      >
        <button
          onClick={() => onSetFacing(((facing ?? 0) + 5) % 6)}
          style={rotateBtnStyle}
        >
          ↺
        </button>
        <span style={{ minWidth: 24, textAlign: 'center' }}>
          {facing !== null ? HEX_FACING_LABELS[facing] : '—'}
        </span>
        <button
          onClick={() => onSetFacing(((facing ?? 0) + 1) % 6)}
          style={rotateBtnStyle}
        >
          ↻
        </button>
        <span>facing</span>
        <V2Badge />
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

      {isMonster && (
        <div style={{ marginTop: 8 }}>
          <label
            htmlFor="db-targeting"
            style={{ display: 'flex', alignItems: 'center', fontSize: 11 }}
          >
            targeting
            <V2Badge />
          </label>
          <select
            id="db-targeting"
            value={targeting ?? ''}
            onChange={(e) => onSetTargeting(e.target.value || null)}
            style={{
              marginTop: 4,
              width: '100%',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 4,
              padding: '3px 6px',
              fontSize: 12,
            }}
          >
            {TARGETING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 10, color: '#8a7a5a', marginTop: 3 }}>
            a reference to a toolkit AI strategy — the builder sets the key, the
            toolkit's monster decision chain would give it meaning
          </div>
        </div>
      )}

      {isWallMountable && (
        <div style={{ marginTop: 8 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11,
            }}
          >
            <input
              type="checkbox"
              id="db-chk-mount"
              checked={mount === 'wall'}
              onChange={(e) =>
                onSetMount(e.target.checked ? 'wall' : 'floor', height ?? 2.0)
              }
            />
            <label
              htmlFor="db-chk-mount"
              style={{ display: 'flex', alignItems: 'center' }}
            >
              wall-mounted
              <V2Badge />
            </label>
          </div>
          {mount === 'wall' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 6,
              }}
            >
              <label htmlFor="db-height" style={{ fontSize: 11 }}>
                height (m)
              </label>
              <input
                id="db-height"
                type="number"
                step={0.1}
                min={0}
                value={height ?? 2.0}
                onChange={(e) =>
                  onSetMount('wall', Number(e.target.value) || 0)
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
          )}
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

const rotateBtnStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 4,
  width: 22,
  height: 22,
  cursor: 'pointer',
};
