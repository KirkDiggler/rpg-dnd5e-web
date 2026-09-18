/**
 * The reference front room — a PINNED SNAPSHOT of the server's file.
 *
 * `reference-front-room.yaml` beside this module is a verbatim copy of
 * `rpg-api/content/reference-front-room.yaml` **as it stood at `fe1b3b91`**.
 * It is not a conversion and not this module's idea of what the room should
 * be, so the builder's fixture and the server's fixture were one text when it
 * was taken.
 *
 * THEY ARE NOT ONE TEXT ANY MORE, and saying so is the point of this
 * paragraph. The server's file has moved twice since: the creature's table
 * wave moved `on:` from the placement to the **faction**, added `temper`
 * mixes, and shipped `time` and `when:` (rpg-project#466, encounter v0.90.0).
 * This parser accepts none of that yet, so it still refuses the current file
 * — on `time`, `when` and `temper` rather than on the four keys it was built
 * to reach.
 *
 * So this is a snapshot with a known expiry, and
 * https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1137 is the pointer that
 * carries the reconciliation. When it lands, this copy is re-pinned to the new
 * bytes and this paragraph comes out.
 *
 * It earns its place regardless, because it is still the only authored file in
 * the project carrying an `on:` block, and therefore the only real test of
 * whether the builder can read the feature the game already plays. Before
 * rpg-dnd5e-web#1118 it could not: four of this placement's eight keys were
 * refused as unknown, so the file would not load at all.
 *
 * # What this file proves, and what it does not
 *
 * It is a PARSE fixture: it proves the dialect the server compiles is the
 * dialect the builder reads. It is not a golden of the builder's own
 * output — `emitDungeon` has its own canonical style, and a parsed file
 * re-emitted is the builder's spelling of the same document, not the
 * authored bytes. The round-trip this file guards is therefore
 * `emit(parse(emit(parse(text)))) === emit(parse(text))`, the same
 * idempotence `referenceTomb.test.ts` asserts.
 */
import { parseDungeon, type DungeonDoc } from '../dungeonYaml';
import referenceFrontRoomYaml from './reference-front-room.yaml?raw';

/** The fixture's exact bytes, asserted in the test so no formatter and no
 * hand-edit can change the copy unnoticed — the same reason
 * `reference-tomb.yaml` is pinned.
 *
 * It does NOT pin the copy to the server's file, and it never did: the hash
 * proves the bytes are the ones taken at `fe1b3b91`, so the test keeps
 * passing after upstream moves. That is a property of any hash-pinned
 * snapshot, and it is why the reconciliation is carried by an issue (#1137)
 * rather than by this constant. */
export const REFERENCE_FRONT_ROOM_YAML = referenceFrontRoomYaml;

/** sha256 of the pinned snapshot taken at `fe1b3b91` — NOT a hash of the
 * file the API ships today. Re-pin it in the same change that reconciles the
 * copy with upstream (#1137). */
export const REFERENCE_FRONT_ROOM_SHA256 =
  'fe1b3b912dafa6e8be7480c56b7e6d89c5f418fbc3c3e1a55035f57fa788fed2';

export function referenceFrontRoomDoc(): DungeonDoc {
  return parseDungeon(REFERENCE_FRONT_ROOM_YAML);
}
