# Run — 2026-11-21 — The Conversations page reads well, closed and open

Issue [rpg-project#1039](https://github.com/KirkDiggler/rpg-project/issues/1039), polishing [rpg-dnd5e-web#1471](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1471). Base: `rpg-dnd5e-web` `dev` at `bd1850ce`. Visual and wording changes only; no control writes anything different.

## Shipped

- **Columns.** The conversation list is a narrow column (about 220px) beside the detail. Below 900px the list sits above the detail as a wrapping row of buttons.
- **Carrier chip.** One pill per carrier: the name and the × share one border.
- **Headings.** The conversation's name is a heading. "Applied to", "Its lines" and "Only <carrier> offers" share one section-label style. Conversation ids in the list and the heading are in the body face.
- **The opened form's order and words** (the shared line editor, wherever shown): Says, Check, Offered when, Moves the conversation, On a pass, On a miss ("When it is said" for a line with no check). The yellow `success` / `failure` words are gone.
- **Field labels** read Ability, Tool, DC.
- **Step description in full.** The step selects show the step's name; what the step does is a line under the select.
- **Quiet removes.** Every Remove inside the form is muted text with no red border; "Remove line" keeps its emphasis.
- **Weight helper.** The helper and the row's summary line show only when a side has more than one reply row.

## Decided

- The "alone" rule is a prop on the answer row (`alone`), given only by the line editor, so the tables elsewhere keep their weight help.
- The quiet remove is CSS under `.wb-options`, with `wb-danger-strong` marking the one that keeps its emphasis, so no other screen's red Remove changes.

## Mistaken

- The worktree had no `node_modules`, and the parent checkout's were behind the proto pin, so the first test run failed on an import. `npm ci` in the worktree fixed it.
- My first form test looked the open form up by its role and name, and two cards matched. It now takes the form by its class.

## Found

- `StudioListDetail` stacks below 52rem through JS; the 900px row-of-buttons layout for this page is CSS on the page's own list, so between 832px and 900px the panes stack by CSS alone.
