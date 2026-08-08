/**
 * RegionPanel.test.tsx — v0.3 wire consumption unit (2026-08-05). Proves
 * the region-tree source badge and drift warnings actually RENDER, not
 * just that `regionTreeWire.ts`'s pure logic is correct
 * (`regionTreeWire.test.ts` already covers that). No live server carries
 * `FloorPlan.regions` yet (rpg-api-protos#214 conformance review finding
 * A4), so every `FloorPlan` fixture here is hand-constructed — marked
 * SYNTHETIC per this concept's existing fixtures.ts convention.
 */
import { create } from '@bufbuild/protobuf';
import {
  FloorPlanSchema,
  type FloorPlan,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  createRegion,
  parseDungeon,
  toDungeonDoc,
  type DungeonDoc,
} from '../dungeonYaml';
import { emptyCanvasYaml } from './emptyCanvasDoc';
import { RegionPanel } from './RegionPanel';
import type { RegionEditing } from './useRegionEditing';

function docWithTwoSiblingRegions(): DungeonDoc {
  const { cst, doc } = parseDungeon(emptyCanvasYaml(20, 20));
  createRegion(cst, doc, 'north-alcove', 'chamber', [
    [0, 0],
    [0, 1],
  ]);
  const afterFirst = toDungeonDoc(cst);
  createRegion(cst, afterFirst, 'east-annex', 'chamber', [
    [10, 10],
    [10, 11],
  ]);
  return toDungeonDoc(cst);
}

function stubRegionEdit(): RegionEditing {
  return {
    pendingCells: [],
    togglePendingCell: vi.fn(),
    setPendingCellMembership: vi.fn(),
    clearPending: vi.fn(),
    selectedRegionId: null,
    selectRegion: vi.fn(),
    justCreatedId: null,
    handleCreate: vi.fn(),
    handleToggleCellOnSelected: vi.fn(),
    setSelectedRegionCellMembership: vi.fn(),
    handleRename: vi.fn(),
    handleSetArchetype: vi.fn(),
    handleDelete: vi.fn(),
    handleConnect: vi.fn(),
    conflictFlash: null,
    beginStroke: vi.fn(),
    endStroke: vi.fn(),
  };
}

function floorPlanWithRegions(
  regions: { id: string; parentId?: string }[]
): FloorPlan {
  return create(FloorPlanSchema, {
    rooms: [],
    connectors: [],
    height: 0,
    doorRow: 0,
    floorCells: [],
    regions: regions.map((r) => ({
      id: r.id,
      cells: [],
      parentId: r.parentId,
    })),
  });
}

describe('RegionPanel — v0.3 wire consumption source badge/warnings', () => {
  it('shows the DERIVED badge with no liveFloorPlan (fixtures mode / rollout gap)', () => {
    const doc = docWithTwoSiblingRegions();
    render(
      <RegionPanel
        doc={doc}
        regionEdit={stubRegionEdit()}
        liveFloorPlan={null}
      />
    );
    expect(
      screen.getByTestId('db-region-tree-source-indicator').textContent
    ).toContain('REGIONS: DERIVED');
    expect(screen.queryByTestId('db-region-tree-drift-warning')).toBeNull();
  });

  it('shows the DERIVED badge when a live response carries an EMPTY regions list (rollout gap, not "declares none")', () => {
    const doc = docWithTwoSiblingRegions();
    render(
      <RegionPanel
        doc={doc}
        regionEdit={stubRegionEdit()}
        liveFloorPlan={floorPlanWithRegions([])}
      />
    );
    expect(
      screen.getByTestId('db-region-tree-source-indicator').textContent
    ).toContain('REGIONS: DERIVED');
  });

  it('shows the SERVER badge and no warning when the wire agrees with the derivation', () => {
    const doc = docWithTwoSiblingRegions();
    const floorPlan = floorPlanWithRegions([
      { id: 'north-alcove' },
      { id: 'east-annex' },
    ]);
    render(
      <RegionPanel
        doc={doc}
        regionEdit={stubRegionEdit()}
        liveFloorPlan={floorPlan}
      />
    );
    expect(
      screen.getByTestId('db-region-tree-source-indicator').textContent
    ).toContain('REGIONS: SERVER');
    expect(screen.queryByTestId('db-region-tree-drift-warning')).toBeNull();
  });

  it('renders a visible mismatch warning naming the region when the wire parent disagrees with the derivation', () => {
    const doc = docWithTwoSiblingRegions();
    // Disjoint siblings client-side, but the wire (incorrectly) claims
    // east-annex nests under north-alcove — a real server/client
    // containment disagreement.
    const floorPlan = floorPlanWithRegions([
      { id: 'north-alcove' },
      { id: 'east-annex', parentId: 'north-alcove' },
    ]);
    render(
      <RegionPanel
        doc={doc}
        regionEdit={stubRegionEdit()}
        liveFloorPlan={floorPlan}
      />
    );
    const warningText = screen.getByTestId(
      'db-region-tree-drift-warning'
    ).textContent;
    expect(warningText).toContain('east-annex');
    expect(warningText).toContain('north-alcove');
    expect(warningText).toContain('disagreement');
  });

  it('renders a visible warning for a dangling parent_id, and still shows the region as a root row', () => {
    const doc = docWithTwoSiblingRegions();
    const floorPlan = floorPlanWithRegions([
      { id: 'north-alcove', parentId: 'ghost-region' },
      { id: 'east-annex' },
    ]);
    render(
      <RegionPanel
        doc={doc}
        regionEdit={stubRegionEdit()}
        liveFloorPlan={floorPlan}
      />
    );
    const warningText = screen.getByTestId(
      'db-region-tree-drift-warning'
    ).textContent;
    expect(warningText).toContain('north-alcove');
    expect(warningText).toContain('ghost-region');
    expect(warningText).toContain('treated as root');
    // Still rendered as a normal clickable row, not dropped — throws if
    // absent, which IS the assertion.
    screen.getByText('north-alcove');
  });
});
