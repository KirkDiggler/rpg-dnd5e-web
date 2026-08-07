/**
 * Board.test.tsx — the first render-layer test for this concept
 * (`dungeonYaml.test.ts` already covers the data layer; this file is the
 * "tests that survive extraction" half of the 2026-08-02 operating bar,
 * CONTRACT.md's "Operating bar: this concept incubates the real
 * components" section). Renders `Board` directly against real fixture
 * data (`fixtures.ts`'s `SHOWCASE_FLOORPLAN`/`SHOWCASE_YAML`, the same
 * real recorded `PutDungeon` response every other test in this concept
 * uses) and asserts on its own props/callbacks — not wired through
 * `DungeonBuilderConcept.tsx`'s full composition root, so this test
 * keeps meaning if `Board` is later extracted into the real editor.
 *
 * Covers the top-level-placement render/select gap named in CONTRACT.md's
 * "What did NOT ship" ledger ("Edit mode's Board.tsx does not yet render
 * top-level placements") — the SAME marker rendering/selection the
 * room-scoped `place:` loop already had, now also covering `doc.place`
 * (`roomId: null`, TARGET-YAML.md's "top-level placement" section).
 */
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Board } from './Board';
import { parseDungeon } from './dungeonYaml';
import {
  S2_LOOP_FLOORPLAN,
  SHOWCASE_FLOORPLAN,
  SHOWCASE_YAML,
} from './fixtures';

/** showcase.yaml's shrine room already has one room-scoped altar
 * (`at: [11, 3]`) — appending a top-level one at a different, empty
 * absolute cell (col 3 row 2, inside antechamber's own column range,
 * width 6) exercises the map-down-eligible case without colliding with
 * anything already placed. */
const YAML_WITH_TOP_LEVEL_PLACEMENT =
  SHOWCASE_YAML.trimEnd() +
  '\nplace:\n  - { ref: "dnd5e:props:altar", at: [3, 2] }\n';

function noop() {
  return vi.fn();
}

function renderBoard(
  doc: ReturnType<typeof parseDungeon>['doc'],
  overrides = {}
) {
  const props = {
    floorPlan: SHOWCASE_FLOORPLAN,
    doc,
    selectedPalette: null,
    selectedPlacement: null,
    selectedConnectorIndex: null,
    onPlace: noop(),
    onSelect: noop(),
    onMove: noop(),
    onReject: noop(),
    onSelectConnector: noop(),
    onWallGashClick: noop(),
    selectedTool: null,
    onToggleWall: noop(),
    onToggleWallKind: noop(),
    onToggleHole: noop(),
    onSetPoint: noop(),
    ...overrides,
  };
  return render(<Board {...props} />);
}

/** Marker groups have a real structural signature — a direct-child
 * `<circle>` AND a direct-child `<text>` — distinct from label groups or
 * the entrance marker, which don't have exactly this shape. Matches the
 * live-verification pattern used to confirm this feature manually before
 * this test was written (see the shipping commit's report). */
function findMarkerGroups(
  container: HTMLElement,
  label: string
): SVGGElement[] {
  return Array.from(container.querySelectorAll<SVGGElement>('svg g')).filter(
    (g) =>
      g.querySelector(':scope > circle') &&
      g.querySelector(':scope > text')?.textContent === label
  );
}

describe('Board — top-level placements (doc.place, roomId: null)', () => {
  it('renders a top-level place: entry as a marker at its absolute cell, alongside the existing room-scoped one', () => {
    const { doc } = parseDungeon(YAML_WITH_TOP_LEVEL_PLACEMENT);
    expect(doc.place).toHaveLength(1);

    const { container } = renderBoard(doc);

    // "AL" (altar's short code, paletteData.ts) appears twice: showcase's
    // own room-scoped altar (shrine, [11,3]) and the new top-level one.
    const altarGroups = findMarkerGroups(container, 'AL');
    expect(altarGroups).toHaveLength(2);
  });

  it('clicking a top-level marker selects it with roomId: null, not a room id', () => {
    const { doc } = parseDungeon(YAML_WITH_TOP_LEVEL_PLACEMENT);
    const onSelect = vi.fn();
    const { container } = renderBoard(doc, { onSelect });

    const altarGroups = findMarkerGroups(container, 'AL');
    // The top-level one is appended after every room's own place: loop
    // (Board.tsx's own render order), so it's last in DOM order.
    const topLevelGroup = altarGroups[altarGroups.length - 1];
    fireEvent.pointerDown(topLevelGroup);

    expect(onSelect).toHaveBeenCalledWith({ roomId: null, index: 0 });
  });

  it('highlights the correct marker when selectedPlacement targets a top-level entry', () => {
    const { doc } = parseDungeon(YAML_WITH_TOP_LEVEL_PLACEMENT);
    const { container } = renderBoard(doc, {
      selectedPlacement: { roomId: null, index: 0 },
    });

    const altarGroups = findMarkerGroups(container, 'AL');
    const topLevelCircle =
      altarGroups[altarGroups.length - 1].querySelector('circle');
    const roomScopedCircle = altarGroups[0].querySelector('circle');

    // isSelected drives stroke color (#ffd76a selected vs #000 default) —
    // same convention the room-scoped marker loop already used.
    expect(topLevelCircle?.getAttribute('stroke')).toBe('#ffd76a');
    expect(roomScopedCircle?.getAttribute('stroke')).toBe('#000');
  });

  it('a document with no top-level placements renders none — the base case stays untouched', () => {
    const { doc } = parseDungeon(SHOWCASE_YAML);
    expect(doc.place).toHaveLength(0);

    const { container } = renderBoard(doc);
    // Only the pre-existing room-scoped altar remains.
    expect(findMarkerGroups(container, 'AL')).toHaveLength(1);
  });
});

