/**
 * edgesAdapter — turns the wire's `FloorPlan.edges` (rpg-api-protos
 * v0.1.118+, rpg-api#767's generated-edges wave: `repeated FloorPlanEdge
 * edges = 6`) into this concept's own edge model, the SAME `{from, to,
 * kind}` shape `dungeonYaml.ts`'s `WallDoc` (target-dialect authored
 * `doc.walls`) already uses — one internal edge shape, one geometry helper
 * per view (`hexLayout.ts`'s `edgeBetweenCells` for the 2D board,
 * `preview3d/DungeonPreview3D.tsx`'s own for the 3D preview), for
 * `DungeonPreview3D.tsx` to consume (originally also `Board.tsx`'s 2D
 * board, retired 2026-08-07 with the edit-mode tab — rpg-project#194).
 * The renderer never parses the proto shape (`FloorPlanCell`/
 * `FloorPlanEdgeKind`) directly — this module is the one place that does.
 *
 * This is a pure field-rename/enum-map, never a compilation step:
 * `FloorPlan.edges` is already the server's own canonical, deduplicated
 * truth (FloorPlanEdge's own doc comment: "FloorPlan.edges MUST emit
 * exactly one record for each physical edge"), so there's no dedup or
 * orientation logic to re-derive here, unlike `doc.walls`'s own author-time
 * mutators.
 */
import type {
  FloorPlan,
  FloorPlanCell,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { FloorPlanEdgeKind } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { WallDoc } from './dungeonYaml';

/** `WallDoc` plus the one field it has no analog for: a DOOR edge's
 * `doorId`, carried through so a rendered door can be traced back to the
 * `FloorPlanConnector` it belongs to. A generated connector door's
 * `FloorPlanEdge.doorId` always equals that connector's own `doorId`
 * (`FloorPlanEdge`'s own doc comment: "For a generated connector door it
 * MUST equal that FloorPlanConnector.door_id") — confirmed against a real
 * recorded response, not just the contract text: `fixtures.ts`'s
 * `SHOWCASE_FLOORPLAN.edges` has exactly two DOOR entries, and both
 * `doorId`s match `SHOWCASE_FLOORPLAN.connectors` verbatim. A SOLID edge
 * never carries one (same doc comment: "MUST be absent for SOLID edges"). */
export interface ServerEdge extends WallDoc {
  doorId?: string;
}

/** Whether `floorPlan` carries real generated wall/door truth. False for
 * every response compiled/recorded before v0.1.118
 * (`compileFloorPlanLocally`'s fixtures-mode fallback, which has no
 * `edges` field to populate at all, and the pre-#767 recorded fixtures
 * `SMOKE_TEST_FLOORPLAN`/`S2_LOOP_FLOORPLAN`). True for a live server
 * response from the #767 wave onward and for `SHOWCASE_FLOORPLAN`'s own
 * re-recorded `edges`. Callers gate the server-truth rendering path on
 * this emptiness check rather than on `serverState` alone — a
 * stale-pinned client talking to a fresh server (or the reverse) is
 * exactly the case this catches that a mode flag wouldn't. */
export function hasServerEdges(floorPlan: FloorPlan): boolean {
  return floorPlan.edges.length > 0;
}

function cellToTuple(cell: FloorPlanCell | undefined): [number, number] {
  return cell ? [cell.column, cell.row] : [0, 0];
}

/** The adapter itself — wire shape in, this concept's own edge model out. */
export function floorPlanEdgesToServerEdges(
  floorPlan: FloorPlan
): ServerEdge[] {
  return floorPlan.edges.map((edge) => ({
    from: cellToTuple(edge.from),
    to: cellToTuple(edge.to),
    kind: edge.kind === FloorPlanEdgeKind.DOOR ? 'door' : 'solid',
    doorId: edge.doorId,
  }));
}

/** Resolve a DOOR edge's `doorId` back to its owning connector's index in
 * `floorPlan.connectors` — the SAME index `doc.connectors`/
 * `DungeonPreview3D.tsx`'s `onSelectConnector` prop key off. Originally
 * wired a rendered server-truth door edge click to open `ConnectorInspector`
 * (edit mode's own connector-editing popup); that popup retired with the
 * edit tab (2026-08-07, rpg-project#194) and `onSelectConnector` currently
 * has no caller, but this resolution itself is generic — still correct
 * for a future consumer of the same index. `null` when `doorId` doesn't
 * match any connector — shouldn't happen for a real generated connector
 * door per `FloorPlanEdge`'s own contract, but a future non-connector
 * door (TARGET-YAML.md's proposed inner-wall doors, rpg-project#179)
 * would fall through here rather than crash. */
export function connectorIndexForDoorId(
  floorPlan: FloorPlan,
  doorId: string | undefined
): number | null {
  if (!doorId) return null;
  const index = floorPlan.connectors.findIndex((c) => c.doorId === doorId);
  return index === -1 ? null : index;
}
