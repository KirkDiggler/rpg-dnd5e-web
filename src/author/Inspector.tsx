/**
 * Inspector — the right column's top half (design §1): whichever of the
 * dungeon, a region, a door or a placement is selected. Every field here
 * writes straight into the document; the YAML pane below it is the
 * read-only mirror.
 */
import { FACING_NAMES, facingAngleDeg } from '@/components/hex-grid/facingYaw';
import type { FieldError } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useState } from 'react';
import type { ScenariosState } from './authoringRpc';
import {
  floorKeys,
  isMonsterRef,
  placementIds,
  suggestPlacementId,
  wallLattice,
  type ApproachDoc,
  type CheckDoc,
  type ConcealmentDerivation,
  type DoorDoc,
  type DungeonDoc,
  type ExitDoc,
  type PlacementDoc,
  type PlacementOffset,
  type WallDoc,
} from './dungeonYaml';
import { sealedBy } from './hexGeometry';
import { axialKey } from './hexOffset';
import { RegionPanel } from './RegionPanel';
import { ScenarioPanel } from './ScenarioPanel';
import { APPROACH_ABILITIES, TARGETINGS, type Selection } from './types';

export interface InspectorProps {
  doc: DungeonDoc;
  selection: Selection;
  /** The current door-links-to-region derivation (rpg-dnd5e-web#893) —
   * which regions the concealed doors currently explain, so the region
   * panel can lock the checkbox and name the door. */
  concealment: ConcealmentDerivation;
  onDungeon: (
    patch: Partial<Pick<DungeonDoc, 'key' | 'name' | 'void'>>
  ) => void;
  onRegion: (
    id: string,
    patch: Partial<
      Pick<
        DungeonDoc['regions'][number],
        'id' | 'name' | 'archetype' | 'lighting' | 'concealed'
      >
    >
  ) => void;
  onRemoveRegion: (id: string) => void;
  onDoor: (
    id: string,
    patch: Partial<Pick<DoorDoc, 'id' | 'closed' | 'locked' | 'concealed'>>
  ) => void;
  onRemoveDoor: (id: string) => void;
  onPlacement: (
    index: number,
    patch: Partial<Omit<PlacementDoc, 'ref' | 'at'>>
  ) => void;
  onRemovePlacement: (index: number) => void;
  /** Rename one way out. */
  onExit: (index: number, patch: Partial<Pick<ExitDoc, 'id'>>) => void;
  onRemoveExit: (index: number) => void;
  /** Bind one blank on one scenario's form; an empty value unbinds it. */
  onBindScenario: (scenarioId: string, key: string, value: string) => void;
  /** What `ListScenarios` answered — the forms this dungeon may fill in. */
  scenarios: ScenariosState;
  /** The compiler's current refusals, whole. The scenario form picks out
   * the ones addressed to its own blanks. */
  errors: readonly FieldError[];
  /** Delete the selected wall. */
  onRemoveWall: (index: number) => void;
  /** Stamp a height on the selected wall. A wall is one line and one
   * height by construction, so nothing splits any more. */
  onSetWallHeight: (index: number, height: number | undefined) => void;
  /** Name the selected wall. */
  onSetWallName: (index: number, name: string) => void;
}

