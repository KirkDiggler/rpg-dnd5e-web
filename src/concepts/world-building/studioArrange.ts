import type {
  AuthoringRegion,
  RegionLighting,
  RegionResolution,
} from './authoringRegions';
import { resolveAuthoringRegions } from './regionBoundaryGeometry';
import {
  isCellWithinWorkspace,
  moveRoomMonster,
  setRoomMonsterFacing,
  setRoomPartyStart,
  type RoomDraft,
  type RoomHexCell,
  type RoomMonsterPlacement,
} from './roomDraft';
import {
  entityById,
  moveSelection,
  rotateSelection,
  selectionPivot,
  selectionPropIds,
  setSelectionHeight,
  topLevelSelectedIds,
} from './sceneState';
import {
  previewWallTransform,
  resizeWallLength,
  setWallAppearance,
  wallDirectionYaw,
  wallLength,
  wallMidpoint,
} from './structuralWallEditing';
import type { StructuralWall } from './structuralWalls';
import type { StudioDoorPreview, StudioDoorTarget } from './studioDoorEditing';
import type { MapLabel, WorldPoint, WorldScene, WorldTransform } from './types';

/** Existing author identities, not renderer sentinels or a new selection store.
 * Actor and party start are deliberately distinct even if an actor's id is
 * the renderer's current start-marker spelling. */
export type StudioArrangeTarget =
  | { readonly kind: 'scene'; readonly ids: readonly string[] }
  | { readonly kind: 'wall'; readonly id: string }
  | { readonly kind: 'label'; readonly id: string }
  | { readonly kind: 'actor'; readonly id: string }
  | { readonly kind: 'start' }
  | StudioDoorTarget;

export type StudioArrangeHeight =
  | { readonly kind: 'value'; readonly scale: number }
  | { readonly kind: 'mixed' }
  | { readonly kind: 'absent' };

/** World units/radians/multipliers throughout. Display rounding is not data. */
export interface StudioSceneArrangeValues {
  readonly position: Readonly<Pick<WorldTransform, 'x' | 'y' | 'z'>>;
  /** Absent for multiple roots; their rotation operation is relative only. */
  readonly yaw?: number;
  readonly height: StudioArrangeHeight;
}

export interface StudioWallArrangeValues {
  readonly midpoint: Readonly<WorldPoint>;
  readonly yaw: number;
  readonly length: number;
  readonly appearance: Readonly<StructuralWall['appearance']>;
}

interface ArrangeSelectionIdentity {
  readonly selectionKey: string;
  /** Owner increments only when the explicit target changes. */
  readonly selectionRevision: number;
}

export type StudioArrangeSelection = ArrangeSelectionIdentity &
  (
    | (StudioSceneArrangeValues & {
        readonly kind: 'scene';
        readonly target: Extract<StudioArrangeTarget, { kind: 'scene' }>;
        readonly selectedIds: readonly string[];
        readonly rootIds: readonly string[];
        readonly rootCount: number;
        readonly preview?: StudioSceneArrangeValues;
      })
    | (StudioWallArrangeValues & {
        readonly kind: 'wall';
        readonly target: Extract<StudioArrangeTarget, { kind: 'wall' }>;
        readonly wall: Readonly<StructuralWall>;
        readonly preview?: StudioWallArrangeValues;
      })
    | {
        readonly kind: 'door';
        readonly target: StudioDoorTarget;
        readonly wall: Readonly<StructuralWall>;
        readonly opening: Readonly<StructuralWall['openings'][number]>;
        readonly door: Readonly<
          NonNullable<StructuralWall['openings'][number]['door']>
        >;
        readonly position: number;
        readonly width: number;
        readonly preview?: {
          readonly position: number;
          readonly width: number;
        };
      }
    | {
        readonly kind: 'label';
        readonly target: Extract<StudioArrangeTarget, { kind: 'label' }>;
        readonly label: Readonly<MapLabel>;
        readonly region?: Readonly<AuthoringRegion>;
        readonly resolution?: RegionResolution;
      }
    | {
        readonly kind: 'actor';
        readonly target: Extract<StudioArrangeTarget, { kind: 'actor' }>;
        readonly monster: Readonly<RoomMonsterPlacement>;
        readonly startingCell: Readonly<RoomMonsterPlacement['startingCell']>;
      }
    | {
        readonly kind: 'start';
        readonly target: Extract<StudioArrangeTarget, { kind: 'start' }>;
        readonly cell: Readonly<RoomHexCell>;
      }
  );

export interface StudioSceneArrangeEdit {
  readonly kind: 'scene-edit';
  readonly target: Extract<StudioArrangeTarget, { kind: 'scene' }>;
  readonly position?: Partial<Pick<WorldTransform, 'x' | 'y' | 'z'>>;
  readonly rotation?: {
    readonly kind: 'absolute' | 'relative';
    readonly radians: number;
  };
  readonly heightScale?: number;
}

