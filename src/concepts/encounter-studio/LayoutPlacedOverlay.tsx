import {
  memo,
  useRef,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type {
  RoomMonsterPlacement,
  RoomPropDeclaration,
} from '../world-building/roomDraft';
import type { SiteExit } from '../world-building/siteScope';
import type { WorldProp } from '../world-building/types';
import {
  layoutCellCenter,
  layoutCellCorners,
  worldToClient,
  type LayoutTransform,
} from './layoutGeometry';
import { castColour } from './overviewColours';
import type { RoomHexCell, StudioSelection, WorldPoint } from './studioSession';

/** Layout's selection intents for placed nouns: the existing S0 and S1
 * intents, never a second selection store. */
export interface LayoutPlacedEditing {
  readonly selected: StudioSelection;
  /** Scene roots in a Shift-pick of two or more, else empty. */
  readonly picked?: readonly string[];
  /** Display names by placement id (S5's placementDisplayNames). */
  readonly names: ReadonlyMap<string, string>;
  /** session.creatures.select */
  selectCreature(id: string): boolean;
  /** viewportProps.onSelect([id]), or extend the current pick. */
  selectProp(id: string, extend: boolean): void;
  /** The existing party-start target. */
  selectPartyStart(): boolean;
}

const RING_RADIUS = 0.62;
const NO_EXITS: readonly SiteExit[] = [];
const MARKER_RADIUS = 0.34;

function footprintPoints(
  item: Readonly<WorldProp>,
  declaration: Readonly<RoomPropDeclaration>
): string {
  const { width, depth, offsetX, offsetZ } = declaration.footprint;
  const { x, z, rotationY } = item.transform;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  // The 3D footprint's own frame: Three.js positive-Y yaw on owner-local XZ.
  return [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2],
  ]
    .map(([lx, lz]) => {
      const px = lx + offsetX;
      const pz = lz + offsetZ;
      return `${x + px * cos + pz * sin},${z - px * sin + pz * cos}`;
    })
    .join(' ');
}

function diamond(at: WorldPoint, radius: number): string {
  return [
    [0, -radius],
    [radius, 0],
    [0, radius],
    [-radius, 0],
  ]
    .map(([dx, dz]) => `${at.x + dx},${at.z + dz}`)
    .join(' ');
}

interface GlyphProps {
  monsters: readonly RoomMonsterPlacement[];
  items: readonly WorldProp[];
  declarations: Readonly<Record<string, RoomPropDeclaration>>;
  partyStart?: RoomHexCell;
  exits: readonly SiteExit[];
  /** "creature:<id>", "cast:<ref>", "start", or "" */
  selectedKey: string;
  /** Selected or picked prop ids, joined: a primitive for the memo. */
  propKey: string;
  interactive: boolean;
  /** The latest intents: a memoised glyph never calls a retired snapshot's. */
  editing: MutableRefObject<LayoutPlacedEditing>;
}

/** World-space glyphs, memoised on the document's declarations, scene items
 * and selection, so pan and zoom do not re-render them. */
