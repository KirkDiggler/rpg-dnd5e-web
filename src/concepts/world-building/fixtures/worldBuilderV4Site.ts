/**
 * The engine's own v4 single-room example — a PINNED SNAPSHOT.
 *
 * `worldBuilderV4Site.yaml` beside this module is a verbatim copy of
 * `rpg-toolkit` `rulebooks/dnd5e/encounter/dungeonspec/testdata/world-builder-v4-site.yaml`
 * **as it stood at `5ff9a286`** (the merge of rpg-toolkit#1900). It is not a
 * conversion and not this module's idea of what a site should be, so the
 * engine's own example and this copy were one text when it was taken.
 *
 * RE-PINNED for `startingCell` (rpg-toolkit#1900). The engine's own example
 * moved to `startingCell: { location, facing }` in the same change that made
 * the builder read it, which is exactly the drift this section says to
 * reconcile. The copy also gained the `cellar-door` prop and its
 * `doorBindings` the engine had added since `58b30731` — a re-pin takes the
 * whole file, not only the line that prompted it.
 *
 * IT IS A SNAPSHOT, NOT THE ENGINE'S FILE, and it will move again. A pin is a
 * known point, never a claim of sameness; when the engine's example drifts the
 * fixture is re-pinned in the change that reconciles the grammar.
 *
 * # Why it earns its place
 *
 * This is the only document in the project written by the ENGINE TEAM to
 * exercise every v4 key at once — a root site scope carrying a faction's
 * `temper` MIX and its inherited `on:` table, a `dispositions` pair with an
 * `until`, `monsters[]` with `faction` on one placement and none on the others,
 * and `monsterBindings` overriding `on`, `temper` and `actions`. It is
 * therefore the only real test of whether the builder reads the form the
 * engine accepts.
 *
 * # What it proves, and what it does not
 *
 * It is a PARSE fixture: it proves the dialect the engine compiles is the
 * dialect the builder reads. It is not a golden of the builder's own output —
 * the encoder has its own canonical style, so a parsed document re-emitted is
 * the builder's spelling of the same document, not the authored bytes. The
 * round-trip this guards is therefore `emit(parse(emit(parse(t)))) ===
 * emit(parse(t))`, the same idempotence `referenceTomb.test.ts` asserts.
 */
import { decodeSingleRoomDungeon } from '../singleRoomDungeon';
import worldBuilderV4SiteYaml from './worldBuilderV4Site.yaml?raw';

/** The fixture's exact bytes, asserted in the test so no formatter and no
 * hand-edit can change the copy unnoticed — the same reason
 * `reference-front-room.yaml` is pinned.
 *
 * The hash does NOT pin the copy to the toolkit's file: it proves the bytes are
 * the ones taken at `58b30731`, so the test keeps passing after upstream moves.
 * That is a property of any hash-pinned snapshot. */
export const WORLD_BUILDER_V4_SITE_YAML = worldBuilderV4SiteYaml;

/** sha256 of the pinned snapshot taken at `5ff9a286` — the merge of
 * rpg-toolkit#1900, where a monster's start became `startingCell:
 * { location, facing }`. NOT a hash of the file the toolkit ships today.
 * Re-pin it in the same change that reconciles the copy with upstream. */
export const WORLD_BUILDER_V4_SITE_SHA256 =
  '06c46a7bde0fd8ffe78f76f0cf483f9a557d8196c1cbff1f8bb1851f003a4578';

export function decodeWorldBuilderV4Site() {
  return decodeSingleRoomDungeon(WORLD_BUILDER_V4_SITE_YAML);
}
