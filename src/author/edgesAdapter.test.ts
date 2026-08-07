import { create } from '@bufbuild/protobuf';
import {
  FloorPlanEdgeKind,
  FloorPlanSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { describe, expect, it } from 'vitest';
import {
  connectorIndexForDoorId,
  floorPlanEdgesToServerEdges,
  hasServerEdges,
} from './edgesAdapter';
import { S2_LOOP_FLOORPLAN, SHOWCASE_FLOORPLAN } from './fixtures';

describe('hasServerEdges', () => {
  it('is true for the re-recorded showcase fixture (real v0.1.118 edges)', () => {
    expect(hasServerEdges(SHOWCASE_FLOORPLAN)).toBe(true);
  });

  it('is false for a pre-#767 fixture with no edges field populated', () => {
    expect(hasServerEdges(S2_LOOP_FLOORPLAN)).toBe(false);
  });

  it('is false for an empty FloorPlan', () => {
    expect(hasServerEdges(create(FloorPlanSchema, {}))).toBe(false);
  });
});

describe('floorPlanEdgesToServerEdges', () => {
  it('consumes the recorded edges verbatim — no re-derivation when edges are present', () => {
    const edges = floorPlanEdgesToServerEdges(SHOWCASE_FLOORPLAN);
    expect(edges).toHaveLength(SHOWCASE_FLOORPLAN.edges.length);
    expect(edges).toHaveLength(196);

    const solid = edges.filter((e) => e.kind === 'solid');
    const doors = edges.filter((e) => e.kind === 'door');
    expect(solid).toHaveLength(194);
    expect(doors).toHaveLength(2);

    // One-to-one field mapping, not a recompute: pick the first wire edge
    // and confirm the adapted entry matches it exactly.
    const wireFirst = SHOWCASE_FLOORPLAN.edges[0]!;
    const adaptedFirst = edges[0]!;
    expect(adaptedFirst.from).toEqual([
      wireFirst.from!.column,
      wireFirst.from!.row,
    ]);
    expect(adaptedFirst.to).toEqual([wireFirst.to!.column, wireFirst.to!.row]);
  });

  it('maps FLOOR_PLAN_EDGE_KIND_DOOR to kind: "door" and carries doorId through', () => {
    const edges = floorPlanEdgesToServerEdges(SHOWCASE_FLOORPLAN);
    const doors = edges.filter((e) => e.kind === 'door');
    expect(doors.map((d) => d.doorId).sort()).toEqual(
      ['showcase-door-antechamber-shrine', 'showcase-door-shrine-vault'].sort()
    );
  });

  it('never sets doorId on a solid edge', () => {
    const edges = floorPlanEdgesToServerEdges(SHOWCASE_FLOORPLAN);
    for (const e of edges) {
      if (e.kind === 'solid') expect(e.doorId).toBeUndefined();
    }
  });

  it('preserves an exterior edge endpoint outside the rendered bounds (negative column) rather than clamping it', () => {
    const edges = floorPlanEdgesToServerEdges(SHOWCASE_FLOORPLAN);
    const exterior = edges.find((e) => e.from[0] === -1 || e.to[0] === -1);
    expect(exterior).toBeDefined();
  });

  it('returns an empty array for a FloorPlan with no edges', () => {
    expect(floorPlanEdgesToServerEdges(S2_LOOP_FLOORPLAN)).toEqual([]);
  });
});

describe('connectorIndexForDoorId', () => {
  it('resolves a real connector door_id to its connector index — the wire-level correlation a door click can use', () => {
    expect(
      connectorIndexForDoorId(
        SHOWCASE_FLOORPLAN,
        'showcase-door-antechamber-shrine'
      )
    ).toBe(0);
    expect(
      connectorIndexForDoorId(SHOWCASE_FLOORPLAN, 'showcase-door-shrine-vault')
    ).toBe(1);
  });

  it('returns null for an unknown door_id', () => {
    expect(
      connectorIndexForDoorId(SHOWCASE_FLOORPLAN, 'not-a-real-door')
    ).toBeNull();
  });

  it('returns null when doorId is undefined (a solid edge)', () => {
    expect(connectorIndexForDoorId(SHOWCASE_FLOORPLAN, undefined)).toBeNull();
  });
});

describe('FloorPlanEdgeKind sanity (guards the adapter’s own enum mapping)', () => {
  it('SOLID and DOOR are the only non-zero values the wire uses', () => {
    expect(FloorPlanEdgeKind.SOLID).toBe(1);
    expect(FloorPlanEdgeKind.DOOR).toBe(2);
  });
});
