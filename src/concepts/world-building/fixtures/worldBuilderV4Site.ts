/**
 * The engine's own v4 single-room example — a PINNED SNAPSHOT.
 *
 * `worldBuilderV4Site.yaml` beside this module is a verbatim copy of
 * `rpg-toolkit` `rulebooks/dnd5e/encounter/dungeonspec/testdata/world-builder-v4-site.yaml`
 * **as it stood at `3bba256e`** (rpg-toolkit#2039, options on bindings —
 * rpg-project#569). That sha is the PUSHED head of a draft PR, not a merge: the
 * copy is re-pinned again when #2039 merges if the file moved. It is not a
 * conversion and not this module's idea of what a site should be, so the
 * engine's own example and this copy were one text when it was taken.
 *
 * RE-PINNED for options (rpg-toolkit#2039): the faction's social
 * `intimidated` table retired (a social trigger is no longer a table key) and
 * `goblin-1` carries the line it is spoken to by, on its binding.
 *
 * RE-PINNED for declarations and bindings (rpg-toolkit#1902):
 * `monsterDeclarations` carries identity and start; faction membership now
 * lives in the ID-keyed `monsterBindings`. The copy matches the whole file.
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
 * `until`, `monsterDeclarations` with membership bound for one creature,
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
 * the ones taken at `3bba256e`, so the test keeps passing after upstream moves.
 * That is a property of any hash-pinned snapshot. */
export const WORLD_BUILDER_V4_SITE_YAML = worldBuilderV4SiteYaml;

/** sha256 of the pinned snapshot taken at `3bba256e` — rpg-toolkit#2039's
 * pushed head, adopting options on a binding.
 * NOT a hash of the file the toolkit ships today.
 * Re-pin it in the same change that reconciles the copy with upstream. */
export const WORLD_BUILDER_V4_SITE_SHA256 =
  '3ac34d4cecda1b3368c165802ef2141d96a4c42cc6bf755706f3591fd0671dae';

export function decodeWorldBuilderV4Site() {
  return decodeSingleRoomDungeon(WORLD_BUILDER_V4_SITE_YAML);
}
