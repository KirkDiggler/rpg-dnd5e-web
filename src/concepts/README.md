# Concepts

`/concepts` is where we develop **real** components against fixture data. Not
throwaway mockups — the actual shared components, fed by typed fixtures, so a
component cannot tell fixture from stream.

Full workflow: `docs/how-to/concepts-route.md`. This file is the short version
that lives next to the code.

## The rules

1. **Real components, fixture data.** A concept renders production components.
   If it draws its own parallel renderer, it has stopped being a concept and
   become a mockup.
2. **Fixtures are the desired consumer data**, typed against the generated
   proto messages wherever the wire already carries them. Where it doesn't,
   keep that in a clearly separated type — that delta is the finding.
3. **`CONTRACT.md` records evidence, not asks.** What the concept needed, what
   the wire carries, where they differ. Kirk reviews it before any candidate
   becomes a cross-repo request on board #19.
4. **Promotion is a data-source swap.** If the fixtures were faithful, wiring
   into the real screen changes where data comes from, not the components.

## If a concept simulates a server

Some concepts need data generated in response to what the user does, rather
than replayed from a script — anything where the interesting behavior _is_ the
interaction. Those need something standing in for the server.

Keep it on the far side of a hard boundary, and enforce the boundary with a
test rather than a convention. See `fog-of-war/`: world truth and line of sight
live in `authority/`, the knowledge path (`events`/`reducer`/`adapter`) may
know only what an event told it, and `boundary.test.ts` fails if anything
reaches across. Without that, client-side inference arrives later as a
convenience and is load-bearing before anyone notices.

The concept page itself is the composition root — it wires both halves, and in
production that wiring is what gets replaced by a real subscription.

## Character customization evidence

`character-customization/` is the #877 fixture-first Learn lab at
`?concept=character-customization`. It renders two real `ClassCharacterModel`
instances against ignored provider candidates: one controlled body with exact
scalp/facial-hair selections and shared runtime surface treatment, plus one
immutable default reference twin. Its inspector exposes exact bind identities,
source-armature count, asset receipts, fixture JSON, and an R3F-commit-fenced
coverage verdict. The successful browser contract and explicit non-production
boundaries are in `character-customization/CONTRACT.md`.

## Adding one

1. `src/concepts/<name>/`
2. Register it in `ConceptsView.tsx`
3. Dev deep link `?concept=<id>` opens straight to it, which is how visual
   evidence stays reproducible