describe('Board — selecting an existing room-scoped marker still works (regression)', () => {
  it('clicking a room-scoped marker still selects it with the real roomId, unaffected by the top-level addition', () => {
    const { doc } = parseDungeon(SHOWCASE_YAML);
    const onSelect = vi.fn();
    const { container } = renderBoard(doc, { onSelect });

    const altarGroups = findMarkerGroups(container, 'AL');
    expect(altarGroups).toHaveLength(1);
    fireEvent.pointerDown(altarGroups[0]);

    expect(onSelect).toHaveBeenCalledWith({
      roomId: 'shrine',
      index: expect.any(Number),
    });
  });
});

describe('Board — wall/door source: real server edges vs the derived fallback (rpg-project#169 wire-edges unit)', () => {
  it('shows the "server edges" badge and renders one <line> per recorded FloorPlan.edges entry when a response carries them (SHOWCASE_FLOORPLAN, re-recorded against v0.1.118)', () => {
    const { doc } = parseDungeon(SHOWCASE_YAML);
    const { getByTestId, container } = renderBoard(doc);

    const badge = getByTestId('db-wall-source-indicator');
    expect(badge.textContent).toContain('SERVER EDGES');
    expect(badge.textContent).toContain('196');

    // Solid server edges render as plain, non-interactive <line>s in
    // '#c9bfae' — distinct from doc.walls's own dashed authoring overlay,
    // which showcase.yaml doesn't use at all (no walls: key), so every
    // matching line here can only have come from the server-edges pass.
    const solidLines = Array.from(
      container.querySelectorAll<SVGLineElement>('line')
    ).filter((l) => l.getAttribute('stroke') === '#c9bfae');
    expect(solidLines).toHaveLength(194);
  });

  it('falls back to the DERIVED badge and the old door_row/connector cell rendering for a FloorPlan with no edges (pre-#767 fixture)', () => {
    const { doc } = parseDungeon(SHOWCASE_YAML);
    const { getByTestId, container } = render(
      <Board
        floorPlan={S2_LOOP_FLOORPLAN}
        doc={doc}
        selectedPalette={null}
        selectedPlacement={null}
        selectedConnectorIndex={null}
        onPlace={noop()}
        onSelect={noop()}
        onMove={noop()}
        onReject={noop()}
        onSelectConnector={noop()}
        onWallGashClick={noop()}
        selectedTool={null}
        onToggleWall={noop()}
        onToggleWallKind={noop()}
        onToggleHole={noop()}
        onSetPoint={noop()}
      />
    );

    const badge = getByTestId('db-wall-source-indicator');
    expect(badge.textContent).toContain('DERIVED');

    // No server-edge <line>s at all — the connector's gap column still
    // renders via the old cell-fill classes instead.
    expect(container.querySelector('.db-cell-wall')).not.toBeNull();
    expect(container.querySelectorAll('line[stroke="#c9bfae"]')).toHaveLength(
      0
    );
  });

  it('clicking a rendered DOOR edge whose door_id resolves to a connector opens ConnectorInspector via the same onSelectConnector callback the door-row cell already uses', () => {
    const { doc } = parseDungeon(SHOWCASE_YAML);
    const onSelectConnector = vi.fn();
    const { container } = renderBoard(doc, { onSelectConnector });

    const doorLines = Array.from(
      container.querySelectorAll<SVGLineElement>('line')
    ).filter((l) => l.getAttribute('stroke') === '#ffb347');
    // Both showcase connectors are generated doors, so both DOOR edges
    // resolve — 2 clickable door lines, matching floorPlan.connectors.length.
    expect(doorLines).toHaveLength(2);

    fireEvent.click(doorLines[0]);
    expect(onSelectConnector).toHaveBeenCalledWith(expect.any(Number));
    const calledIndex = onSelectConnector.mock.calls[0][0];
    expect([0, 1]).toContain(calledIndex);
  });
});
