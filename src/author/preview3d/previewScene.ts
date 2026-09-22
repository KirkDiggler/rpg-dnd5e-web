/**
 * previewScene — the one scene-building path the 3D preview uses,
 * shared with the game route in code: `resolveSceneLayout` (the gate)
 * then `buildScene3D` at the game's `HEX_SIZE`. Pure, so
 * `DungeonPreview3D.test.ts` can compare it to what
 * `SessionEncounterView` builds for the same atlas.
 */
import { HEX_SIZE } from '@/components/hex-grid/hexMath';
import {
  buildScene3D,
  resolveSceneLayout,
  type Scene3D,
  type SceneLayoutOutcome,
} from '@/components/session/atlasToScene3D';
import type { RoomScenePresentation } from '@/concepts/world-building/roomDraft';
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';

export type PreviewScene =
  | { ok: true; scene: Scene3D }
  | { ok: false; message: string };

/** The one scene-building path, shared with the game route in spirit
 * and in code: gate on the wire's layout, then `buildScene3D` at the
 * game's `HEX_SIZE`. Pure, so the test can compare it to what
 * `SessionEncounterView` would build for the same atlas.
 *
 * An authored room is handed in DIRECTLY — the draft the author is
 * editing, not a document round-tripped through an atlas field
 * (rpg-project#479: presentation is content, and the atlas stopped
 * carrying it). A preview with no authored room omits it, exactly as
 * the play view does for a dungeonspec dungeon.
 *
 * A room the builder refuses is caught into the SAME
 * `{ok:false,message}` result as a layout refusal, so the preview names
 * its refusal instead of crashing its consumer or silently reverting to
 * a legacy-looking scene. There is no second renderer path — the
 * refusal is `buildScene3D`'s own throw.
 */
export function previewScene(
  atlas: GetAtlasResponse,
  roomScene?: RoomScenePresentation
): PreviewScene {
  const outcome: SceneLayoutOutcome = resolveSceneLayout(atlas);
  if (!outcome.ok) return outcome;
  try {
    return {
      ok: true,
      scene: buildScene3D(atlas, HEX_SIZE, outcome.layout, roomScene),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