export interface StudioWallArrangeEdit {
  readonly kind: 'wall-edit';
  readonly target: Extract<StudioArrangeTarget, { kind: 'wall' }>;
  readonly midpoint?: Partial<WorldPoint>;
  readonly yaw?: number;
  /** Anchor is the endpoint held fixed; the opposite endpoint moves/clamps. */
  readonly length?: {
    readonly value: number;
    readonly anchor: 'start' | 'end';
  };
  /** An asset swap is explicit; omitted appearance fields stay untouched. */
  readonly appearance?: Partial<StructuralWall['appearance']>;
}

export interface StudioActorArrangeEdit {
  readonly kind: 'actor-start';
  readonly target: Extract<StudioArrangeTarget, { kind: 'actor' }>;
  readonly location?: RoomHexCell;
  /** Omitted means unchanged; default deletes only the facing key. */
  readonly facing?:
    | { readonly kind: 'default' }
    | { readonly kind: 'compass'; readonly value: string };
}

export interface StudioStartArrangeEdit {
  readonly kind: 'start-position';
  readonly target: Extract<StudioArrangeTarget, { kind: 'start' }>;
  readonly location: RoomHexCell;
}

/** One dirty noun form is one candidate and one owner transaction, never a
 * list of separately committed property commands. Labels use the owner's
 * existing complete-document label transaction; deletes keep existing gates. */
export type StudioArrangeIntent =
  | {
      readonly kind: 'door-edit';
      readonly target: StudioDoorTarget;
      readonly position?: number;
      readonly width?: number;
    }
  | { readonly kind: 'door-remove'; readonly target: StudioDoorTarget }
  | StudioSceneArrangeEdit
  | StudioWallArrangeEdit
  | {
      readonly kind: 'wall-remove';
      readonly target: Extract<StudioArrangeTarget, { kind: 'wall' }>;
    }
  | {
      readonly kind: 'label-edit';
      readonly target: Extract<StudioArrangeTarget, { kind: 'label' }>;
      readonly text?: string;
      readonly location?: Partial<WorldPoint>;
      readonly regionLighting?: {
        readonly regionId: string;
        readonly value: Readonly<RegionLighting> | null;
      };
    }
  | {
      readonly kind: 'label-remove';
      readonly target: Extract<StudioArrangeTarget, { kind: 'label' }>;
    }
  | {
      readonly kind: 'region-bind' | 'region-remove';
      readonly target: Extract<StudioArrangeTarget, { kind: 'label' }>;
      readonly regionId: string;
    }
  | {
      readonly kind: 'region-area';
      readonly target: Extract<StudioArrangeTarget, { kind: 'label' }>;
      readonly regionId: string;
      readonly cells: readonly RoomHexCell[];
    }
  | StudioActorArrangeEdit
  | StudioStartArrangeEdit;

export interface StudioArrangeProjectionInput {
  readonly draft: Readonly<RoomDraft>;
  readonly target: StudioArrangeTarget | null;
  readonly selectionRevision: number;
  readonly previewScene?: WorldScene | null;
  readonly previewWall?: StructuralWall | null;
  readonly previewDoor?: StudioDoorPreview | null;
  readonly regionResolutions?: readonly RegionResolution[];
}

function validSceneTarget(scene: WorldScene, ids: readonly string[]): boolean {
  return ids.length > 0 && ids.every((id) => !!entityById(scene, id));
}

function sceneValues(
  scene: WorldScene,
  ids: readonly string[]
): StudioSceneArrangeValues {
  const roots = topLevelSelectedIds(scene, ids);
  const transform =
    roots.length === 1
      ? entityById(scene, roots[0]!)!.transform
      : selectionPivot(scene, ids)!;
  const props = selectionPropIds(scene, ids);
  const scales = new Set(
    scene.items
      .filter((item) => props.has(item.id))
      .map((item) => item.heightScale ?? 1)
  );
  const height: StudioArrangeHeight =
    scales.size === 0
      ? { kind: 'absent' }
      : scales.size === 1
        ? { kind: 'value', scale: [...scales][0]! }
        : { kind: 'mixed' };
  return {
    position: { x: transform.x, y: transform.y, z: transform.z },
    ...(roots.length === 1 ? { yaw: transform.rotationY } : {}),
    height,
  };
}

function wallValues(wall: StructuralWall): StudioWallArrangeValues {
  return {
    midpoint: wallMidpoint(wall),
    yaw: wallDirectionYaw(wall),
    length: wallLength(wall),
    appearance: wall.appearance,
  };
}

