# 2026-10-30 · Frank's list S9 · The outcome and the companion reach the screen

Story [rpg-project#714](https://github.com/KirkDiggler/rpg-project/issues/714), slice [rpg-project#733](https://github.com/KirkDiggler/rpg-project/issues/733), PR [rpg-dnd5e-web#1361](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1361), contract [rpg-api-protos#408](https://github.com/KirkDiggler/rpg-api-protos/pull/408).

## Shipped

- The run-end toast and the story's end line read "<ending> — success|failure" from the ended clock entry's `outcome`, and no result when it is unspecified.
- The declared result decides the "You won / You lost" headline. The ending-name table (`boss-down`, `party_defeated`) answers only when no result is sent.
- Each initiative entry carries the viewer's side: players and allied creatures the party's blue bar, hostile ones red, no bar when no stance is known. An allied creature's title says "with the party".
- The toast names allied creatures last seen standing: "the veteran came with you."

## Decided

- A combatant's side is read off `Sighting.stance`, the viewer's believed stance that the engine re-derives on every read. No new wire field: the protos already carry it and forbid stance on `PublicMemberInfo`.
- A companion keeps its place in initiative order. The strip draws its side, never moves it, because a companion stays a monster placement.
- Ending keys show in author words ("captain slain"), as the story log already showed them.

## Found

- The toolkit's session fold drops the ended beat's `outcome`: `session.ClockEntry` carries only `Ending`. rpg-api cannot fill the new field as a pure translator until the session package adds it.
- `stanceRing.ts` says rpg-api sends `Sighting.stance` empty. It no longer does: the api copies `session.Sighting.Stance`, filled from `encounter.BelievedStance`.
- There is no in-session party roster panel. The faction legend counts sides by faction (truth, not the viewer's stance), and the initiative strip is the only per-member row with portraits.

## Mistaken

- Nothing yet.

— cross-team agent, on behalf of KirkDiggler
