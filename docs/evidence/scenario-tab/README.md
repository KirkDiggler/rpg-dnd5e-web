# The tabbed rail and the Scenario tab (rpg-dnd5e-web#945)

Walked on the real `/author` mount at 1920×1080, against rpg-api `origin/dev`
(00c60cd) with `RPG_AUTHORING_ENABLED=1`. The scenario list is the server's
own `ListScenarios` answer; nothing here is a fixture of the form.

| shot                          | what it shows                                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-source-reference-tomb`    | Source with the whole column: 56 lines of the file on screen, against 35 before. The Inspector is a tab away rather than a row above.            |
| `02-scenario-no-bindings`     | The reference tomb binds no scenario, so the tab is the chooser and the sentence saying so. No blanks for a scenario this dungeon does not run.  |
| `03-scenario-after-add`       | Hold-out added through the chooser. Its blank appears, and the compiler's refusal is in the rail's head — visible on this tab, not only on Source. |
| `04-source-after-add`         | The same act in the file: `scenarios:` / `hold-out: {}`, the one token that means bound with nothing filled in yet.                              |
| `05-scenario-raider-camp`     | `reference-raider-camp.yaml` loaded: hold-out bound with `raiders` picked, and recover-the-artifact on offer rather than on screen.              |

The line count in shot 01 is the fix to `.dg-yaml--edit`: its `font: inherit`
was taking the SIZE with the family, so the pane rendered at the app's 16px
while its own rule says 11px.
