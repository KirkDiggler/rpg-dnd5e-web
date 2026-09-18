/**
 * The reference front room — THE SERVER'S OWN FILE, parsed.
 *
 * `reference-front-room.yaml` beside this module is a verbatim copy of
 * `rpg-api/content/reference-front-room.yaml`, which the API ships as the
 * front-room dungeon: the goblin that is not hostile, its answer table,
 * and the dispositions that make neutrality real. It is not a conversion
 * and not this module's idea of what the room should be — the builder's
 * fixture and the server's fixture are one text, so a disagreement about
 * what the front room IS cannot hide between them.
 *
 * It earns its place as a fixture because it is the only authored file in
 * the project that carries an `on:` block, and therefore the only real
 * test of whether the builder can read the feature the game already plays.
 * Before rpg-dnd5e-web#1118 it could not: four of this placement's eight
 * keys were refused as unknown, so the file would not load at all.
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

/** The fixture's exact bytes. Asserted in the test so no formatter, no
 * hand-edit, and no upstream drift can quietly diverge this copy from the
 * file the API ships — the same reason `reference-tomb.yaml` is pinned. */
export const REFERENCE_FRONT_ROOM_YAML = referenceFrontRoomYaml;

/** sha256 of the verbatim copy. Update ONLY together with the upstream
 * file, in the same change that reconciles them. */
export const REFERENCE_FRONT_ROOM_SHA256 =
  'fe1b3b912dafa6e8be7480c56b7e6d89c5f418fbc3c3e1a55035f57fa788fed2';

export function referenceFrontRoomDoc(): DungeonDoc {
  return parseDungeon(REFERENCE_FRONT_ROOM_YAML);
}
