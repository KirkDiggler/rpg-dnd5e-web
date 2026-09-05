/**
 * Palette — the left column (design §1): tools top to bottom, the
 * region list the brush paints into, then the prop and monster catalogs
 * (thumbnails from `paletteData.ts`, keyed by the same refs the game's
 * `propManifest`/`monsterModels` resolve).
 */
import type { DungeonDoc } from './dungeonYaml';
import { regionColor } from './markerStyle';
import {
  PALETTE_MONSTERS,
  PALETTE_PROPS,
  ROLE_COLOR,
  thumbForRef,
} from './paletteData';
import type { BoardTool, PaletteItem } from './types';

export interface PaletteProps {
  doc: DungeonDoc;
  tool: BoardTool;
  onTool: (tool: BoardTool) => void;
  activeRegionId: string | null;
  onActiveRegion: (id: string) => void;
  onAddRegion: () => void;
  armed: PaletteItem | null;
  onArm: (item: PaletteItem) => void;
}

const TOOLS: { id: BoardTool; label: string; hint: string }[] = [
  {
    id: 'select',
    label: 'Select',
    hint: 'inspect a region, door or placement',
  },
  {
    id: 'region',
    label: 'Region brush',
    hint: 'paint cells into the active region (shift-drag erases)',
  },
  {
    id: 'region-rect',
    label: 'Region rect',
    hint: 'drag a rectangle of cells into the active region',
  },
  {
    id: 'room',
    label: 'Room',
    hint: 'drag a rectangle of WALLS on the floor — shares a single wall with a room beside it',
  },
  {
    id: 'scenery',
    label: 'Scenery',
    hint: 'paint floor no room owns — walls and props stand on it, nobody walks on it (shift-drag erases)',
  },
  { id: 'erase', label: 'Erase', hint: 'return cells to void' },
  {
    id: 'wall',
    label: 'Wall',
    hint: 'click a hex to see where a wall can start, then pick a start and an end — green lines cost nothing, orange ones seal the cells they run through (shift-click a wall to delete it)',
  },
  {
    id: 'door',
    label: 'Door',
    hint: 'click one of the marked points on a wall; the inspector sets the lock',
  },
  { id: 'start', label: 'Start', hint: "the party's entry cell" },
  {
    id: 'exit',
    label: 'Exit',
    hint: 'a way out — click a floor cell to add one, click it again to remove it. The start is NOT one unless you say so',
  },
];

export function Palette({
  doc,
  tool,
  onTool,
  activeRegionId,
  onActiveRegion,
  onAddRegion,
  armed,
  onArm,
}: PaletteProps) {
  return (
    <div className="flex flex-col gap-4 text-sm" data-testid="palette">
      <section>
        <h3 className="dg-h">Tools</h3>
        <div className="flex flex-col gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.hint}
              aria-pressed={tool === t.id}
              className={`dg-tool ${tool === t.id ? 'dg-tool--on' : ''}`}
              onClick={() => onTool(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="dg-h">Regions</h3>
          <button type="button" className="dg-mini" onClick={onAddRegion}>
            + add
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {doc.regions.map((r, i) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={r.id === activeRegionId}
              className={`dg-tool flex items-center gap-2 ${
                r.id === activeRegionId ? 'dg-tool--on' : ''
              }`}
              onClick={() => {
                onActiveRegion(r.id);
                if (tool !== 'region' && tool !== 'select') onTool('region');
              }}
            >
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ background: regionColor(i) }}
              />
              <span className="truncate">{r.name || r.id}</span>
              <span className="ml-auto opacity-60">{r.cells.length}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="dg-h">Props</h3>
        <div className="grid grid-cols-4 gap-1">
          {PALETTE_PROPS.map((p) => {
            const on = armed?.ref === p.ref && tool === 'place';
            const thumb = thumbForRef(p.ref);
            return (
              <button
                key={p.ref}
                type="button"
                title={`${p.ref} · ${p.label} (${p.role})`}
                aria-pressed={on}
                className={`dg-chip ${on ? 'dg-chip--on' : ''}`}
                style={{ borderColor: ROLE_COLOR[p.role] }}
                onClick={() => {
                  onArm({ kind: 'prop', ref: p.ref });
                  onTool('place');
                }}
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt={p.short}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  p.short
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="dg-h">Monsters</h3>
        <div className="grid grid-cols-4 gap-1">
          {PALETTE_MONSTERS.map((m) => {
            const on = armed?.ref === m.ref && tool === 'place';
            const thumb = thumbForRef(m.ref);
            return (
              <button
                key={m.ref}
                type="button"
                title={m.label}
                aria-pressed={on}
                className={`dg-chip ${on ? 'dg-chip--on' : ''}`}
                style={{ borderColor: '#a02020' }}
                onClick={() => {
                  onArm({ kind: 'monster', ref: m.ref });
                  onTool('place');
                }}
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt={m.short}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  m.short
                )}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
