/**
 * Inspector — the right column's top half (design §1): whichever of the
 * dungeon, a region, a door or a placement is selected. Every field here
 * writes straight into the document; the YAML pane below it is the
 * read-only mirror.
 */
import {
  isMonsterRef,
  type DoorDoc,
  type DungeonDoc,
  type PlacementDoc,
} from './dungeonYaml';
import { RegionPanel } from './RegionPanel';
import { ABILITIES, TARGETINGS, type Selection } from './types';

export interface InspectorProps {
  doc: DungeonDoc;
  selection: Selection;
  onDungeon: (
    patch: Partial<Pick<DungeonDoc, 'key' | 'name' | 'void'>>
  ) => void;
  onRegion: (
    id: string,
    patch: Partial<
      Pick<
        DungeonDoc['regions'][number],
        'id' | 'name' | 'archetype' | 'lighting'
      >
    >
  ) => void;
  onRemoveRegion: (id: string) => void;
  onDoor: (
    id: string,
    patch: Partial<Pick<DoorDoc, 'id' | 'closed' | 'locked'>>
  ) => void;
  onRemoveDoor: (id: string) => void;
  onPlacement: (
    index: number,
    patch: Partial<Omit<PlacementDoc, 'ref' | 'at'>>
  ) => void;
  onRemovePlacement: (index: number) => void;
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
  if (selection.kind === 'placement') {
    const placement = doc.place[selection.index];
    if (!placement) return <DungeonPanel {...props} />;
    return (
      <PlacementPanel
        placement={placement}
        onChange={(p) => props.onPlacement(selection.index, p)}
        onRemove={() => props.onRemovePlacement(selection.index)}
      />
    );
  }
  return <DungeonPanel {...props} />;
}

function DungeonPanel({ doc, onDungeon }: InspectorProps) {
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
        {doc.regions.reduce((n, r) => n + r.cells.length, 0)} floor cells ·{' '}
        {doc.walls.length} walls · {doc.doors.length} doors · {doc.place.length}{' '}
        placed
      </div>
    </div>
  );
}

function DoorPanel({
  door,
  onChange,
  onRemove,
}: {
  door: DoorDoc;
  onChange: (patch: Partial<Pick<DoorDoc, 'id' | 'closed' | 'locked'>>) => void;
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
      <div className="text-xs opacity-70">
        {door.edges.length} edge{door.edges.length === 1 ? '' : 's'} — click
        more edges with the Door tool to widen it
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
                locked: door.locked ?? { dc: 12, ability: 'dex' },
              });
          }}
        >
          <option value="open">open doorway</option>
          <option value="closed">closed</option>
          <option value="locked">locked</option>
        </select>
      </label>
      {door.locked && (
        <div className="flex gap-2">
          <label className="dg-label flex-1">
            dc
            <input
              className="dg-input"
              type="number"
              min={1}
              value={door.locked.dc}
              onChange={(e) =>
                onChange({
                  locked: { ...door.locked!, dc: Number(e.target.value) || 0 },
                })
              }
            />
          </label>
          <label className="dg-label flex-1">
            ability
            <select
              className="dg-input"
              value={door.locked.ability}
              onChange={(e) =>
                onChange({
                  locked: { ...door.locked!, ability: e.target.value },
                })
              }
            >
              {ABILITIES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <button type="button" className="dg-mini dg-danger" onClick={onRemove}>
        remove door
      </button>
    </div>
  );
}

function PlacementPanel({
  placement,
  onChange,
  onRemove,
}: {
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
        </>
      )}
      <button type="button" className="dg-mini dg-danger" onClick={onRemove}>
        remove
      </button>
    </div>
  );
}
