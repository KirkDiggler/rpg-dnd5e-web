/**
 * Inspector — the selected placement's flag controls. Ref-type-gated:
 * blocks_movement/blocks_los are live checkboxes for props, disabled/gray
 * for monsters (dungeonspec.Validate rejects both on monster placements —
 * an original concept constraint). Also the entrance-blocked warning, the single most
 * persuasive interaction in the standalone concept (see CONTRACT.md).
 *
 * Target-dialect, proposed controls (TARGET-YAML.md's "z-axis" and
 * "Monster targeting" sections), all badged: a targeting dropdown for
 * any monster placement (boss or general); a wall-mount checkbox for
 * the one palette ref this round judged cheap enough to wire up
 * (`WALL_MOUNTABLE_REFS` — `dnd5e:props:wall-banner`, the only ref in
 * this palette whose own name says "wall"); and — DECOUPLED from mount
 * (Kirk-batch, 2026-08-02: "height: decouples from mount... any
 * placement may carry height (floating candles); mount:wall remains the
 * wall-flush case") — a height field available for ANY non-monster
 * placement, not gated to `WALL_MOUNTABLE_REFS`. None of these reach
 * `PutDungeon` — `stripToV1Subset` drops them all before any real save,
 * same as every other target-dialect field.
 */
import { HEX_FACING_LABELS } from '@/components/hex-grid/authorGridHelpers';
import type { FloorPlan } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import {
  isCellOccupied,
  neighborCell,
  roomAtColumn,
  stepWallFacing,
  wallBearingFacings,
} from './boardGeometry';
import { resolvePlacement, type DungeonDoc, type Mount } from './dungeonYaml';
import type { PlacementSelection } from './types';

/** Wall-mountable props this round wires the `mount:` checkbox UI up
 * for — deliberately small. `dnd5e:props:wall-banner` is the only
 * palette ref whose own name says "wall" — not a general "any prop can
 * mount on a wall" affordance. Does NOT gate the height field anymore
 * (Kirk-batch, 2026-08-02 decoupling — see this file's own header doc
 * comment): height is available for any non-monster placement,
 * `mount`'s own gate stays this small on purpose. */
const WALL_MOUNTABLE_REFS = new Set<string>(['dnd5e:props:wall-banner']);

const TARGETING_OPTIONS = [
  { value: '', label: '(none)' },
  { value: 'lowest-health', label: 'lowest-health' },
  { value: 'lowest-ac', label: 'lowest-ac' },
  { value: 'closest', label: 'closest' },
];

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

/** One step more provisional than `TargetDialectBadge` — not even a
 * target-dialect PROPOSAL yet, a probe testing an open question
 * (TARGET-YAML.md's "is 6-direction hex facing too coarse" section).
 * Kirk's 2026-08-02 "3D editing" arc, part 2 follow-up: "this is how the
 * open... question gets ANSWERED by feel instead of debated." Distinct
 * color from the dialect badge so a reader never mistakes a probe for a
 * real proposal, even at a glance. */
function ExperimentBadge() {
  return (
    <span
      title="experiment, not a dialect proposal — testing whether 6-direction facing is coarse enough that wall-mounted props need finer control. Not compiled server-side; see TARGET-YAML.md's open question."
      style={{
        fontSize: 9,
        color: '#8fe8e0',
        background: '#0f2a28',
        border: '1px solid #2a5a54',
        borderRadius: 3,
        padding: '1px 5px',
        marginLeft: 6,
      }}
    >
      experiment
    </span>
  );
}

/** A field is showing its ref's `defaults:` entry (target dialect,
 * proposed — `resolvePlacement`'s own doc comment), not a value set on
 * this placement itself. Distinct, muted color from both badges above so
 * "this construct isn't compiled yet" (dialect/experiment) and "this
 * VALUE isn't this instance's own" (inherited) never get visually
 * conflated — a field can be target-dialect AND inherited at once
 * (height, facing, targeting all are), and a reader needs to tell the
 * two facts apart. */
function InheritedTag() {
  return (
    <span
      title="following this ref's dungeon-wide default (defaults:, target dialect, proposed) — not set on this placement itself"
      style={{
        fontSize: 9,
        fontStyle: 'italic',
        color: '#8a7a5a',
        background: '#2a2015',
        border: '1px solid #4a3a1f',
        borderRadius: 3,
        padding: '1px 5px',
        marginLeft: 6,
      }}
    >
      inherited
    </span>
  );
}

