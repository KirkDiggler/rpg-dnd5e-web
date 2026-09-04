/**
 * The reference tomb WITH THE HEIRLOOM — THE TOOLKIT'S OWN FILE, parsed.
 *
 * `reference-tomb-heirloom.yaml` beside this module is a VERBATIM COPY of
 * `rulebooks/dnd5e/encounter/dungeonspec/testdata/reference-tomb-heirloom.yaml`
 * on the toolkit's recover-the-artifact branch (commit 48c72498). Not a
 * conversion, not a reconstruction: the builder's fixture and the
 * compiler's fixture are one text, so a disagreement about what this
 * dungeon IS cannot hide between them. `referenceTomb.ts` beside this
 * file does the same for the plain tomb, which this slice leaves
 * untouched.
 *
 * What it adds to the plain tomb, and nothing else (rpg-project#368 §3.1):
 *
 *   - a VAULT — a concealed region behind the tomb, reachable only through
 *     a concealed door in the tomb's east wall;
 *   - the HEIRLOOM — a prop with an id that can be picked up, in the vault;
 *   - the CAPTAIN — the same skeleton captain, now carrying
 *     `knows: [vault]` and NO boss flag, because this dungeon ends because
 *     a scenario says so rather than because a monster wears a flag;
 *   - an EXIT named `entrance`, on the cell the party starts on — authored,
 *     because `start` is not implicitly a way out;
 *   - the SCENARIO binding: `recover-the-artifact`, artifact and exit.
 *
 * # The file key is `holdable:`, and the verb is Hold
 *
 * Design R10 named the verb **Hold** and the flag `holdable:`, and the
 * toolkit's dungeonspec parses that word. The pinned protos still ship
 * `Take` for the RPC and the beat — that half renames in a wave-0
 * follow-up. This copy carries the toolkit's current bytes, which is the
 * whole point of it being a copy; see `holdingBeat.ts` for the same split
 * on the game side.
 */
import { parseDungeon, type DungeonDoc } from '../dungeonYaml';
import referenceTombHeirloomYaml from './reference-tomb-heirloom.yaml?raw';

/** The file's own bytes, for the test that pins this copy against the
 * text the compiler reads rather than against this module's output. */
export const REFERENCE_TOMB_HEIRLOOM_YAML: string = referenceTombHeirloomYaml;

export function referenceTombHeirloomDoc(): DungeonDoc {
  return parseDungeon(REFERENCE_TOMB_HEIRLOOM_YAML);
}
