/**
 * useDungeonScene — the play view's one read of the room it is playing in.
 *
 * # Presentation is content (rpg-project#479)
 *
 * What a room LOOKS like is the World Builder's content, served by key
 * from the registry; it is not something the encounter carries. So the
 * engine stopped shipping a scene on every atlas, `GetAtlasResponse`
 * carries the `dungeon_key` the session was launched from, and this hook
 * fetches that file through the existing ungated `AuthoringService
 * .GetDungeon` and reads the room out of it with the web's OWN codec
 * (`decodeSingleRoomDungeon`) — the only validator of an authored room
 * there now is. The scene the player sees and the field the engine
 * compiled come from the same bytes, because the registry compiled that
 * entry from them.
 *
 * # The three answers, and why none of them is silence
 *
 * - **No key** — an empty `dungeon_key` is a session saved before the
 *   field existed. No request goes out, no scene, no error: the legacy
 *   atlas route draws exactly what it drew before (the proto's own
 *   words: "a client reads empty as NO AUTHORED SCENE and draws what it
 *   drew before, never as an error").
 * - **The other dialect** — a dungeonspec (v2) file has no authored room
 *   scene to read, and that is a real, final answer, not a failure. No
 *   scene, no error, legacy renders. Every shipped reference dungeon and
 *   the front room take this path.
 * - **Anything else is named** — a single-room file this build cannot
 *   read whole, a root we cannot identify at all, or a key whose file we
 *   could not fetch. None of those is "this dungeon has no authored
 *   room", so none of them may be delivered as that answer. They surface
 *   as a visible refusal (`SessionEncounterView`'s scene-presentation
 *   error) rather than a quietly legacy-looking room, which is the one
 *   failure mode that would look like a rendering bug forever.
 *
 * Fetched once per distinct key and held — the authored file under a key
 * does not change while a session is live (and if it is re-Put, the
 * compiled geometry stays what it was; pinning an immutable revision is
 * the registry's future, per the design's R1 note).
 */
import {
  defaultAuthoringClient,
  errorMessageOf,
  type AuthoringClient,
} from '@/author/authoringRpc';
import type { RoomScenePresentation } from '@/concepts/world-building/roomDraft';
import { readSingleRoomDungeon } from '@/concepts/world-building/singleRoomDungeon';
import { create } from '@bufbuild/protobuf';
import { GetDungeonRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useEffect, useState } from 'react';

export interface UseDungeonSceneResult {
  /** The room to draw, or null when this dungeon has none to draw. */
  presentation: RoomScenePresentation | null;
  loading: boolean;
  /** Non-null only for the named refusals above — never for a dungeon
   * that simply has no authored room. */
  error: string | null;
}

const NOTHING: UseDungeonSceneResult = {
  presentation: null,
  loading: false,
  error: null,
};

export function useDungeonScene(
  dungeonKey: string,
  client: AuthoringClient = defaultAuthoringClient
): UseDungeonSceneResult {
  const [state, setState] = useState<UseDungeonSceneResult>(NOTHING);

  useEffect(() => {
    if (!dungeonKey) {
      setState(NOTHING);
      return;
    }
    // Monotonic per effect lifetime: a response for a key this view has
    // moved off (or for an unmounted view) may not write state, so a
    // slow read of an old room can never replace a newer one.
    let live = true;
    setState({ presentation: null, loading: true, error: null });
    void (async () => {
      let yaml: string;
      try {
        const response = await client.getDungeon(
          create(GetDungeonRequestSchema, { key: dungeonKey })
        );
        yaml = response.yaml;
      } catch (err) {
        if (!live) return;
        setState({
          presentation: null,
          loading: false,
          error: `Could not load the dungeon “${dungeonKey}” this session is playing: ${errorMessageOf(err)}`,
        });
        return;
      }
      if (!live) return;
      try {
        const read = readSingleRoomDungeon(yaml);
        setState({
          // Narrowed to the three presentation fields on purpose. The
          // decoded draft also carries the room's AUTHORING gameplay
          // data — walkable cells, prop declarations, monster markers —
          // and none of that may ride into a scene: where a creature
          // stands and what a prop blocks are session and engine
          // answers, and a renderer that found them here would be
          // reading the author's intent instead of the game's state.
          presentation:
            read.dialect === 'single-room'
              ? {
                  coordinateFrame: read.draft.coordinateFrame,
                  workspace: read.draft.workspace,
                  scene: read.draft.scene,
                }
              : null,
          loading: false,
          error: null,
        });
      } catch (err) {
        setState({
          presentation: null,
          loading: false,
          error: `Could not read the room authored under “${dungeonKey}”: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      }
    })();
    return () => {
      live = false;
    };
  }, [dungeonKey, client]);

  return state;
}
