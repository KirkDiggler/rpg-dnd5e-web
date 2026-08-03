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
import { SHOWCASE_FLOORPLAN, SHOWCASE_YAML } from './fixtures';

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