/** Missing/retired identities return null, never a synthetic origin or first
 * available entity. Preview values are separate from committed values. */
export function projectStudioArrange(
  input: StudioArrangeProjectionInput
): StudioArrangeSelection | null {
  const { draft, target, selectionRevision } = input;
  if (!target) return null;
  if (target.kind === 'scene') {
    if (!validSceneTarget(draft.scene, target.ids)) return null;
    const selectedIds = [...new Set(target.ids)].sort();
    const canonicalTarget = { kind: 'scene' as const, ids: selectedIds };
    const rootIds = topLevelSelectedIds(draft.scene, selectedIds);
    if (rootIds.length === 0) return null;
    return {
      kind: 'scene',
      target: canonicalTarget,
      selectedIds,
      rootIds,
      rootCount: rootIds.length,
      selectionKey: JSON.stringify(canonicalTarget),
      selectionRevision,
      ...sceneValues(draft.scene, selectedIds),
      ...(input.previewScene &&
      validSceneTarget(input.previewScene, selectedIds)
        ? { preview: sceneValues(input.previewScene, selectedIds) }
        : {}),
    };
  }
  if (target.kind === 'door') {
    const wall = draft.room.walls?.find((wall) => wall.id === target.wallId);
    const opening = wall?.openings.find(
      (opening) =>
        opening.id === target.openingId && opening.door?.id === target.doorId
    );
    if (!wall || !opening?.door) return null;
    const preview = input.previewDoor;
    return {
      kind: 'door',
      target,
      selectionKey: JSON.stringify({
        kind: 'door',
        wallId: target.wallId,
        openingId: target.openingId,
        doorId: target.doorId,
      }),
      selectionRevision,
      wall,
      opening,
      door: opening.door,
      position: opening.position,
      width: opening.width,
      ...(preview?.valid &&
      preview.purpose === 'move' &&
      preview.target.wallId === target.wallId &&
      preview.target.openingId === target.openingId &&
      preview.target.doorId === target.doorId
        ? { preview: { position: preview.position, width: preview.width } }
        : {}),
    };
  }
  const identity = {
    selectionKey: JSON.stringify(
      target.kind === 'start'
        ? { kind: 'start' }
        : { kind: target.kind, id: target.id }
    ),
    selectionRevision,
  };
  switch (target.kind) {
    case 'wall': {
      const wall = draft.room.walls?.find(
        (candidate) => candidate.id === target.id
      );
      return wall
        ? {
            ...identity,
            kind: 'wall',
            target,
            wall,
            ...wallValues(wall),
            ...(input.previewWall?.id === target.id
              ? { preview: wallValues(input.previewWall) }
              : {}),
          }
        : null;
    }
    case 'label': {
      const label = draft.scene.mapLabels?.find(
        (candidate) => candidate.id === target.id
      );
      if (!label) return null;
      const region = draft.scene.authoringRegions?.find(
        (r) => r.labelId === label.id
      );
      return {
        ...identity,
        kind: 'label',
        target,
        label,
        ...(region
          ? {
              region,
              resolution: (
                input.regionResolutions ?? resolveAuthoringRegions(draft)
              ).find((r) => r.id === region.id),
            }
          : {}),
      };
    }
    case 'actor': {
      const monster = draft.room.monsterDeclarations.find(
        (candidate) => candidate.id === target.id
      );
      return monster
        ? {
            ...identity,
            kind: 'actor',
            target,
            monster,
            startingCell: monster.startingCell,
          }
        : null;
    }
    case 'start':
      return draft.room.partyStart
        ? { ...identity, kind: 'start', target, cell: draft.room.partyStart }
        : null;
  }
}

function finite(value: number, field: string): void {
  if (!Number.isFinite(value))
    throw new Error(`Arrange ${field} must be finite.`);
}

/** Throws on refusal. No partial candidate escapes; the owner alone validates
 * workspace/document policy and commits the returned scene once. */