/** Clears this placement's own explicit override for one field, falling
 * back to its ref's `defaults:` entry — only ever rendered when an
 * explicit value AND a ref default both exist (otherwise there is
 * nothing to revert TO, or nothing to revert FROM). See
 * `clearPlacementFlag`'s doc comment in dungeonYaml.ts for why
 * blocks_movement/blocks_los route through a dedicated clear rather than
 * `onSetFlags`. */
function RevertToDefaultButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="clear this placement's own value and fall back to the ref's default"
      style={{
        marginLeft: 6,
        fontSize: 9,
        background: 'transparent',
        color: '#8fe8e0',
        border: '1px solid #2a5a54',
        borderRadius: 3,
        padding: '0 5px',
        cursor: 'pointer',
      }}
    >
      revert to default
    </button>
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
  /** Revert-to-default for blocks_movement/blocks_los (`defaults:`,
   * target dialect, proposed) — deletes the key so the placement goes
   * back to inheriting its ref's default, rather than re-setting it to
   * match that default's current value. See `clearPlacementFlag`'s own
   * doc comment. */
  onClearFlag: (flag: 'blocksMovement' | 'blocksLos') => void;
  onDelete: () => void;
  onSetMount: (mount: Mount) => void;
  /** DECOUPLED from `onSetMount` (Kirk-batch, 2026-08-02 — see
   * `setPlacementHeight`'s own doc comment): any non-monster placement
   * can carry height, not just a `mount: wall` one. `null` clears it. */
  onSetHeight: (height: number | null) => void;
  onSetTargeting: (targeting: string | null) => void;
  onSetFacing: (facing: number | null) => void;
  /** EXPERIMENT — see `ExperimentBadge`'s own doc comment. `null`/`0`
   * both mean "no fine adjustment," matching
   * `setPlacementRotationDegrees`'s own clear-on-zero convention (a 0°
   * nudge and no nudge render identically, so there is no reason to
   * distinguish them in the document). */
  onSetRotationDegrees: (rotationDegrees: number | null) => void;
  /** Wall-mount edge-selection rework, part 2 (Kirk's 2026-08-02 "flush
   * with a wall on one side but not the other" finding) — move the
   * selected `mount: wall` placement to the wall's far cell, mirroring
   * facing so it stays flush against the SAME wall, just hung from the
   * other side. The Inspector computes `flipTarget` itself (it already
   * has `doc`+`floorPlan`) and only ever calls this with a validated
   * target — optional so a caller that doesn't wire it (creation mode,
   * which has no `floorPlan` to validate against) simply never shows the
   * button as enabled. */
  onFlipMountSide?: (target: {
    roomId: string;
    at: [number, number];
    newFacing: number;
  }) => void;
}

