/**
 * The reference front room — a PINNED SNAPSHOT of the server's file.
 *
 * `reference-front-room.yaml` beside this module is a verbatim copy of
 * `rpg-api/content/reference-front-room.yaml` **as it stood at `1f2a6ac8`**
 * (`rpg-api` `origin/dev` tip `de83ffd6`, PR #1005). It is not a conversion
 * and not this module's idea of what the room should be, so the builder's
 * fixture and the server's fixture were one text when it was taken.
 *
 * IT IS A SNAPSHOT, NOT THE SERVER'S FILE, and it will move again — the file
 * is pinned to a commit, and the server keeps writing. The `fe1b3b91` copy
 * before this one proves the point: it was taken while the creature's table
 * wave was open, and by the time it landed the server had moved `on:` from the
 * placement to the **faction**, added `temper` mixes, and shipped `time` and
 * `when:` (rpg-project#466, encounter v0.90.0) — so the copy described a
 * dialect the engine had stopped speaking. A pin is a known point, never a
 * claim of sameness; when the file drifts again the fixture is re-pinned in the
 * change that reconciles the grammar, and this paragraph moves with it.
 * https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1137 is the change that
 * re-pinned this copy.
 *
 * It earns its place regardless, because it is the only authored file in the
 * project carrying an answer table AND a faction's inherited orders, and
 * therefore the only real test of whether the builder can read the feature the
 * game already plays. Before rpg-dnd5e-web#1118 it could not: four of the
 * goblin's keys were refused as unknown, so the file would not load at all.
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
 * proves the bytes are the ones taken at `1f2a6ac8`, so the test keeps
 * passing after upstream moves. That is a property of any hash-pinned
 * snapshot, and it is why the reconciliation is carried by an issue rather
 * than by this constant. */
export const REFERENCE_FRONT_ROOM_YAML = referenceFrontRoomYaml;

/** sha256 of the pinned snapshot taken at `1f2a6ac8` — NOT a hash of the file
 * the API ships today. Re-pin it in the same change that reconciles the copy
 * with upstream. */
export const REFERENCE_FRONT_ROOM_SHA256 =
  '1f2a6ac8f6969ae21d30ad5cd50f5b696e8d727d0a17491826af6bc807b4d1bb';

export function referenceFrontRoomDoc(): DungeonDoc {
  return parseDungeon(REFERENCE_FRONT_ROOM_YAML);
}
