/**
 * roomSceneJson — the strict decode boundary for the atlas's optional
 * canonical room presentation (`GetAtlasResponse.room_scene_json`).
 *
 * # Empty means absent; everything else nonempty must fully decode
 *
 * Generated proto3 strings default to `""`, and an older server (or an
 * older client-side schema) hands the field back ABSENT, not empty. Both
 * are the same answer: this member's atlas carries no canonical room
 * presentation, and the route renders its legacy atlas scene exactly as
 * it always did. There is no legacy fallback for a PRESENT payload: a
 * whitespace-only string, a JSON `null`, malformed JSON, an unsupported
 * version or coordinate frame, an off-preset workspace, or any malformed
 * scene graph throws by name — the caller (buildScene3D's callers) turns
 * that into a visible refusal rather than drawing a guessed room or a
 * silently-legacy one.
 *
 * # What the presentation is
 *
 * Exactly `version`, `coordinateFrame`, `workspace`, `scene` — the
 * portable visual snapshot of one authored room. It has NO painted cells,
 * gameplay declarations, monster or start markers: mechanical
 * cells/boundaries/occupancy/sight stay atlas/session answers, and those
 * fields are refused here exactly like any other unknown field.
 *
 * The embedded scene decodes through the existing World Building scene
 * validator (`validateScene`) at the presentation's declared workspace
 * horizontal limit, so visual catalog membership, relationship acyclicity,
 * and the doubles/empty-arrays/optional-values contract are the ONE
 * contract the authoring editor already enforces — no second scene dialect.
 */

import {
  objectShape,
  rejectUnknownKeys,
  ROOM_WORKSPACE_STEPS,
  type RoomDraft,
  type RoomWorkspace,
} from '../../concepts/world-building/roomDraft';
import {
  MAX_JSON_LENGTH,
  validateScene,
} from '../../concepts/world-building/serialization';
import type { WorldScene } from '../../concepts/world-building/types';

export interface RoomScenePresentation {
  version: 1;
  coordinateFrame: RoomDraft['coordinateFrame'];
  workspace: RoomWorkspace;
  scene: WorldScene;
}

const PRESENTATION_KEYS = [
  'version',
  'coordinateFrame',
  'workspace',
  'scene',
] as const;
const FRAME_KEYS = [
  'horizontalPlane',
  'verticalAxis',
  'distanceUnit',
  'hexRadius',
  'footprintFrame',
] as const;
const WORKSPACE_KEYS = ['hexRadius', 'horizontalLimit'] as const;

function decodePresentation(value: unknown): RoomScenePresentation {
  const root = objectShape(value, 'Room scene presentation');
  rejectUnknownKeys(root, PRESENTATION_KEYS, 'Room scene presentation');
  if (root.version !== 1) {
    throw new Error(
      `Room scene presentation version must be 1; got ${String(root.version)}.`
    );
  }
  const frameSource = objectShape(
    root.coordinateFrame,
    'Room scene coordinate frame'
  );
  rejectUnknownKeys(frameSource, FRAME_KEYS, 'Room scene coordinate frame');
  const frameInput = frameSource as Partial<RoomDraft['coordinateFrame']>;
  if (
    frameInput.horizontalPlane !== 'world-xz' ||
    frameInput.verticalAxis !== 'world-y-up' ||
    frameInput.distanceUnit !== 'world-scene-unit' ||
    frameInput.hexRadius !== 1 ||
    frameInput.footprintFrame !== 'owner-local-xz'
  ) {
    throw new Error('Unsupported room scene coordinate frame.');
  }
  const workspaceSource = objectShape(root.workspace, 'Room scene workspace');
  rejectUnknownKeys(workspaceSource, WORKSPACE_KEYS, 'Room scene workspace');
  const workspaceInput = workspaceSource as Partial<RoomWorkspace>;
  const workspace = ROOM_WORKSPACE_STEPS.find(
    (step) =>
      step.hexRadius === workspaceInput.hexRadius &&
      step.horizontalLimit === workspaceInput.horizontalLimit
  );
  if (!workspace) {
    throw new Error('Unsupported room scene workspace extent.');
  }
  const scene = validateScene(root.scene, {
    horizontalLimit: workspace.horizontalLimit,
  });
  return {
    version: 1,
    coordinateFrame: {
      horizontalPlane: 'world-xz',
      verticalAxis: 'world-y-up',
      distanceUnit: 'world-scene-unit',
      hexRadius: 1,
      footprintFrame: 'owner-local-xz',
    },
    workspace: { ...workspace },
    scene,
  };
}

/**
 * Decode the atlas's canonical room presentation, or answer `null` when it
 * is absent. Undefined (older schema) and the empty string (proto3 default)
 * both mean absent/legacy. Any PRESENT nonempty payload that is not a fully
 * valid presentation throws with a named reason — never a legacy fallback,
 * never a partially-decoded shape.
 *
 * Accepts only the raw wire string or absence. Each successful decode
 * returns a fresh structural copy; there is no alternate object-input path.
 */
export function decodeRoomSceneJSON(
  value: unknown
): RoomScenePresentation | null {
  if (value === undefined) return null;
  if (typeof value === 'string') {
    // Proto3's generated string default: ABSENT, not an invalid payload.
    // Every legacy atlas on the wire arrives exactly this way.
    if (value === '') return null;
    if (value.length > MAX_JSON_LENGTH) {
      throw new Error(
        `Room scene presentation JSON is too large (maximum ${MAX_JSON_LENGTH} characters).`
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error('Room scene presentation JSON could not be parsed.');
    }
    return decodePresentation(parsed);
  }
  throw new Error(
    'Room scene presentation must be a JSON string or absent; got ' +
      `${value === null ? 'null' : typeof value}.`
  );
}