export function Inspector({
  doc,
  floorPlan,
  selected,
  onSetFlags,
  onClearFlag,
  onDelete,
  onSetMount,
  onSetHeight,
  onSetTargeting,
  onSetFacing,
  onSetRotationDegrees,
  onFlipMountSide,
}: InspectorProps) {
  if (!selected) return null;
  // Three shapes to resolve, not two: boss (always room-scoped — a real
  // room lookup), a room-scoped place: entry (selected.roomId a real
  // id), or a TOP-LEVEL place: entry (selected.roomId === null,
  // doc.place[selected.index] directly — no room to look up at all).
  // Requiring a room match unconditionally here was the actual bug this
  // shape was written to fix: a top-level selection's `doc.rooms.find(r
  // => r.id === null)` always misses (there may be zero rooms), which
  // silently returned null — no dialog, no error — for every top-level
  // placement. See CONTRACT.md's "top-level placement" section.
  const room = selected.roomId
    ? doc.rooms.find((r) => r.id === selected.roomId)
    : undefined;
  if (selected.roomId && !room) return null;
  const placement = selected.boss
    ? undefined
    : room
      ? room.place[selected.index]
      : doc.place[selected.index];
  const boss = selected.boss ? room?.boss : undefined;

  // Boss is always a monster ref (flags never apply); a place: entry
  // carries its own isMonster/blocksMovement/blocksLos already resolved
  // by dungeonYaml.ts's parser.
  const ref = selected.boss ? boss?.ref : placement?.ref;
  const at = selected.boss ? boss?.at : placement?.at;
  if (!ref || !at) return null;
  const isMonster = selected.boss ? true : (placement?.isMonster ?? true);
  // `defaults:` (target dialect, proposed — see `resolvePlacement`'s own
  // doc comment) resolves a PLACEMENT's inherited fields; a boss entry is
  // deliberately excluded (TARGET-YAML.md's "defaults:" section records
  // "does defaults apply to boss?" as an open question, not decided
  // here) — a boss's own facing/targeting below stay direct reads of
  // `BossDoc`, exactly as before this feature existed.
  const resolved =
    !selected.boss && placement ? resolvePlacement(doc, placement) : undefined;
  const refDefaults = !selected.boss ? doc.defaults[ref] : undefined;
  const blocksMovement = selected.boss
    ? false
    : (resolved?.blocksMovement ?? false);
  const blocksLos = selected.boss ? false : (resolved?.blocksLos ?? false);
  // target dialect — mount/height don't exist on a boss entry (bosses
  // aren't wall furniture); targeting/facing exist on both. `mount` is
  // NOT resolved — it is deliberately not a defaultable field at all
  // (`DungeonDoc.defaults`'s own doc comment: which wall edge a mount
  // uses is a property of the specific cell, not the ref).
  const mount = selected.boss ? 'floor' : (placement?.mount ?? 'floor');
  const height = selected.boss ? null : (resolved?.height ?? null);
  const rotationDegrees = selected.boss
    ? null
    : (placement?.rotationDegrees ?? null);
  const targeting = selected.boss
    ? (boss?.targeting ?? null)
    : (resolved?.targeting ?? null);
  const facing = selected.boss
    ? (boss?.facing ?? null)
    : (resolved?.facing ?? null);
  const isWallMountable = !selected.boss && WALL_MOUNTABLE_REFS.has(ref);

  // Which fields are showing an INHERITED value right now (muted +
  // "inherited" tag below), and which can be REVERTED to that default
  // (an explicit value on this placement AND a default on its ref both
  // exist — otherwise there's nothing to revert to, or nothing to revert
  // from). Both stay all-false for a boss selection (see above).
  const inherited = resolved?.inheritedFrom ?? {
    blocksMovement: false,
    blocksLos: false,
    height: false,
    facing: false,
    targeting: false,
  };
  const canRevert = selected.boss
    ? {
        blocksMovement: false,
        blocksLos: false,
        height: false,
        facing: false,
        targeting: false,
      }
    : {
        blocksMovement:
          !!placement?.explicit.blocksMovement &&
          refDefaults?.blocksMovement !== undefined,
        blocksLos:
          !!placement?.explicit.blocksLos &&
          refDefaults?.blocksLos !== undefined,
        height:
          !!placement?.explicit.height && refDefaults?.height !== undefined,
        facing:
          !!placement?.explicit.facing && refDefaults?.facing !== undefined,
        targeting:
          !!placement?.explicit.targeting &&
          refDefaults?.targeting !== undefined,
      };

  const fpRoom = selected.roomId
    ? floorPlan?.rooms.find((r) => r.id === selected.roomId)
    : undefined;
  const absCol = (fpRoom?.startColumn ?? 0) + at[0];
  const row = at[1];
  const onEntrance =
    !!floorPlan?.entrance &&
    floorPlan.entrance.column === absCol &&
    floorPlan.entrance.row === row &&
    blocksMovement;

  // Wall-mount edge-selection rework (Kirk's 2026-08-02 "I can only line
  // up 1 direction — flush with a wall on one side but not the other"
  // finding). Computed for every selection (not gated on mount === 'wall'
  // up front) so `bearingFacings.length` can also inform the honest hint
  // shown below the facing control. Works identically in creation mode
  // (`floorPlan` undefined) since `absCol`/`row` above already resolve
  // correctly there — this only ever reads `doc.walls`, never floorPlan.
  const bearingFacings =
    mount === 'wall' ? wallBearingFacings(doc.walls, absCol, row) : [];

  // "Flip to other side" (same finding, part 2): move this mount to the
  // wall's far cell and mirror facing, one click instead of
  // delete-and-replace. Needs `floorPlan` to validate the far cell is a
  // real floor cell in bounds — creation mode has no FloorPlan at all
  // (CreationConcept.tsx's own doc comment), so this is edit-mode only
  // for its first landing; `flipTarget` stays `null` there and the
  // button shows an honest disabled tooltip rather than guessing at
  // canvas-mode validity.
  const flipTarget = (() => {
    if (!floorPlan || mount !== 'wall' || facing === null || selected.boss) {
      return null;
    }
    const n = neighborCell(absCol, row, facing);
    if (n.row === floorPlan.doorRow || n.row < 0 || n.row >= floorPlan.height) {
      return null;
    }
    const nRoom = roomAtColumn(floorPlan, n.col);
    if (!nRoom) return null;
    if (doc.holes.some(([hc, hr]) => hc === n.col && hr === n.row)) {
      return null;
    }
    if (isCellOccupied(floorPlan, doc, n.col, n.row)) return null;
    return {
      roomId: nRoom.id,
      at: [n.col - nRoom.startColumn, n.row] as [number, number],
      newFacing: (facing + 3) % 6,
    };
  })();

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
          opacity: inherited.facing ? 0.65 : 1,
        }}
      >
        <button
          onClick={() =>
            onSetFacing(
              mount === 'wall'
                ? stepWallFacing(facing, bearingFacings, -1)
                : ((facing ?? 0) + 5) % 6
            )
          }
          style={rotateBtnStyle}
        >
          ↺
        </button>
        <span style={{ minWidth: 24, textAlign: 'center' }}>
          {facing !== null ? HEX_FACING_LABELS[facing] : '—'}
        </span>
        <button
          onClick={() =>
            onSetFacing(
              mount === 'wall'
                ? stepWallFacing(facing, bearingFacings, 1)
                : ((facing ?? 0) + 1) % 6
            )
          }
          style={rotateBtnStyle}
        >
          ↻
        </button>
        <span>facing</span>
        <TargetDialectBadge />
        {inherited.facing && <InheritedTag />}
        {canRevert.facing && (
          <RevertToDefaultButton onClick={() => onSetFacing(null)} />
        )}
      </div>

      {mount === 'wall' && (
        <div style={{ fontSize: 10, color: '#8a7a5a', margin: '-2px 0 6px' }}>
          {bearingFacings.length > 0 ? (
            <>
              stepping cycles this cell's {bearingFacings.length} wall
              {bearingFacings.length === 1 ? '' : 's'} only — flush by
              construction
            </>
          ) : (
            'no wall on this cell yet — stepping cycles all 6 directions'
          )}
          {onFlipMountSide && (
            <button
              onClick={() => flipTarget && onFlipMountSide(flipTarget)}
              disabled={!flipTarget}
              title={
                flipTarget
                  ? "move to the wall's far side, mirroring facing"
                  : !floorPlan
                    ? 'not available in New Dungeon mode yet (no compiled floor plan to validate against)'
                    : "the wall's far cell is out of bounds, not a floor cell, or already occupied"
              }
              style={{
                marginLeft: 8,
                fontSize: 10,
                background: 'transparent',
                color: flipTarget ? '#8fe8e0' : '#5a4f42',
                border: `1px solid ${flipTarget ? '#2a5a54' : '#3a332c'}`,
                borderRadius: 3,
                padding: '1px 6px',
                cursor: flipTarget ? 'pointer' : 'not-allowed',
              }}
            >
              flip to other side
            </button>
          )}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: '6px 0',
          opacity: isMonster ? 0.5 : inherited.blocksMovement ? 0.65 : 1,
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
        {!isMonster && inherited.blocksMovement && <InheritedTag />}
        {!isMonster && canRevert.blocksMovement && (
          <RevertToDefaultButton
            onClick={() => onClearFlag('blocksMovement')}
          />
        )}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: '6px 0',
          opacity: isMonster ? 0.5 : inherited.blocksLos ? 0.65 : 1,
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
        {!isMonster && inherited.blocksLos && <InheritedTag />}
        {!isMonster && canRevert.blocksLos && (
          <RevertToDefaultButton onClick={() => onClearFlag('blocksLos')} />
        )}
      </div>

      {!isMonster && (
        <div style={{ marginTop: 8, opacity: inherited.height ? 0.65 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="db-chk-height"
              checked={height !== null}
              // Unchecking while INHERITED is a documented no-op (nothing
              // explicit to delete yet — see TARGET-YAML.md's "defaults:"
              // section, "reverting a field with no explicit-null
              // sentinel"): the value keeps following the ref default
              // until either overridden (type a new number below) or the
              // default itself changes. This never corrupts state, it's
              // just not a way to say "explicitly no height" while a
              // default is active.
              onChange={(e) => onSetHeight(e.target.checked ? 0.5 : null)}
            />
            <label
              htmlFor="db-chk-height"
              style={{ display: 'flex', alignItems: 'center', fontSize: 11 }}
            >
              height (m)
              <TargetDialectBadge />
              {inherited.height && <InheritedTag />}
              {canRevert.height && (
                <RevertToDefaultButton onClick={() => onSetHeight(null)} />
              )}
            </label>
          </div>
          {/* DECOUPLED from mount (Kirk-batch, 2026-08-02: "height:
              decouples from mount... any placement may carry height
              (floating candles); mount:wall remains the wall-flush
              case") — available for any non-monster placement, not
              gated on `isWallMountable`. A wall-mounted prop typically
              still wants one (how far up the wall), but so does a
              floor-standing floating decoration with
              blocks_movement:false — this is the SAME field, meaning
              "wall clearance" alongside mount:wall and "float height"
              otherwise, set independently either way. */}
          {height !== null && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 6,
              }}
            >
              <input
                id="db-height-value"
                type="number"
                step={0.1}
                min={0}
                value={height}
                onChange={(e) => onSetHeight(Number(e.target.value) || 0)}
                style={{
                  width: 60,
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 4,
                  padding: '2px 6px',
                }}
              />
              {mount !== 'wall' && (
                <span style={{ fontSize: 10, color: '#8a7a5a' }}>
                  floats above the floor — pair with blocks_movement off to keep
                  it passable
                </span>
              )}
            </div>
          )}
        </div>
      )}

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
        <div style={{ marginTop: 8, opacity: inherited.targeting ? 0.65 : 1 }}>
          <label
            htmlFor="db-targeting"
            style={{ display: 'flex', alignItems: 'center', fontSize: 11 }}
          >
            targeting
            <TargetDialectBadge />
            {inherited.targeting && <InheritedTag />}
            {canRevert.targeting && (
              <RevertToDefaultButton onClick={() => onSetTargeting(null)} />
            )}
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
              onChange={(e) => onSetMount(e.target.checked ? 'wall' : 'floor')}
            />
            <label
              htmlFor="db-chk-mount"
              style={{ display: 'flex', alignItems: 'center' }}
            >
              wall-mounted
              <TargetDialectBadge />
            </label>
          </div>
          {mount === 'wall' && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <label
                  htmlFor="db-rotation-degrees"
                  style={{ display: 'flex', alignItems: 'center' }}
                >
                  fine rotation
                </label>
                <ExperimentBadge />
              </div>
              {/* ±30° — half of one 6-direction step either way, so this
                  fully covers the worst case a coarse facing pick can be
                  off by. `facing` (above) still picks the wall; this
                  nudges the exact angle against it. Kirk's own framing:
                  "present BOTH granularities... so Kirk can feel them
                  side by side on the same banner — that comparison IS
                  the experiment." */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 4,
                }}
              >
                <input
                  id="db-rotation-degrees"
                  type="range"
                  min={-30}
                  max={30}
                  step={1}
                  value={rotationDegrees ?? 0}
                  onChange={(e) =>
                    onSetRotationDegrees(Number(e.target.value) || null)
                  }
                  style={{ flex: 1 }}
                />
                <span style={{ minWidth: 34, textAlign: 'right' }}>
                  {rotationDegrees ?? 0}°
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#8a7a5a', marginTop: 3 }}>
                added on top of facing's coarse pick — testing whether
                6-direction facing alone is enough, or wall-mounted props need
                finer control (TARGET-YAML.md's open question)
              </div>
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
