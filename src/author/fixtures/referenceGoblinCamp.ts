/**
 * The goblin camp — the hold-out fixture (rpg-project#375 §1), parsed.
 *
 * `reference-goblin-camp.yaml` beside this module is the builder's copy of
 * the file design §1 describes, on a small camp of three regions (plan,
 * "The fixture"): the GATE the party arrives at, facing the YARD where the
 * scout stands, and the chief's HUT behind the camp's one wall. STEP A
 * ONLY: no `arrives` lines and no reinforcements, which are step B.
 *
 * THIS COPY IS A DRAFT UNTIL THE TOOLKIT'S BYTES REPLACE IT. The
 * precedent (`referenceTombHeirloom.ts`) is one text in three places —
 * toolkit dungeonspec testdata, rpg-api `content/`, and here — pinned by
 * test against the toolkit's own file, so a disagreement about what the
 * dungeon IS cannot hide between them. The toolkit builder is authoring
 * the canonical bytes in parallel; when they land, this `.yaml` is
 * replaced byte for byte and the test beside it asserts only what design
 * §1 fixes, so the swap touches ONE file. The file is in `.prettierignore`
 * with the other fixtures, for the reason recorded there.
 */
import { parseDungeon, type DungeonDoc } from '../dungeonYaml';
import referenceGoblinCampYaml from './reference-goblin-camp.yaml?raw';

/** The file's own bytes, for the test that pins this copy against the
 * text the compiler reads rather than against this module's output. */
export const REFERENCE_GOBLIN_CAMP_YAML: string = referenceGoblinCampYaml;

export function referenceGoblinCampDoc(): DungeonDoc {
  return parseDungeon(REFERENCE_GOBLIN_CAMP_YAML);
}
