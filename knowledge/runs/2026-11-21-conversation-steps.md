# Run — 2026-11-21 — An author adds and edits the steps of a conversation's states

Issue [rpg-project#1040](https://github.com/KirkDiggler/rpg-project/issues/1040). Base: `rpg-dnd5e-web` `dev` at `fbda3fb2`.

## Shipped

- **A commit for the recipe.** `commitInteractionRecipe(id, edit)`: one undoable commit that replaces only `interactions.<id>.recipe`; `approach` and `outcomes` ride along untouched (`setInteractionRecipe`).
- **States and steps.** Under each conversation in "States and outcomes": each state in file order, "the conversation starts here", "ends the conversation", and under a live state one row per step: On [step] → [state], Because [reason], Remove.
- **Add a step / Add a state.** A new step writes only once its name is valid; a state needs a name not already taken.
- **Engine refusals** under `interactions.<id>.recipe` show under the row or state their path names, from the `check` the page already receives.

## Decided

- The `machineEdit` helpers take the node that holds `recipe`, so the commit hands the edit `{ recipe }` and keeps only the recipe it returns.
- The quiet Remove and section label reuse the existing styles by adding the new section to their selectors.

## Mistaken

- I first ran the suite under Node 24; `bundles.test.ts` "a bundle that uses itself" fails there for an unrelated reason (stack depth) and was ignored.
- A first draft of the file-unchanged test compared lines against the original and was fooled by indentation; it now removes the three new steps and expects the castle back byte for byte.

## Found

- Nothing beyond the issue; F1–F6 held.
