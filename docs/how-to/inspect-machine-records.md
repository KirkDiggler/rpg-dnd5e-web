# Inspect a machine decision

The in-game history panel's **Debug** view reads diagnostic records during
playtesting. The API controls access; hiding a button is not the security gate.
Ordinary player narration is separate.

## Read one decision

1. Open history, choose Debug, and filter the beat to `behavior_decision`.
2. Expand an act, then inspect its behavior-decision record.
3. Open **Original bound configuration** to see the configuration that ran,
   identified by its captured digest—not today's edited source.
4. Read **Roles considered**: actual before/after state, selection/commit status,
   requested table, configured transitions and the recorded guard verdicts.
5. Read **Picker evidence** for the actual weighted roll and table alternatives.
   Unselected roles' tables are available as configuration, never labeled as if
   their rows were evaluated.
6. Inspect `behavior_work` for the actual execution result and its original
   decision backlink. Selected, partial, paused, completed and abandoned are
   different outcomes. Completion does not imply another action or roll.

`unknown`, `rejected`, `not evaluated` and `deferred` do not mean the same thing.
A proposed transition in a deferred role is not committed progress.

## Open captured API records

Use **Open capture** to load a single-session schema1 `.jsonl` capture. It is
labeled with its session and kept separate from live records; **Return to live
records** switches back. Imported files are inspected, never executed.

The reader keeps500 visible rows, while symbols have a separate run lifetime.
Available picker/decision backlinks needed by visible records are retained too.
If a referenced decision or symbol is unavailable, the panel says so. No source
lookup or inferred history fills the gap.

Keep capture status lines when filtering server output to one session. Start,
incomplete and missing drain markers remain visible. A clean export drain does
not prove earlier history is present. Mixed sessions, conflicting IDs, malformed
JSON and unsupported schemas refuse; captures above32MiB require a smaller
session/time window rather than silently truncating input.

Live and captured wide integers use the same lossless parser and renderer.
The live reader uses `RecordEvent.fields_json` from published proto v0.1.263;
it never falls back to the deprecated approximate Struct. Empty, malformed
UTF-8/JSON and non-object raw payloads keep the record identity but report their
fields unavailable. A plausible legacy projection does not substitute for
missing exact evidence.
