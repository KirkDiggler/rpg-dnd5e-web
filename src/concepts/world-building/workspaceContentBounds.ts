import type { RoomDraft, RoomFootprint } from './roomDraft';
import type { SiteScope } from './siteScope';
import { wallOpeningPoint } from './structuralWallGeometry';
import type { WorldPoint, WorldTransform } from './types';
import {
  containsWorkspaceAabb,
  containsWorkspaceCell,
  containsWorkspacePoint,
  type WorkspaceBounds,
} from './workspaceGeometry';

function aabb(points: readonly WorldPoint[]): WorkspaceBounds {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minZ: Math.min(...points.map((p) => p.z)),
    maxZ: Math.max(...points.map((p) => p.z)),
  };
}
/** Poses are already world-space, including grouped/supported props. */
function rectangle(
  pose: Pick<WorldTransform, 'x' | 'z' | 'rotationY'>,
  footprint: RoomFootprint
): WorldPoint[] {
  const c = Math.cos(pose.rotationY),
    s = Math.sin(pose.rotationY);
  return [-1, 1].flatMap((dx) =>
    [-1, 1].map((dz) => {
      const x = footprint.offsetX + (dx * footprint.width) / 2,
        z = footprint.offsetZ + (dz * footprint.depth) / 2;
      return { x: pose.x + c * x + s * z, z: pose.z - s * x + c * z };
    })
  );
}
/** Only explicit centered conversion protects extents. Legacy allowances remain unchanged. */
export function validateWorkspaceContent(
  draft: RoomDraft,
  scope: SiteScope
): void {
  const workspace = draft.workspace;
  if (workspace.kind !== 'centered-odd-r') return;
  const refuse = (path: string): never => {
    throw new Error(
      `${path}: outside the centered authoring workspace; resize would not preserve authored content (conservative AABB coverage).`
    );
  };
  const point = (p: WorldPoint, path: string): void => {
    if (!containsWorkspacePoint(workspace, p)) refuse(path);
  };
  const cell = (p: { q: number; r: number }, path: string): void => {
    if (!containsWorkspaceCell(workspace, p)) refuse(path);
  };
  const shape = (points: WorldPoint[], path: string): void => {
    if (!containsWorkspaceAabb(workspace, aabb(points))) refuse(path);
  };
  draft.room.walkableHexes.forEach((p, i) =>
    cell(p, `room.walkableHexes[${i}] (${p.q},${p.r})`)
  );
  if (draft.room.partyStart) cell(draft.room.partyStart, 'room.partyStart');
  draft.room.monsterDeclarations.forEach((m) =>
    cell(
      m.startingCell.location,
      `room.monsterDeclarations[${m.id}].startingCell`
    )
  );
  for (const item of draft.scene.items) {
    point(item.transform, `scene.items[${item.id}].transform`);
    const declaration = draft.room.propDeclarations[item.id];
    if (declaration)
      shape(
        rectangle(item.transform, declaration.footprint),
        `room.propDeclarations[${item.id}].footprint`
      );
  }
  for (const group of draft.scene.groups)
    point(group.transform, `scene.groups[${group.id}].transform`);
  for (const label of draft.scene.mapLabels ?? [])
    point(label.location, `scene.mapLabels[${label.id}].location`);
  for (const region of draft.scene.authoringRegions ?? [])
    if (region.boundary.kind === 'explicit')
      region.boundary.cells.forEach((p, i) =>
        cell(p, `scene.authoringRegions[${region.id}].boundary.cells[${i}]`)
      );
  for (const exit of scope.exits ?? [])
    cell(exit.cell, `scope.exits[${exit.id}].cell`);
  for (const [id, concealment] of Object.entries(scope.concealments ?? {}))
    concealment.cells?.forEach((p, i) =>
      cell(p, `scope.concealments[${id}].cells[${i}]`)
    );
  for (const wall of draft.room.walls ?? []) {
    const path = `room.walls[${wall.id}]`,
      { start, end } = wall.line;
    shape([start, end], `${path}.line`);
    const length = Math.hypot(end.x - start.x, end.z - start.z),
      rotationY = Math.atan2(-(end.z - start.z), end.x - start.x);
    const pose = {
      x: (start.x + end.x) / 2,
      z: (start.z + end.z) / 2,
      rotationY,
    };
    shape(
      rectangle(pose, {
        width: length,
        depth: wall.appearance.thickness,
        offsetX: 0,
        offsetZ: 0,
      }),
      `${path}.appearance.thickness`
    );
    shape(rectangle(pose, wall.blocker.footprint), `${path}.blocker.footprint`);
    for (const opening of wall.openings) {
      const center = wallOpeningPoint({ wall, openingId: opening.id });
      // The fitted door and opening use the wall's authored thickness, not mesh bounds.
      shape(
        rectangle(
          { ...center, rotationY },
          {
            width: opening.width,
            depth: wall.appearance.thickness,
            offsetX: 0,
            offsetZ: 0,
          }
        ),
        `${path}.openings[${opening.id}]${opening.door ? `.door[${opening.door.id}]` : ''}`
      );
    }
  }
}
