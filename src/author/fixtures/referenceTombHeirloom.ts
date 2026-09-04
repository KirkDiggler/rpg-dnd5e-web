/**
 * The reference tomb WITH THE HEIRLOOM — THE TOOLKIT'S OWN FILE, parsed.
 *
 * `reference-tomb-heirloom.yaml` beside this module is a VERBATIM COPY of
 * `rulebooks/dnd5e/encounter/dungeonspec/testdata/reference-tomb-heirloom.yaml`
 * on the toolkit's `encounter/intel-record` branch, commit c687853f —
 * re-authored there so the captain's knowledge is an INTEL RECORD it
 * holds rather than a `knows:` list (rpg-project#372 R1), and grown a
 * SECOND record on a holdable scroll in the hall (R6) so the tool can be
 * walked without killing the hardest monster in the dungeon first. Not a conversion, not a reconstruction: the builder's fixture
 * and the compiler's fixture are one text, so a disagreement about what
 * this dungeon IS cannot hide between them. `referenceTomb.ts` beside this
 * file does the same for the plain tomb, which this slice leaves untouched.
 *
 * BOTH FILES ARE IN `.prettierignore`, and they have to be: the pre-commit
 * hook formats `*.yaml`, and prettier respaces flow sequences
 * (`[[0,0],[1,0]]` -> `[[0, 0], [1, 0]]`). It had already done exactly that
 * to `reference-tomb.yaml`, silently, because the test asserting the copy
 * only checked substrings prettier leaves alone. The tests beside these
 * files now assert bytes prettier WOULD touch.
 *
 * What it adds to the plain tomb, and nothing else (rpg-project#368 §3.1):
 *
 *   - a VAULT — a concealed region behind the tomb, reachable only through
 *     a concealed door in the tomb's east wall;
 *   - the HEIRLOOM — a prop with an id that can be picked up, in the vault;
 *   - the VAULT MAP and the HALL NOTES — two `intel:` records, both
 *     declaring `reveals: { door: vault }`. Two records may reveal one
 *     door: knowledge is not scarce, and the second is what makes the
 *     door reachable by picking a scroll up instead of by winning a
 *     fight;
 *   - the CAPTAIN — the same skeleton captain, now carrying
 *     `holds: [vault-map]` and NO boss flag, because this dungeon ends
 *     because a scenario says so rather than because a monster wears a flag;
 *   - an EXIT named `entrance`, on the cell the party starts on — authored,
 *     because `start` is not implicitly a way out;
 *   - the SCENARIO binding: `recover-the-artifact`, artifact and exit.
 *
 * # The file key is `holdable:`, and so is the verb
 *
 * Design R10 named the verb **Hold** and the flag `holdable:`, and the
 * whole stack now says so: the toolkit's dungeonspec parses `holdable:`,
 * and the pinned protos carry `Hold`/`Held`/`AtlasProp.holdable`. `Taken`
 * is freed for the merchant lane.
 */
import { parseDungeon, type DungeonDoc } from '../dungeonYaml';
import referenceTombHeirloomYaml from './reference-tomb-heirloom.yaml?raw';

/** The file's own bytes, for the test that pins this copy against the
 * text the compiler reads rather than against this module's output. */
export const REFERENCE_TOMB_HEIRLOOM_YAML: string = referenceTombHeirloomYaml;

export function referenceTombHeirloomDoc(): DungeonDoc {
  return parseDungeon(REFERENCE_TOMB_HEIRLOOM_YAML);
}
