/**
 * Inspector — the right column's top half (design §1): whichever of the
 * dungeon, a region, a door or a placement is selected. Every field here
 * writes straight into the document; the YAML pane below it is the
 * read-only mirror.
 */
import { FACING_NAMES, facingAngleDeg } from '@/components/hex-grid/facingYaw';
import { refId } from '@/utils/refs';
import type { FieldError } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useState } from 'react';
import type { ScenariosState } from './authoringRpc';
import {
  floorKeys,
  intelHolders,
  isMonsterRef,
  MONSTERS,
  placementIds,
  revealedFacts,
  suggestPlacementId,
  wallLattice,
  type ApproachDoc,
  type CheckDoc,
  type ConcealmentDerivation,
  type DispositionDoc,
  type DoorDoc,
  type DungeonDoc,
  type EndingDoc,
  type ExitDoc,
  type FactionDoc,
  type IntelDoc,
  type PlacementDoc,
  type PlacementOffset,
  type StartDoc,
  type WallDoc,
} from './dungeonYaml';
import { EndingsSection } from './EndingsPanel';
import { DispositionsSection, FactionsSection } from './FactionPanel';
import { factionRefusals, messagesAt, predicatePaths } from './factionRules';
import { sealedBy } from './hexGeometry';
import { axialKey } from './hexOffset';
import { PredicateEditor } from './PredicateEditor';
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
  /** Aim the party's entry, or clear the aim. */
  onStartFacing: (facing: string | undefined) => void;
  /** Declare a new record and open its form. */
  onAddIntel: () => void;
  /** Rename one intel record. */
  onIntel: (id: string, patch: Partial<Pick<IntelDoc, 'id'>>) => void;
  /** Point one record at one thing; an empty value clears that target. */
  onIntelReveals: (id: string, key: string, value: string) => void;
  /** Set exactly which monsters hold this record. */
  onIntelHolders: (id: string, holders: readonly string[]) => void;
  onRemoveIntel: (id: string) => void;
  /** Declare a new faction. */
  onAddFaction: () => void;
  /** Rename or re-mind one faction. */
  onFaction: (id: string, patch: Partial<FactionDoc>) => void;
  onRemoveFaction: (id: string) => void;
  /** Declare a new disposition. */
  onAddDisposition: () => void;
  /** Patch one disposition by index: pair, stance, or `until`. */
  onDisposition: (index: number, patch: Partial<DispositionDoc>) => void;
  onRemoveDisposition: (index: number) => void;
  /** Declare a new authored ending. */
  onAddEnding: () => void;
  /** Rename one ending or change when it fires. */
  onEnding: (index: number, patch: Partial<EndingDoc>) => void;
  onRemoveEnding: (index: number) => void;
  /** Select something else — the monster panel links back to a record. */
  onSelect: (selection: Selection) => void;
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
        errors={props.errors}
        onChange={(p) => props.onPlacement(selection.index, p)}
        onRemove={() => props.onRemovePlacement(selection.index)}
        onSelectIntel={(id) => props.onSelect({ kind: 'intel', id })}
      />
    );
  }
  // A RECORD IS A DUNGEON-LEVEL FACT (R7, from Kirk's walk: "so little
  // weird the intel is next to the assets"). Selecting one shows the
  // DUNGEON panel with that record's form open IN PLACE inside the Intel
  // section, rather than replacing the panel — so the list and the form
  // the author is editing stay on screen together.
  if (selection.kind === 'start') {
    // No start authored yet: nothing to aim, so the dungeon panel is the
    // honest answer rather than a form for a thing that does not exist.
    if (!doc.start) return <DungeonPanel {...props} />;
    return <StartPanel start={doc.start} onFacing={props.onStartFacing} />;
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
  // Every faction/disposition refusal the client can know, computed once
  // and shared by the two sections below (rpg-project#375 §2).
  const refusals = factionRefusals(doc);
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
      {/* INTEL, beside Scenarios (R7). Both are dungeon-level
          declarations — a record belongs to the dungeon the way a
          scenario binding does, not to whichever thing happens to carry
          it — so both live on the panel the inspector shows when nothing
          in particular is selected. */}
      <IntelSection
        doc={doc}
        selectedId={
          props.selection.kind === 'intel' ? props.selection.id : null
        }
        onAdd={props.onAddIntel}
        onSelect={(id) => props.onSelect({ kind: 'intel', id })}
        onRename={(id, next) => props.onIntel(id, { id: next })}
        onReveals={props.onIntelReveals}
        onHolders={props.onIntelHolders}
        onRemove={props.onRemoveIntel}
        errors={props.errors}
      />
      {/* FACTIONS and DISPOSITIONS, beside Intel and Scenarios
          (rpg-project#375 §7): who fights as one side, and how two sides
          stand to each other — dungeon-level declarations, both. */}
      <FactionsSection
        doc={doc}
        refusals={refusals}
        errors={props.errors}
        onAddFaction={props.onAddFaction}
        onFaction={props.onFaction}
        onRemoveFaction={props.onRemoveFaction}
        onAddDisposition={props.onAddDisposition}
        onDisposition={props.onDisposition}
        onRemoveDisposition={props.onRemoveDisposition}
      />
      <DispositionsSection
        doc={doc}
        refusals={refusals}
        errors={props.errors}
        onAddFaction={props.onAddFaction}
        onFaction={props.onFaction}
        onRemoveFaction={props.onRemoveFaction}
        onAddDisposition={props.onAddDisposition}
        onDisposition={props.onDisposition}
        onRemoveDisposition={props.onRemoveDisposition}
      />
      {/* ENDINGS, beside Scenarios (R10): the predicate grammar's third
          consumer, and the thing a scenario's field is sugar for. */}
      <EndingsSection
        doc={doc}
        refusals={refusals}
        errors={props.errors}
        onAddEnding={props.onAddEnding}
        onEnding={props.onEnding}
        onRemoveEnding={props.onRemoveEnding}
      />
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

/**
 * The party's entry point, and which way they are looking when they get
 * there (rpg-project#374 design, "The walks" — Kirk: "we always start
 * looking the wrong way and have to spin around").
 *
 * THE SAME COMPASS THE PROPS USE. One eight-name vocabulary, one control,
 * one table from name to angle: an author who has aimed a statue has
 * already learned this. Leaving it unset is a real answer and the common
 * one — the file then keeps the bare `start: [c, r]` it has always had,
 * and the game aims the camera exactly as it does today.
 *
 * FACING IS PRESENTATION. It aims the first frame and decides nothing
 * about where the party may walk or what they can see; `AtlasStart.facing`
 * says so on the wire in as many words.
 */
function StartPanel({
  start,
  onFacing,
}: {
  start: StartDoc;
  onFacing: (facing: string | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="start-panel">
      <h3 className="dg-h">Start</h3>
      <div className="text-xs opacity-70">
        Where the party comes in. One per dungeon — placing another moves this
        one.
      </div>
      <FacingControl facing={start.facing} onChange={onFacing} />
      <div className="text-xs opacity-70" data-testid="start-facing-note">
        {start.facing === undefined
          ? 'No facing set — the camera starts the way it always has, and the file keeps its bare `start: [col, row]`.'
          : `The camera looks ${start.facing} on the first frame. Nothing else reads this: it never decides where the party may walk or what they can see.`}
      </div>
      {/* NO REMOVE BUTTON. dungeonspec requires a start, so a dungeon
          without one does not compile — an author moves the start with
          the Start tool, and never takes it away. Offering a verb whose
          only outcome is a file the server refuses is offering a trap. */}
      <div className="text-xs opacity-50" data-testid="start-at">
        at {start.at.q},{start.at.r}
      </div>
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
  // A BLANK ID IS ALSO REFUSED IN PLACE, for the same reason a duplicate
  // is: an exit's id is what a scenario binds to and what `Exited.exit`
  // reports, so a nameless one is a way out no form can point at — and
  // the compiler refuses it by name ("the exit has no id"). Held as typed
  // text rather than written, exactly like a clash, so clearing the box
  // to retype never leaves the document holding an empty name. Removing
  // an exit is the `remove way out` button's job, not a side effect of
  // emptying this field.
  const blank = typed !== null && typed.trim() === '';
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
            if (next.trim() !== '' && !takenIds.has(next)) {
              onChange({ id: next });
              setTyped(null);
            }
          }}
        />
        {blank ? (
          <div className="text-xs" data-testid="exit-id-refusal">
            a way out needs a name — it is what the scenario form points at. Use
            &quot;remove way out&quot; to take it off the map
          </div>
        ) : clash ? (
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
  errors,
  onChange,
  onRemove,
  onSelectIntel,
}: {
  doc: DungeonDoc;
  index: number;
  placement: PlacementDoc;
  errors: readonly FieldError[];
  onChange: (patch: Partial<Omit<PlacementDoc, 'ref' | 'at'>>) => void;
  onRemove: () => void;
  onSelectIntel: (id: string) => void;
}) {
  const monster = isMonsterRef(placement.ref);
  const refusals = factionRefusals(doc);
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
        messages={messagesAt(refusals, errors, `place[${index}].id`)}
        onChange={(id) => onChange({ id })}
      />
      {/* WHAT IT CARRIES, monster or prop alike (R6) — above the fields
          that differ, because it is the one thing both kinds answer. */}
      <HoldsReadout
        doc={doc}
        placement={placement}
        onSelectIntel={onSelectIntel}
      />
      {monster ? (
        <>
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
          <FactionControl
            doc={doc}
            index={index}
            placement={placement}
            refusals={messagesAt(refusals, errors, `place[${index}].faction`)}
            onChange={(faction) => onChange({ faction })}
          />
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
      {/* ARRIVES (rpg-project#375 §3.7, step B): the predicate that brings
          this placement into the run. Monsters and props alike; until it
          holds the placement is in RESERVE — no cell, no turn, unseen by
          anyone — and on the first verb after, it lands on its cell. The
          same editor `until` and an ending's `when` use. */}
      <div className="dg-label">
        arrives
        <PredicateEditor
          doc={doc}
          value={placement.arrives}
          testId="placement-arrives"
          noneMeans="placed at launch — on the map from the first frame"
          refusals={messagesAt(
            refusals,
            errors,
            ...predicatePaths(`place[${index}].arrives`)
          )}
          onChange={(arrives) => onChange({ arrives })}
        />
        {placement.arrives !== undefined && (
          <div className="text-xs opacity-70" data-testid="arrives-note">
            In reserve until this holds: absent from the map, the roster and
            every eye. Then it lands here, or on the nearest free floor of this
            region if the cell is taken.
          </div>
        )}
      </div>
      <button type="button" className="dg-mini dg-danger" onClick={onRemove}>
        remove
      </button>
    </div>
  );
}

/**
 * Which side this monster fights for (rpg-project#375 §2): the declared
 * factions, and `monsters` for the reserved side every unauthored monster
 * is on. CHOOSING `monsters` WRITES NOTHING — absent is how that side is
 * spelled (R4), so a dungeon that never chose a faction keeps the bytes it
 * always had. A faction the file names that is no longer declared stays
 * selectable, and the refusal under it says so.
 */
function FactionControl({
  doc,
  placement,
  refusals,
  onChange,
}: {
  doc: DungeonDoc;
  index: number;
  placement: PlacementDoc;
  refusals: string[];
  onChange: (faction: string) => void;
}) {
  const faction = placement.faction ?? '';
  return (
    <label className="dg-label">
      faction
      <select
        className="dg-input"
        data-testid="placement-faction"
        aria-label="faction"
        value={faction}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">monsters</option>
        {faction !== '' && !doc.factions.some((f) => f.id === faction) && (
          <option value={faction}>{faction}</option>
        )}
        {/* A DECLARED `monsters` faction is the same side as the choice
            above — declared only to be given a mind — so it is not listed
            a second time. */}
        {doc.factions
          .filter((f) => f.id !== MONSTERS)
          .map((f) => (
            <option key={f.id} value={f.id}>
              {f.id}
            </option>
          ))}
      </select>
      {refusals.length > 0 ? (
        refusals.map((message, i) => (
          <div
            key={i}
            className="text-xs"
            data-testid="placement-faction-refusal"
            style={{ color: 'var(--color-error, #f87171)' }}
          >
            {message}
          </div>
        ))
      ) : (
        <div
          className="text-xs opacity-70"
          data-testid="placement-faction-note"
        >
          {faction === ''
            ? '`monsters` is the side every unauthored monster is on — hostile to the party, and written nowhere in the file.'
            : `Fights for ${faction}. Declared under Factions on the dungeon panel.`}
        </div>
      )}
    </label>
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
  messages,
  onChange,
}: {
  doc: DungeonDoc;
  index: number;
  placement: PlacementDoc;
  /** Refusals addressed to `place[i].id` other than a clash — a reserved
   * prop with no name, or whatever the compiler says. */
  messages: string[];
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
      ) : messages.length > 0 ? (
        messages.map((message, i) => (
          <div
            key={i}
            className="text-xs"
            data-testid="placement-id-refusal"
            style={{ color: 'var(--color-error, #f87171)' }}
          >
            {message}
          </div>
        ))
      ) : (
        <div className="text-xs opacity-70">
          Optional. Needed by whatever points at this: a scenario&apos;s form,
          picking it up, or arriving later.
        </div>
      )}
    </label>
  );
}

/**
 * The dungeon's intel: the record list, the verb that makes one, and the
 * selected record's form OPEN IN PLACE beneath it (R7).
 *
 * It sits beside Scenarios rather than in the palette because that is what
 * a record is — a declaration the dungeon carries, like a scenario
 * binding — and not a thing you pick up and place, which is what
 * everything in the palette is. Kirk, walking it: "so little weird the
 * intel is next to the assets."
 */
function IntelSection({
  doc,
  selectedId,
  onAdd,
  onSelect,
  onRename,
  onReveals,
  onHolders,
  onRemove,
  errors,
}: {
  doc: DungeonDoc;
  selectedId: string | null;
  onAdd: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, next: string) => void;
  onReveals: (id: string, key: string, value: string) => void;
  onHolders: (id: string, holders: readonly string[]) => void;
  onRemove: (id: string) => void;
  errors: readonly FieldError[];
}) {
  const selected = doc.intel.find((r) => r.id === selectedId);
  const selectedIndex = doc.intel.findIndex((r) => r.id === selectedId);
  return (
    <div className="flex flex-col gap-2" data-testid="intel-section">
      <div className="flex items-center justify-between">
        <h3 className="dg-h">Intel</h3>
        <button
          type="button"
          className="dg-mini"
          data-testid="new-intel"
          onClick={onAdd}
        >
          + new intel
        </button>
      </div>
      {doc.intel.length === 0 ? (
        <div className="text-xs opacity-70">
          none — a record says what a party learns, and a monster or a prop
          carries it
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {doc.intel.map((record) => (
            <button
              key={record.id}
              type="button"
              aria-pressed={record.id === selectedId}
              data-testid={`intel-${record.id}`}
              className={`dg-tool flex items-center gap-2 ${
                record.id === selectedId ? 'dg-tool--on' : ''
              }`}
              onClick={() => onSelect(record.id)}
            >
              <span className="truncate">{record.id}</span>
              <span className="ml-auto opacity-60">
                {record.reveals.door
                  ? `→ ${record.reveals.door}`
                  : record.reveals.fact
                    ? `→ fact: ${record.reveals.fact}`
                    : '—'}
              </span>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <IntelPanel
          key={selected.id}
          doc={doc}
          index={selectedIndex}
          record={selected}
          errors={errors}
          onRename={(next) => onRename(selected.id, next)}
          onReveals={(key, value) => onReveals(selected.id, key, value)}
          onHolders={(holders) => onHolders(selected.id, holders)}
          onRemove={() => onRemove(selected.id)}
        />
      )}
    </div>
  );
}

/**
 * ONE INTEL RECORD — the form that gives a piece of intel a target and a
 * holder (rpg-project#372 R2, §5).
 *
 * This is the whole tool this cut exists to build: a DM declares what a
 * piece of knowledge reveals, and says who is carrying it. Nothing here is
 * scenario machinery — a record is a general builder capability like a
 * concealed door, and the scenario form never learns the word (design R3).
 *
 * **Reveals** is the entity_ref picker filtered by kind, as everywhere
 * else in this builder; `door` is the only kind the engine reads in this
 * cut, and the next one arrives with its own use case rather than ahead of
 * it (R4/R5).
 *
 * **Held by** is where assignment happens, and it is deliberately HERE and
 * not on the monster: the author's sentence is "the captain has the vault
 * map", said from the vault map. The monster panel mirrors it read-only.
 */
function IntelPanel({
  doc,
  index,
  record,
  errors,
  onRename,
  onReveals,
  onHolders,
  onRemove,
}: {
  doc: DungeonDoc;
  index: number;
  record: IntelDoc;
  errors: readonly FieldError[];
  onRename: (id: string) => void;
  onReveals: (key: string, value: string) => void;
  onHolders: (holders: readonly string[]) => void;
  onRemove: () => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const taken = new Set(
    doc.intel.filter((r) => r.id !== record.id).map((r) => r.id)
  );
  const shown = typed ?? record.id;
  const blank = typed !== null && typed.trim() === '';
  const clash = typed !== null && taken.has(typed);
  const holders = intelHolders(doc, record.id);
  // MONSTERS AND PROPS ALIKE (R6, from Kirk's walk: intel a party can
  // reach without killing the hardest thing in the dungeon first). Named
  // only — `holds` points at a placement by its id, so a thing with no
  // name cannot be given one.
  const carriers = doc.place.filter((p) => !!p.id);
  const door = record.reveals.door ?? '';
  const fact = record.reveals.fact ?? '';
  // WHAT KIND OF THING IT REVEALS (rpg-project#375 §2: `{ door } | { fact }`,
  // exactly one key). Derived from the key the record carries; while it
  // carries none — a brand new record — the author's pick is held here so
  // the right box is on screen before there is a value to write.
  const [kindChoice, setKindChoice] = useState<'door' | 'fact'>('door');
  const kind: 'door' | 'fact' =
    'fact' in record.reveals && !('door' in record.reveals)
      ? 'fact'
      : 'door' in record.reveals
        ? 'door'
        : kindChoice;
  const twoKeys = 'fact' in record.reveals && 'door' in record.reveals;
  // The compiler's refusals addressed to this record's reveals — nothing
  // revealed, both keys, or a door the file does not have.
  const revealsErrors = messagesAt(
    [],
    errors,
    `intel[${index}].reveals`,
    `intel[${index}].reveals.door`,
    `intel[${index}].reveals.fact`
  );
  // The facts OTHER records reveal, offered as suggestions: a fact is
  // declared by mention, and a second record revealing the same one is
  // how it can be learned two ways.
  const otherFacts = revealedFacts({
    ...doc,
    intel: doc.intel.filter((r) => r.id !== record.id),
  });
  return (
    // NO HEADING OF ITS OWN: the form opens in place under the section
    // that already says Intel (R7), and a second "INTEL" above it reads
    // as a second thing rather than as the record you just picked.
    <div
      className="flex flex-col gap-3 dg-intel-form"
      data-testid="intel-panel"
    >
      <label className="dg-label">
        id
        <input
          className="dg-input"
          data-testid="intel-id"
          aria-label="intel id"
          value={shown}
          onChange={(e) => {
            const next = e.target.value;
            setTyped(next);
            if (next.trim() !== '' && !taken.has(next)) {
              onRename(next);
              setTyped(null);
            }
          }}
        />
        {blank ? (
          <div className="text-xs" data-testid="intel-id-refusal">
            a record needs a name — it is what a monster&apos;s `holds` points
            at. Use &quot;remove record&quot; to delete it
          </div>
        ) : clash ? (
          <div className="text-xs" data-testid="intel-id-refusal">
            another record is already called &quot;{typed}&quot; — two cannot
            share a name, because a monster holds one of them
          </div>
        ) : (
          <div className="text-xs opacity-70">
            The author&apos;s name for this piece of knowledge.
          </div>
        )}
      </label>

      <label className="dg-label">
        reveals
        <select
          className="dg-input"
          data-testid="intel-reveals-kind"
          aria-label="reveals kind"
          value={kind}
          onChange={(e) => {
            const next = e.target.value as 'door' | 'fact';
            setKindChoice(next);
            // Exactly one key: switching kinds clears the other.
            if (next === 'fact' && door !== '') onReveals('door', '');
            if (next === 'door' && fact !== '') onReveals('fact', '');
          }}
        >
          <option value="door">a door</option>
          <option value="fact">a fact</option>
        </select>
        {twoKeys && (
          <div
            className="text-xs"
            data-testid="intel-reveals-refusal"
            style={{ color: 'var(--color-error, #f87171)' }}
          >
            a record reveals exactly one thing — a door or a fact, not both
          </div>
        )}
        {revealsErrors.map((message, i) => (
          <div
            key={i}
            className="text-xs"
            data-testid="intel-reveals-refusal"
            style={{ color: 'var(--color-error, #f87171)' }}
          >
            {message}
          </div>
        ))}
      </label>
      {kind === 'fact' ? (
        <label className="dg-label">
          fact
          <input
            className="dg-input"
            data-testid="intel-reveals-fact"
            aria-label="reveals a fact"
            list="intel-reveals-fact-suggestions"
            placeholder={otherFacts[0] ?? 'saved-wiseman'}
            value={fact}
            onChange={(e) => onReveals('fact', e.target.value)}
          />
          <datalist id="intel-reveals-fact-suggestions">
            {otherFacts.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          <div className="text-xs opacity-70" data-testid="intel-fact-note">
            A plain word, declared by naming it here. A faction whose
            disposition waits `until` this fact turns when its mind learns it —
            carry the record into the mind&apos;s region.
          </div>
        </label>
      ) : (
        <label className="dg-label">
          door
          {doc.doors.length === 0 ? (
            <div className="text-xs opacity-70" data-testid="intel-no-doors">
              this dungeon has no doors yet — a record reveals one by its id
            </div>
          ) : (
            <select
              className="dg-input"
              data-testid="intel-reveals-door"
              aria-label="reveals a door"
              value={door}
              onChange={(e) => onReveals('door', e.target.value)}
            >
              <option value="">(nothing yet)</option>
              {/* A door the file no longer has stays selectable rather than
                silently reading as "(nothing yet)": the author sees what
                the file says and the compiler names the problem. */}
              {door !== '' && !doc.doors.some((d) => d.id === door) && (
                <option value={door}>{door}</option>
              )}
              {doc.doors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id}
                  {d.concealed ? ' · concealed' : ''}
                </option>
              ))}
            </select>
          )}
          <div className="text-xs opacity-70">
            What a party learns from this. A concealed door is the one worth
            knowing; an ordinary one is legal and does nothing.
          </div>
        </label>
      )}

      <div className="dg-label" data-testid="intel-held-by">
        held by
        {carriers.length === 0 ? (
          <div className="text-xs opacity-70">
            nothing in this dungeon has an id yet — select a monster or a prop
            and name it
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {carriers.map((carrier) => {
              const id = carrier.id as string;
              const has = holders.includes(id);
              return (
                <label className="dg-check" key={id}>
                  <input
                    type="checkbox"
                    data-testid={`intel-holder-${id}`}
                    checked={has}
                    onChange={(e) =>
                      onHolders(
                        e.target.checked
                          ? [...holders, id]
                          : holders.filter((h) => h !== id)
                      )
                    }
                  />
                  {id}
                  {/* The KIND, said out loud: a scroll and a captain are
                      reached in very different ways, and the author is
                      choosing between them here. */}
                  <span className="opacity-60">
                    {' '}
                    · {isMonsterRef(carrier.ref) ? 'monster' : 'prop'} ·{' '}
                    {refId(carrier.ref) ?? carrier.ref}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <div className="text-xs opacity-70">
          Loot the monster or pick up the prop and this reveals. Several may
          carry it — intel copies, it never moves.
        </div>
      </div>

      <button
        type="button"
        className="dg-mini dg-danger"
        data-testid="intel-remove"
        onClick={onRemove}
      >
        remove record
      </button>
    </div>
  );
}

/**
 * What this monster is carrying, READ ONLY (rpg-project#372 §5).
 *
 * "Selecting a monster shows what it holds, read-only, with a link back
 * to the record — the monster is not where you edit intel." Assignment is
 * the record's own form (design R2): the author says who holds the vault
 * map, from the vault map. This is the mirror of that fact, so the answer
 * has one place it is written and one place it is read.
 *
 * Shown on PROPS TOO (R6): a scroll on a table carries intel exactly as a
 * captain does, and reading it off the thing works the same either way.
 */
function HoldsReadout({
  doc,
  placement,
  onSelectIntel,
}: {
  doc: DungeonDoc;
  placement: PlacementDoc;
  onSelectIntel: (id: string) => void;
}) {
  const holds = placement.holds ?? [];
  return (
    <div className="dg-label" data-testid="holds-readout">
      holds
      {holds.length === 0 ? (
        <div className="text-xs opacity-70">
          nothing — give it intel from the record&apos;s own form, under Intel
          on the dungeon panel
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {holds.map((id) => {
            // A record the file no longer declares: the compiler refuses
            // it by name, and the panel says so rather than rendering a
            // link to nothing.
            const known = doc.intel.some((record) => record.id === id);
            return (
              <button
                key={id}
                type="button"
                className="dg-mini text-left"
                data-testid={`holds-${id}`}
                disabled={!known}
                onClick={() => onSelectIntel(id)}
              >
                {id}
                {known ? ' →' : ' · no such record'}
              </button>
            );
          })}
        </div>
      )}
      <div className="text-xs opacity-70">
        What a party learns from this. Edited on the record.
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