export function applyStudioSceneArrange(
  scene: WorldScene,
  intent: StudioSceneArrangeEdit
): WorldScene {
  const ids = intent.target.ids;
  if (!validSceneTarget(scene, ids))
    throw new Error('Arrange scene target no longer exists.');
  const roots = topLevelSelectedIds(scene, ids);
  if (!roots.length) throw new Error('Arrange scene target has no roots.');
  const values = sceneValues(scene, ids);
  let next = scene;
  if (intent.position) {
    const delta = { x: 0, y: 0, z: 0 };
    for (const axis of ['x', 'y', 'z'] as const) {
      const value = intent.position[axis];
      if (value !== undefined) {
        finite(value, `position.${axis}`);
        if (value !== values.position[axis])
          delta[axis] = value - values.position[axis];
      }
    }
    if (delta.x !== 0 || delta.y !== 0 || delta.z !== 0)
      next = moveSelection(next, ids, delta);
  }
  if (intent.rotation) {
    finite(intent.rotation.radians, 'rotation');
    const absolute = intent.rotation.kind === 'absolute';
    if (absolute !== (roots.length === 1))
      throw new Error(
        'Arrange single roots require absolute yaw; multiple roots require relative rotation.'
      );
    const angle = absolute
      ? intent.rotation.radians - values.yaw!
      : intent.rotation.radians;
    if (angle !== 0) next = rotateSelection(next, ids, angle);
  }
  if (intent.heightScale !== undefined) {
    finite(intent.heightScale, 'height scale');
    if (values.height.kind === 'absent')
      throw new Error('Arrange selection has no height-scalable props.');
    next = setSelectionHeight(next, ids, intent.heightScale);
  }
  return next;
}

/** Length → yaw at resulting midpoint → final requested midpoint → appearance.
 * Existing clamp/endpoint behavior is retained; invalid late fields throw
 * before any candidate can reach the document/history owner. */
export function applyStudioWallArrange(
  draft: Readonly<RoomDraft>,
  intent: StudioWallArrangeEdit
): StructuralWall {
  const wall = draft.room.walls?.find(
    (candidate) => candidate.id === intent.target.id
  );
  if (!wall) throw new Error('Arrange wall target no longer exists.');
  let next = wall;
  if (intent.length) {
    if (intent.length.anchor !== 'start' && intent.length.anchor !== 'end')
      throw new Error('Arrange wall anchor must be start or end.');
    if (intent.length.value !== wallLength(next))
      next = resizeWallLength({
        wall: next,
        endpoint: intent.length.anchor === 'start' ? 'end' : 'start',
        length: intent.length.value,
      }).wall;
  }
  if (intent.yaw !== undefined) {
    finite(intent.yaw, 'wall yaw');
    // A same-value yaw must not repair tiny direction round-off introduced
    // by an actual length edit. Only an explicitly changed yaw rotates.
    if (
      intent.yaw !== wallDirectionYaw(wall) &&
      intent.yaw !== wallDirectionYaw(next)
    )
      next = previewWallTransform({
        wall: next,
        mode: 'rotate',
        change: { x: 0, z: 0, rotationY: intent.yaw - wallDirectionYaw(next) },
      });
  }
  if (intent.midpoint) {
    const current = wallMidpoint(next);
    const delta = { x: 0, z: 0 };
    for (const axis of ['x', 'z'] as const) {
      const value = intent.midpoint[axis];
      if (value !== undefined) {
        finite(value, `midpoint.${axis}`);
        if (value !== current[axis]) delta[axis] = value - current[axis];
      }
    }
    if (delta.x !== 0 || delta.z !== 0)
      next = previewWallTransform({
        wall: next,
        mode: 'move',
        change: { ...delta, rotationY: 0 },
      });
  }
  if (intent.appearance) {
    const appearance = { ...next.appearance, ...intent.appearance };
    if (
      (
        Object.keys(next.appearance) as (keyof StructuralWall['appearance'])[]
      ).some((key) => appearance[key] !== next.appearance[key])
    )
      next = setWallAppearance(next, appearance);
  }
  return next;
}

function requireCell(draft: Readonly<RoomDraft>, cell: RoomHexCell): void {
  if (
    !Number.isFinite(cell.q) ||
    !Number.isFinite(cell.r) ||
    !Number.isInteger(cell.q) ||
    !Number.isInteger(cell.r) ||
    !isCellWithinWorkspace(cell, draft.workspace)
  )
    throw new Error(
      'Arrange location must be an integral hex within the authoring floor.'
    );
}

export function applyStudioActorArrange(
  draft: RoomDraft,
  intent: StudioActorArrangeEdit | StudioStartArrangeEdit
): RoomDraft {
  if (intent.kind === 'start-position') {
    if (!draft.room.partyStart)
      throw new Error('Arrange party start no longer exists.');
    requireCell(draft, intent.location);
    return setRoomPartyStart(draft, intent.location);
  }
  const monster = draft.room.monsterDeclarations.find(
    (candidate) => candidate.id === intent.target.id
  );
  if (!monster) throw new Error('Arrange actor target no longer exists.');
  let next = draft;
  if (intent.location) {
    requireCell(draft, intent.location);
    if (
      intent.location.q !== monster.startingCell.location.q ||
      intent.location.r !== monster.startingCell.location.r
    )
      next = moveRoomMonster(next, monster.id, intent.location);
  }
  if (intent.facing)
    next = setRoomMonsterFacing(
      next,
      monster.id,
      intent.facing.kind === 'default' ? undefined : intent.facing.value
    );
  return next;
}