export function Inspector(props: InspectorProps) {
  const { doc, selection } = props;
  if (selection.kind === 'region') {
    const region = doc.regions.find((r) => r.id === selection.id);
    if (!region) return <DungeonPanel {...props} />;
    return (
      <RegionPanel
        region={region}
        takenIds={
          new Set(
            doc.regions.filter((r) => r.id !== region.id).map((r) => r.id)
          )
        }
        isDerived={!!props.concealment.regionIds?.has(region.id)}
        derivedByDoorId={props.concealment.doorByRegion.get(region.id)}
        onChange={(patch) => props.onRegion(region.id, patch)}
        onRemove={() => props.onRemoveRegion(region.id)}
      />
    );
  }
  if (selection.kind === 'door') {
    const door = doc.doors.find((d) => d.id === selection.id);
    if (!door) return <DungeonPanel {...props} />;
    return (
      <DoorPanel
        door={door}
        onChange={(p) => props.onDoor(door.id, p)}
        onRemove={() => props.onRemoveDoor(door.id)}
      />
    );
  }
  if (selection.kind === 'wall') {
    // A wall is an entry in the file, so the selection is its index. A
    // deleted wall's index falls back to the dungeon panel rather than
    // showing the wall that slid into its place.
    const wall = doc.walls[selection.index];
    if (!wall) return <DungeonPanel {...props} />;
    return (
      <WallPanel
        index={selection.index}
        wall={wall}
        sealed={sealedByWall(doc, selection.index)}
        onHeight={(h) => props.onSetWallHeight(selection.index, h)}
        onName={(n) => props.onSetWallName(selection.index, n)}
        onRemove={() => props.onRemoveWall(selection.index)}
      />
    );
  }
  if (selection.kind === 'placement') {
    const placement = doc.place[selection.index];
    if (!placement) return <DungeonPanel {...props} />;
    return (
      <PlacementPanel
        key={selection.index}
        doc={doc}
        index={selection.index}
        placement={placement}
        onChange={(p) => props.onPlacement(selection.index, p)}
        onRemove={() => props.onRemovePlacement(selection.index)}
      />
    );
  }
  if (selection.kind === 'exit') {
    const exit = doc.exits[selection.index];
    if (!exit) return <DungeonPanel {...props} />;
    return (
      <ExitPanel
        key={selection.index}
        exit={exit}
        takenIds={
          new Set(
            doc.exits.filter((_, i) => i !== selection.index).map((e) => e.id)
          )
        }
        onChange={(p) => props.onExit(selection.index, p)}
        onRemove={() => props.onRemoveExit(selection.index)}
      />
    );
  }
  return <DungeonPanel {...props} />;
}

function DungeonPanel(props: InspectorProps) {
  const { doc, onDungeon } = props;
  return (
    <div className="flex flex-col gap-3" data-testid="dungeon-panel">
      <h3 className="dg-h">Dungeon</h3>
      <label className="dg-label">
        key
        <input
          className="dg-input"
          value={doc.key}
          onChange={(e) =>
            onDungeon({
              key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            })
          }
        />
      </label>
      <label className="dg-label">
        name
        <input
          className="dg-input"
          value={doc.name}
          onChange={(e) => onDungeon({ name: e.target.value })}
        />
      </label>
      <div className="dg-label">
        orientation
        <div className="dg-input opacity-80">
          {doc.orientation} (set at New)
        </div>
      </div>
      <label className="dg-label">
        void
        <select
          className="dg-input"
          value={doc.void}
          onChange={(e) =>
            onDungeon({ void: e.target.value as DungeonDoc['void'] })
          }
        >
          <option value="opaque">opaque</option>
          <option value="transparent">transparent</option>
        </select>
      </label>
      <div className="text-xs opacity-70">
        {doc.regions.reduce((n, r) => n + r.cells.length, 0) +
          doc.scenery.length}{' '}
        floor cells · {doc.walls.length} walls · {doc.doors.length} doors ·{' '}
        {doc.place.length} placed · {doc.exits.length} way
        {doc.exits.length === 1 ? '' : 's'} out
      </div>
      {/* The scenario form lives on the DUNGEON, because that is whose
          fact a binding is — a dungeon is bound to a scenario, not a room
          or a monster. */}
      <ScenarioPanel
        doc={doc}
        state={props.scenarios}
        errors={props.errors}
        onBind={props.onBindScenario}
      />
    </div>
  );
}

/** A way out: its name, and the cell it stands on. The id is what a
 * scenario's form binds to, so renaming one here is renaming the thing the
 * form points at — a duplicate is refused in place, naming the exit that
 * already has it, rather than being written and bounced by the compiler. */