const PlacedGlyphs = memo(
  function PlacedGlyphs({
    monsters,
    items,
    declarations,
    partyStart,
    exits,
    selectedKey,
    propKey,
    interactive,
    editing,
  }: GlyphProps): React.JSX.Element {
    const props = new Set(propKey ? propKey.split('\n') : []);
    const press =
      (select: (event: ReactPointerEvent<SVGElement>) => void) =>
      (event: ReactPointerEvent<SVGElement>): void => {
        if (!interactive || event.button !== 0) return;
        event.stopPropagation();
        event.preventDefault();
        select(event);
      };
    const pointerEvents = interactive ? 'visiblePainted' : 'none';
    return (
      <>
        {items.map((item) => {
          const declaration = declarations[item.id];
          const selected = props.has(item.id);
          const common = {
            'data-placed-prop': item.id,
            'data-selected': selected || undefined,
            pointerEvents,
            style: interactive ? { cursor: 'pointer' } : undefined,
            onPointerDown: press((event) =>
              editing.current.selectProp(item.id, event.shiftKey)
            ),
          };
          return declaration ? (
            <polygon
              key={item.id}
              {...common}
              data-footprint="declared"
              points={footprintPoints(item, declaration)}
              fill={declaration.blocksMovement ? '#fb7185' : '#fbbf24'}
              fillOpacity={selected ? 0.55 : 0.3}
              stroke={selected ? '#ffffff' : '#fde68a'}
              strokeWidth={selected ? 2.5 : 1.25}
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <polygon
              key={item.id}
              {...common}
              data-footprint="marker"
              points={diamond(item.transform, MARKER_RADIUS)}
              fill="#fde68a"
              fillOpacity={selected ? 0.9 : 0.6}
              stroke={selected ? '#ffffff' : '#101923'}
              strokeWidth={selected ? 2.5 : 1}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        {monsters.map((monster) => {
          const centre = layoutCellCenter(monster.startingCell.location);
          const colour = castColour(monster.ref);
          const selected =
            selectedKey === `creature:${monster.id}` ||
            selectedKey === `cast:${monster.ref}`;
          return (
            <g
              key={monster.id}
              data-placed-creature={monster.id}
              data-ring-colour={colour}
              data-selected={selected || undefined}
              pointerEvents={pointerEvents}
              style={interactive ? { cursor: 'pointer' } : undefined}
              onPointerDown={press(() =>
                editing.current.selectCreature(monster.id)
              )}
            >
              {selected && (
                <circle
                  cx={centre.x}
                  cy={centre.z}
                  r={RING_RADIUS + 0.22}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <circle
                cx={centre.x}
                cy={centre.z}
                r={RING_RADIUS}
                fill="#101923"
                fillOpacity={0.55}
                stroke={colour}
                strokeWidth={selected ? 4 : 3}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
        {exits.map((exit) => {
          const at = layoutCellCenter(exit.cell);
          return (
            <g
              key={`exit:${exit.id}`}
              data-exit={exit.id}
              data-exit-cell={`${exit.cell.q},${exit.cell.r}`}
              pointerEvents="none"
            >
              <rect
                x={at.x - 0.5}
                y={at.z - 0.5}
                width={1}
                height={1}
                fill="#38bdf8"
                fillOpacity={0.35}
                stroke="#e0f2fe"
                strokeWidth={1.5}
                strokeDasharray="3 2"
                vectorEffect="non-scaling-stroke"
              />
              <polygon
                points={`${at.x - 0.25},${at.z - 0.2} ${at.x + 0.3},${at.z} ${at.x - 0.25},${at.z + 0.2}`}
                fill="#e0f2fe"
              />
            </g>
          );
        })}
        {partyStart &&
          (() => {
            const at = layoutCellCenter(partyStart);
            const selected = selectedKey === 'start';
            return (
              <g
                data-placed-start=""
                data-selected={selected || undefined}
                pointerEvents={pointerEvents}
                style={interactive ? { cursor: 'pointer' } : undefined}
                onPointerDown={press(() => editing.current.selectPartyStart())}
              >
                <polygon
                  points={diamond(at, 0.7)}
                  fill="#a7ffeb"
                  fillOpacity={0.85}
                  stroke={selected ? '#ffffff' : '#0b3b33'}
                  strokeWidth={selected ? 3 : 1.5}
                  vectorEffect="non-scaling-stroke"
                />
                <polygon
                  points={diamond(at, 0.28)}
                  fill="#0b3b33"
                  pointerEvents="none"
                />
              </g>
            );
          })()}
      </>
    );
  },
  (previous, next) =>
    previous.monsters === next.monsters &&
    previous.items === next.items &&
    previous.declarations === next.declarations &&
    previous.partyStart === next.partyStart &&
    previous.exits === next.exits &&
    previous.selectedKey === next.selectedKey &&
    previous.propKey === next.propKey &&
    previous.interactive === next.interactive
);

function selectedKeyOf(selection: StudioSelection): string {
  switch (selection.kind) {
    case 'creature':
      return `creature:${selection.id}`;
    case 'castMember':
      return `cast:${selection.ref}`;
    case 'partyStart':
      return 'start';
    default:
      return '';
  }
}

/** Placed creatures, props and the party start in Layout (R7). Glyphs are in
 * world space; names are screen-sized, like map labels. A click in the
 * select tool selects through the S0 contract; Shift on a prop extends the
 * pick. Under any other tool glyphs ignore the pointer, so painting is
 * unchanged. Drawing a creature inside a region's fill never puts it in the
 * region. */
export function LayoutPlacedOverlay({
  monsters,
  items,
  declarations,
  partyStart,
  exits = NO_EXITS,
  concealedCells,
  editing,
  interactive,
  worldTransform,
  transform,
}: {
  monsters: readonly RoomMonsterPlacement[];
  items: readonly WorldProp[];
  declarations: Readonly<Record<string, RoomPropDeclaration>>;
  partyStart?: RoomHexCell;
  /** The root `exits`, drawn at their cells (rpg-project#578). */
  exits?: readonly SiteExit[];
  /** The armed concealment's cells, hatched under the glyphs. */
  concealedCells?: readonly RoomHexCell[];
  editing: LayoutPlacedEditing;
  interactive: boolean;
  /** The world-to-surface SVG transform the floor uses. */
  worldTransform?: string;
  transform: LayoutTransform;
}): React.JSX.Element {
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const selected = editing.selected;
  const propIds =
    selected.kind === 'prop' || selected.kind === 'group'
      ? [selected.id]
      : (editing.picked ?? []);
  const scale = transform.scale;
  const label = (
    key: string,
    text: string,
    at: WorldPoint,
    below: number,
    colour: string
  ): React.JSX.Element | null => {
    const point = worldToClient(at, transform);
    if (!point) return null;
    return (
      <text
        key={key}
        data-placed-name={key}
        x={point.x - transform.bounds.left}
        y={point.y - transform.bounds.top + below * scale + 9}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={11}
        fontWeight={600}
        fill={colour}
        stroke="#101923"
        strokeWidth={3}
        paintOrder="stroke"
        pointerEvents="none"
        style={{ userSelect: 'none' }}
      >
        {text}
      </text>
    );
  };
  return (
    <>
      {concealedCells && concealedCells.length > 0 && (
        <g
          className="es-layout-concealed"
          transform={worldTransform}
          pointerEvents="none"
        >
          <defs>
            <pattern
              id="es-concealed-hatch"
              patternUnits="userSpaceOnUse"
              width={0.45}
              height={0.45}
              patternTransform="rotate(45)"
            >
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={0.45}
                stroke="#c4b5fd"
                strokeWidth={0.14}
              />
            </pattern>
          </defs>
          {concealedCells.map((cell) => (
            <polygon
              key={`${cell.q},${cell.r}`}
              data-concealed-cell={`${cell.q},${cell.r}`}
              points={layoutCellCorners(cell)
                .map((corner) => `${corner.x},${corner.z}`)
                .join(' ')}
              fill="url(#es-concealed-hatch)"
              stroke="#c4b5fd"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      )}
      <g className="es-layout-placed" transform={worldTransform}>
        <PlacedGlyphs
          monsters={monsters}
          items={items}
          declarations={declarations}
          partyStart={partyStart}
          exits={exits}
          selectedKey={selectedKeyOf(selected)}
          propKey={propIds.join('\n')}
          interactive={interactive}
          editing={editingRef}
        />
      </g>
      <g className="es-layout-placed-names" aria-hidden="true">
        {monsters.map((monster) =>
          label(
            `creature:${monster.id}`,
            editing.names.get(monster.id) ?? monster.id,
            layoutCellCenter(monster.startingCell.location),
            RING_RADIUS,
            castColour(monster.ref)
          )
        )}
        {items.map((item) => {
          const declaration = declarations[item.id];
          const width = declaration
            ? Math.max(declaration.footprint.width, declaration.footprint.depth)
            : MARKER_RADIUS * 2;
          // A prop's label shows at a zoom where it fits over its glyph.
          const fits = item.label.length * 6.5 <= Math.max(width, 1.7) * scale;
          return fits
            ? label(
                `prop:${item.id}`,
                item.label,
                item.transform,
                declaration
                  ? Math.max(
                      declaration.footprint.width,
                      declaration.footprint.depth
                    ) / 2
                  : MARKER_RADIUS,
                '#fde68a'
              )
            : null;
        })}
        {exits.map((exit) =>
          label(
            `exit:${exit.id}`,
            `Exit ${exit.id}`,
            layoutCellCenter(exit.cell),
            0.5,
            '#e0f2fe'
          )
        )}
        {partyStart &&
          label(
            'start',
            'Party start',
            layoutCellCenter(partyStart),
            0.7,
            '#a7ffeb'
          )}
      </g>
    </>
  );
}
