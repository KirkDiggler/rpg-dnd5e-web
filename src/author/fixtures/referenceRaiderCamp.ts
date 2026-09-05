/**
 * The raider camp — the hold-out fixture (rpg-project#375 §1), parsed.
 *
 * `reference-raider-camp.yaml` beside this module is the builder's copy of
 * the file design §1 describes, on a small camp of three regions (plan,
 * "The fixture"): the GATE the party arrives at, facing the YARD where the
 * scout stands, and the captain's HUT behind the camp's one wall. The
 * raiders are skeletons led by the skeleton captain — the monsters that
 * exist (Kirk, 2026-09-05). Step B: the letter arrives at round 6, and
 * three zombie reinforcements wait on the chief's fall.
 *
 * THE TOOLKIT'S OWN BYTES — the precedent (`referenceTombHeirloom.ts`) is
 * one text in three places: toolkit dungeonspec testdata, rpg-api
 * `content/`, and here, so a disagreement about what the dungeon IS cannot
 * hide between them. This copy is
 * `rulebooks/dnd5e/encounter/dungeonspec/testdata/reference-raider-camp.yaml`
 * on the toolkit's `encounter/hold-out` branch at baea481d, sha256
 * b75a5226cef81cd1cb2f16789197bacffc1e8e9538ee61f4575b8da8119e3a59 — taken
 * verbatim (`git show <commit>:<path>`), never re-typed. A tag replaces the
 * branch commit in this citation once the encounter PR merges. The file is
 * in `.prettierignore` with the other fixtures, for the reason recorded
 * there: prettier would respace its rows and break the byte identity.
 */
import { parseDungeon, type DungeonDoc } from '../dungeonYaml';
import referenceRaiderCampYaml from './reference-raider-camp.yaml?raw';

/** The file's own bytes, for the test that pins this copy against the
 * text the compiler reads rather than against this module's output. */
export const REFERENCE_RAIDER_CAMP_YAML: string = referenceRaiderCampYaml;

export function referenceRaiderCampDoc(): DungeonDoc {
  return parseDungeon(REFERENCE_RAIDER_CAMP_YAML);
}