function ExitPanel({
  exit,
  takenIds,
  onChange,
  onRemove,
}: {
  exit: ExitDoc;
  takenIds: ReadonlySet<string>;
  onChange: (patch: Partial<Pick<ExitDoc, 'id'>>) => void;
  onRemove: () => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? exit.id;
  const clash = typed !== null && takenIds.has(typed);
  return (
    <div className="flex flex-col gap-3" data-testid="exit-panel">
      <h3 className="dg-h">Way out</h3>
      <label className="dg-label">
        id
        <input
          className="dg-input"
          data-testid="exit-id"
          aria-label="exit id"
          value={shown}
          onChange={(e) => {
            const next = e.target.value;
            setTyped(next);
            if (!takenIds.has(next)) {
              onChange({ id: next });
              setTyped(null);
            }
          }}
        />
        {clash ? (
          <div className="text-xs" data-testid="exit-id-refusal">
            another way out is already called &quot;{typed}&quot; — two exits
            cannot share a name, because a scenario binds to one of them
          </div>
        ) : (
          <div className="text-xs opacity-70">
            What the scenario form calls this way out.
          </div>
        )}
      </label>
      <div className="text-xs opacity-50" data-testid="exit-at">
        at {exit.at.q},{exit.at.r}
      </div>
      <button type="button" className="dg-mini dg-danger" onClick={onRemove}>
        remove way out
      </button>
    </div>
  );
}

/** The cells this one wall seals, for the panel's cost line. */
function sealedByWall(doc: DungeonDoc, index: number): number {
  const wall = doc.walls[index];
  if (!wall) return 0;
  const floor = floorKeys(doc);
  const { a, b } = wallLattice(doc.orientation, wall);
  return sealedBy(doc.orientation, a, b).filter((c) => floor.has(axialKey(c)))
    .length;
}

function WallPanel({
  index,
  wall,
  sealed,
  onHeight,
  onName,
  onRemove,
}: {
  index: number;
  wall: WallDoc;
  /** How many floor cells this wall seals on its own — its COST, in the
   * same words the picker used before the author committed. */
  sealed: number;
  onHeight: (height: number | undefined) => void;
  onName: (name: string) => void;
  onRemove: () => void;
}) {
  const clamp = (v: number) => Math.min(3, Math.max(1, v));
  const spell = (p: WallDoc['start']) =>
    `[${p.offset[0]}, ${p.offset[1]}] of ${p.cell.q},${p.cell.r}`;
  return (
    <div className="flex flex-col gap-3" data-testid="wall-panel">
      <h3 className="dg-h">{wall.name || `Wall ${index + 1}`}</h3>
      <div className="text-xs opacity-70" data-testid="wall-cost">
        {sealed === 0
          ? 'Thin — it shaves the cells it passes and seals none of them.'
          : `Thick — it runs through ${sealed} cell${
              sealed === 1 ? "'s" : "s'"
            } centre${sealed === 1 ? '' : 's'}, so ${
              sealed === 1 ? 'that cell is' : 'those cells are'
            } floor nobody stands on.`}
      </div>
      <div className="dg-label">
        name
        <input
          className="dg-input"
          data-testid="wall-name"
          aria-label="wall name"
          value={wall.name ?? ''}
          placeholder="north wall"
          onChange={(e) => onName(e.target.value)}
        />
        <div className="text-xs opacity-70">
          For you and for the errors about it — &quot;north wall&quot; beats
          &quot;walls[7]&quot;.
        </div>
      </div>
      <div className="dg-label">
        height
        <div className="flex gap-2 items-end">
          <input
            className="dg-input flex-1"
            data-testid="wall-height"
            aria-label="wall height multiplier"
            type="number"
            min={1}
            max={3}
            step={0.5}
            value={wall.height ?? 1}
            onChange={(e) => {
              const v = clamp(Number(e.target.value) || 1);
              onHeight(v === 1 ? undefined : v);
            }}
          />
          <button
            type="button"
            className="dg-mini"
            data-testid="wall-height-standard"
            onClick={() => onHeight(undefined)}
          >
            standard
          </button>
        </div>
        <div className="text-xs opacity-70">
          × standard wall height, 1–3. Raise-only; visual only — a wall blocks
          (and cannot be seen past) the same at any height.
        </div>
      </div>
      <div className="text-xs opacity-50" data-testid="wall-ends">
        {spell(wall.start)} → {spell(wall.end)}
      </div>
      <button type="button" className="dg-mini dg-danger" onClick={onRemove}>
        delete wall
      </button>
    </div>
  );
}

/** One `{ ability, tool?, dc }` row-editor for a `CheckDoc` — shared by
 * a door's lock and its find check (rpg-project#350/#886): both are the
 * same approach-list shape, success by any listed row. The last row
 * can't be removed while the check is on: an authored-but-empty check is
 * refused server-side (dungeonspec's "at least one approach" law), and
 * this control never authors that state through normal use — turning
 * the check off entirely is the caller's job (the state select / the
 * concealed checkbox), not a side effect of deleting rows here. */
function ApproachRows({
  approaches,
  onChange,
  testIdPrefix,
  defaultAbility,
}: {
  approaches: CheckDoc;
  onChange: (next: CheckDoc) => void;
  testIdPrefix: string;
  defaultAbility: string;
}) {
  const patchRow = (i: number, patch: Partial<ApproachDoc>) =>
    onChange(
      approaches.map((row, j) => (j === i ? { ...row, ...patch } : row))
    );
  return (
    <div className="flex flex-col gap-2">
      {approaches.map((a, i) => (
        <div
          key={i}
          className="flex gap-2 items-end"
          data-testid={`${testIdPrefix}-approach-${i}`}
        >
          <label className="dg-label flex-1">
            ability
            <select
              className="dg-input"
              value={a.ability}
              onChange={(e) => patchRow(i, { ability: e.target.value })}
            >
              {!APPROACH_ABILITIES.includes(a.ability as never) && (
                <option value={a.ability}>{a.ability || '(none)'}</option>
              )}
              {APPROACH_ABILITIES.map((ab) => (
                <option key={ab} value={ab}>
                  {ab}
                </option>
              ))}
            </select>
          </label>
          <label className="dg-label flex-1">
            tool
            <input
              className="dg-input"
              placeholder="(none)"
              value={a.tool ?? ''}
              onChange={(e) => {
                const tool = e.target.value;
                if (tool) {
                  patchRow(i, { tool });
                  return;
                }
                const rest: ApproachDoc = {
                  ability: a.ability,
                  dc: a.dc,
                };
                onChange(approaches.map((row, j) => (j === i ? rest : row)));
              }}
            />
          </label>
          <label className="dg-label" style={{ width: '5rem' }}>
            dc
            <input
              className="dg-input"
              type="number"
              min={1}
              value={a.dc}
              onChange={(e) => patchRow(i, { dc: Number(e.target.value) || 0 })}
            />
          </label>
          <button
            type="button"
            className="dg-mini dg-danger"
            aria-label="remove approach"
            disabled={approaches.length <= 1}
            onClick={() => onChange(approaches.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="dg-mini"
        data-testid={`${testIdPrefix}-add-approach`}
        onClick={() =>
          onChange([...approaches, { ability: defaultAbility, dc: 12 }])
        }
      >
        add an approach
      </button>
    </div>
  );
}

function DoorPanel({
  door,
  onChange,
  onRemove,
}: {
  door: DoorDoc;
  onChange: (
    patch: Partial<Pick<DoorDoc, 'id' | 'closed' | 'locked' | 'concealed'>>
  ) => void;
  onRemove: () => void;
}) {
  const state = door.locked ? 'locked' : door.closed ? 'closed' : 'open';
  return (
    <div className="flex flex-col gap-3" data-testid="door-panel">
      <h3 className="dg-h">Door</h3>
      <label className="dg-label">
        id
        <input
          className="dg-input"
          value={door.id}
          onChange={(e) => onChange({ id: e.target.value })}
        />
      </label>
      <div className="text-xs opacity-70" data-testid="door-crossing">
        One crossing — the side this position is the midpoint of. A wider
        doorway is a second door beside it.
      </div>
      <label className="dg-label">
        state
        <select
          className="dg-input"
          value={state}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'open') onChange({ closed: false, locked: undefined });
            else if (v === 'closed')
              onChange({ closed: true, locked: undefined });
            else
              onChange({
                closed: false,
                locked: door.locked ?? [{ ability: 'dex', dc: 12 }],
              });
          }}
        >
          <option value="open">open doorway</option>
          <option value="closed">closed</option>
          <option value="locked">locked</option>
        </select>
      </label>
      {door.locked && (
        <div className="flex flex-col gap-1">
          <div className="text-xs opacity-70">
            lock — success by any listed approach
          </div>
          <ApproachRows
            approaches={door.locked}
            onChange={(next) => onChange({ locked: next })}
            testIdPrefix="lock"
            defaultAbility="dex"
          />
        </div>
      )}
      <label className="dg-check">
        <input
          type="checkbox"
          checked={!!door.concealed}
          onChange={(e) =>
            onChange({
              concealed: e.target.checked
                ? (door.concealed ?? [{ ability: 'perception', dc: 15 }])
                : undefined,
            })
          }
        />
        concealed
      </label>
      {door.concealed && (
        <div className="flex flex-col gap-1">
          <div className="text-xs opacity-70">
            find check — success by any listed approach; unfound, the door is
            absent from a searcher's scene, masked as a wall
          </div>
          <ApproachRows
            approaches={door.concealed}
            onChange={(next) => onChange({ concealed: next })}
            testIdPrefix="find"
            defaultAbility="perception"
          />
        </div>
      )}
      <button type="button" className="dg-mini dg-danger" onClick={onRemove}>
        remove door
      </button>
    </div>
  );
}

function PlacementPanel({
  doc,
  index,
  placement,
  onChange,
  onRemove,
}: {
  doc: DungeonDoc;
  index: number;
  placement: PlacementDoc;
  onChange: (patch: Partial<Omit<PlacementDoc, 'ref' | 'at'>>) => void;
  onRemove: () => void;
}) {
  const monster = isMonsterRef(placement.ref);
  return (
    <div className="flex flex-col gap-3" data-testid="placement-panel">
      <h3 className="dg-h">{monster ? 'Monster' : 'Prop'}</h3>
      <div className="dg-label">
        ref
        <div className="dg-input opacity-80 break-all">{placement.ref}</div>
      </div>
      <IdControl
        doc={doc}
        index={index}
        placement={placement}
        onChange={(id) => onChange({ id })}
      />
      {monster ? (
        <>
          <KnowsControl
            doc={doc}
            knows={placement.knows}
            onChange={(knows) => onChange({ knows })}
          />
          <label className="dg-label">
            targeting
            <select
              className="dg-input"
              value={placement.targeting ?? ''}
              onChange={(e) => onChange({ targeting: e.target.value })}
            >
              <option value="">(default)</option>
              {TARGETINGS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="dg-check">
            <input
              type="checkbox"
              checked={!!placement.boss}
              onChange={(e) => onChange({ boss: e.target.checked })}
            />
            boss
          </label>
        </>
      ) : (
        <>
          <label className="dg-check">
            <input
              type="checkbox"
              checked={!!placement.blocksMovement}
              onChange={(e) => onChange({ blocksMovement: e.target.checked })}
            />
            blocks_movement
          </label>
          <label className="dg-check">
            <input
              type="checkbox"
              checked={!!placement.blocksLos}
              onChange={(e) => onChange({ blocksLos: e.target.checked })}
            />
            blocks_los
          </label>
          <div className="text-xs opacity-70">
            Prefilled from the catalog; always written explicitly.
          </div>
          <label className="dg-check">
            <input
              type="checkbox"
              data-testid="placement-holdable"
              checked={!!placement.holdable}
              disabled={!placement.id}
              onChange={(e) => onChange({ holdable: e.target.checked })}
            />
            holdable
          </label>
          <div className="text-xs opacity-70" data-testid="holdable-note">
            {placement.id
              ? 'A player standing beside it can pick it up, and a scenario can be about carrying it out.'
              : 'Give this prop an id first — a thing that can be picked up has to be nameable, because the scenario form and the beat both name it.'}
          </div>
          <FacingControl
            facing={placement.facing}
            onChange={(facing) => onChange({ facing })}
          />
          <OffsetControl
            offset={placement.offset}
            onChange={(offset) => onChange({ offset })}
          />
        </>
      )}
      <button type="button" className="dg-mini dg-danger" onClick={onRemove}>
        remove
      </button>
    </div>
  );
}

/**
 * The author's name for this placement (rpg-project#368 P2) — offered as a
 * slug from the ref, renamed freely, and REFUSED IN PLACE on a collision.
 *
 * The refusal is here rather than left to the compiler because an id is
 * what the scenario form and the pick-up verb point at: two placements
 * sharing one means the form is pointing at something ambiguous, and the
 * author should hear that while typing rather than after saving. The typed
 * text is held locally while it clashes, so what they see is what they
 * typed and the document keeps the name that still works.
 */
function IdControl({
  doc,
  index,
  placement,
  onChange,
}: {
  doc: DungeonDoc;
  index: number;
  placement: PlacementDoc;
  onChange: (id: string) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const taken = placementIds(doc);
  const clashIndex = typed ? taken.get(typed) : undefined;
  const clash =
    typed !== undefined &&
    typed !== null &&
    typed !== '' &&
    clashIndex !== undefined &&
    clashIndex !== index;
  const suggestion = suggestPlacementId(doc, placement.ref);
  return (
    <label className="dg-label">
      id
      <div className="flex gap-2 items-end">
        <input
          className="dg-input flex-1"
          data-testid="placement-id"
          aria-label="placement id"
          placeholder={suggestion}
          value={typed ?? placement.id ?? ''}
          onChange={(e) => {
            const next = e.target.value;
            setTyped(next);
            const owner = next ? taken.get(next) : undefined;
            if (owner === undefined || owner === index) {
              onChange(next);
              setTyped(null);
            }
          }}
        />
        <button
          type="button"
          className="dg-mini"
          data-testid="placement-id-suggest"
          onClick={() => {
            setTyped(null);
            onChange(suggestion);
          }}
        >
          call it {suggestion}
        </button>
      </div>
      {clash ? (
        <div className="text-xs" data-testid="placement-id-refusal">
          &quot;{typed}&quot; is already the name of{' '}
          {doc.place[clashIndex as number]?.ref} — two placements cannot share
          one, because a scenario binds to exactly one of them
        </div>
      ) : (
        <div className="text-xs opacity-70">
          Optional. Needed by whatever points at this: a scenario&apos;s form,
          or picking it up.
        </div>
      )}
    </label>
  );
}

/**
 * Which doors this monster knows about (rpg-project#368 P1) — a multi-pick
 * over the doors THIS dungeon declares, by id.
 *
 * Offered on monsters and not on props, which is the server's own rule
 * ("a prop is not a monster and holds nothing to know") expressed as an
 * absent control rather than a refusal after the fact. Knowing an ordinary
 * door is inert rather than wrong, so every door is listed — the concealed
 * ones are the interesting ones and the panel says which, but it refuses
 * nothing.
 */
function KnowsControl({
  doc,
  knows,
  onChange,
}: {
  doc: DungeonDoc;
  knows: string[] | undefined;
  onChange: (knows: string[]) => void;
}) {
  const picked = new Set(knows ?? []);
  return (
    <div className="dg-label" data-testid="knows-control">
      knows
      {doc.doors.length === 0 ? (
        <div className="text-xs opacity-70">
          this dungeon has no doors yet — a monster knows a door by its id
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {doc.doors.map((door) => (
            <label className="dg-check" key={door.id}>
              <input
                type="checkbox"
                data-testid={`knows-${door.id}`}
                checked={picked.has(door.id)}
                onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(door.id);
                  else next.delete(door.id);
                  // Emitted in the DOCUMENT's door order, not click order,
                  // so the file does not record the sequence somebody
                  // happened to tick the boxes in.
                  onChange(
                    doc.doors.filter((d) => next.has(d.id)).map((d) => d.id)
                  );
                }}
              />
              {door.id}
              {door.concealed && (
                <span className="opacity-60"> · concealed</span>
              )}
            </label>
          ))}
        </div>
      )}
      <div className="text-xs opacity-70">
        What this monster can be looted for. A concealed door it knows is the
        way in a party can take off its body.
      </div>
    </div>
  );
}

/** Eight fixed compass buttons — the rose does NOT rotate with the
 * dungeon's orientation, because the vocabulary is true compass in
 * world space (rpg-project#272; the SAME `facingAngleDeg` table the 2D
 * canvas tick and the 3D render use, so the compass points the same
 * way the placement actually renders). A center "none" button clears
 * to the asset's own default. */
function FacingControl({
  facing,
  onChange,
}: {
  facing?: string;
  onChange: (facing: string | undefined) => void;
}) {
  const names = FACING_NAMES;
  const radius = 34;
  return (
    <div className="dg-label">
      facing
      <div className="dg-facing-compass" data-testid="facing-compass">
        <button
          type="button"
          data-testid="facing-none"
          className={`dg-mini dg-facing-btn dg-facing-center${
            facing === undefined ? ' dg-tool--on' : ''
          }`}
          style={{ left: '50%', top: '50%' }}
          title="asset default"
          aria-label="facing: asset default"
          aria-pressed={facing === undefined}
          onClick={() => onChange(undefined)}
        >
          •
        </button>
        {names.map((name) => {
          const deg = facingAngleDeg(name) ?? 0;
          const rad = (deg * Math.PI) / 180;
          const left = `calc(50% + ${Math.cos(rad) * radius}px)`;
          const top = `calc(50% + ${Math.sin(rad) * radius}px)`;
          return (
            <button
              key={name}
              type="button"
              data-testid={`facing-${name}`}
              className={`dg-mini dg-facing-btn${
                facing === name ? ' dg-tool--on' : ''
              }`}
              style={{ left, top }}
              aria-label={`facing: ${name}`}
              aria-pressed={facing === name}
              onClick={() => onChange(name)}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A bounded within-cell nudge — X/Y steppers plus a "center" reset
 * (design §"The panel": "a small 2D nudge pad (or X/Y steppers)").
 * Values are clamped to [-0.5, 0.5] client-side for a sane control even
 * though the server is the actual bounds judge. */
function OffsetControl({
  offset,
  onChange,
}: {
  offset?: PlacementOffset;
  onChange: (offset: PlacementOffset | undefined) => void;
}) {
  const [x, y, z = 0] = offset ?? [0, 0];
  const clamp = (v: number) => Math.min(0.5, Math.max(-0.5, v));
  // Height's OWN range, deliberately not the planar ±0.5 clamp (Kirk's
  // ruling, rpg-project#272: "height should be able to gun higher than
  // the 5 ticks we allow on x and y").
  const clampZ = (v: number) => Math.min(3, Math.max(0, v));
  const emit = (nx: number, ny: number, nz: number) =>
    onChange(nz === 0 ? [nx, ny] : [nx, ny, nz]);
  return (
    <div className="dg-label">
      offset
      <div className="flex gap-2 items-end">
        <label className="dg-label flex-1">
          x
          <input
            className="dg-input"
            type="number"
            min={-0.5}
            max={0.5}
            step={0.1}
            value={x}
            onChange={(e) => emit(clamp(Number(e.target.value) || 0), y, z)}
          />
        </label>
        <label className="dg-label flex-1">
          y
          <input
            className="dg-input"
            type="number"
            min={-0.5}
            max={0.5}
            step={0.1}
            value={y}
            onChange={(e) => emit(x, clamp(Number(e.target.value) || 0), z)}
          />
        </label>
        <label className="dg-label flex-1">
          height
          <input
            className="dg-input"
            data-testid="offset-height"
            type="number"
            min={0}
            max={3}
            step={0.1}
            value={z}
            onChange={(e) => emit(x, y, clampZ(Number(e.target.value) || 0))}
          />
        </label>
        <button
          type="button"
          className="dg-mini"
          onClick={() => onChange(undefined)}
        >
          center
        </button>
      </div>
    </div>
  );
}
