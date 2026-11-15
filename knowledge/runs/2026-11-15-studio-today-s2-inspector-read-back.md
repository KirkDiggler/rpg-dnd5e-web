# Run — 2026-11-15 — studio today S2 inspector read-back

Slice [rpg-project#968](https://github.com/KirkDiggler/rpg-project/issues/968) of story [rpg-project#966](https://github.com/KirkDiggler/rpg-project/issues/966). Base: `rpg-dnd5e-web` `dev` at [`285152a2`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/285152a289f1311f8f97addbfc72803617a9fb10).

## Shipped

- The inspector's read-back for a creature or a prop is the engine's `PutDungeonResponse.read_back`, filtered to the selection; protos pinned at `v0.1.278` — [rpg-project#968](https://github.com/KirkDiggler/rpg-project/issues/968).
- `world-building/readBack.ts` and its test are deleted; nothing imports them — [rpg-project#944](https://github.com/KirkDiggler/rpg-project/issues/944).
- `refusalJump.ts` exports `targetOfPath`, the one path-to-selection map; read-back connections and statement paths land through it — [design R25](https://github.com/KirkDiggler/rpg-project/blob/studio-today-design/ideas/encounter-studio/design.md).

## Decided

- Which statements belong to a selection: every statement whose `about` is the selection, under the title of the group it sits in, plus the whole group about anything those statements connect to with role `uses` (one hop), because the captain's routine sits in its own group `{routine, captain-policy}` reached only by `creature.routine`'s `{routine, captain-policy, uses}`, and a prop has no group of its own (its statements sit in the site's group) — [rpg-project#968](https://github.com/KirkDiggler/rpg-project/issues/968).
- `uses` is not followed past one hop: a routine's `{bundle, …, uses}` is the routine's, not the creature's, and the bundle's group is not shown — [rpg-project#968](https://github.com/KirkDiggler/rpg-project/issues/968).
- A connection becomes a jump only for the plan's kinds (creature, prop, door, region, fact, topic, conversation); faction, routine, record, bundle and exit connections are not buttons, though the old renderer opened factions, tables and intel, because the plan names those seven and a gap is not a license to widen — [plan Task 3](https://github.com/KirkDiggler/rpg-project/blob/studio-today-design/ideas/encounter-studio/plan-places-and-ways.md).
- Each connection kind is turned into the compiler's own path (`room.room.monsterBindings.<id>`, `propBindings`, `doorBindings`, `regions[i]`, `interactions.<id>`) and resolved by `targetOfPath`, so no second map exists — [design R25](https://github.com/KirkDiggler/rpg-project/blob/studio-today-design/ideas/encounter-studio/design.md).
- `{readBack, readBackIsCurrent}` live on the publishing hook (`useRoomPublishing`), not the studio session object, because the session does not own the preview; the workspace passes `studioReadBackOf(publishing, gate)` to the inspector — [rpg-project#968](https://github.com/KirkDiggler/rpg-project/issues/968).
- A clean check that carries no read-back clears the last one (the panel says the server sent none) rather than keep sentences from an earlier draft unmarked — [rpg-project#968](https://github.com/KirkDiggler/rpg-project/issues/968).
- `actionAugmentSentences` (with `resolvedActionsOf`, `weaponNoun`) and `ENGINE_LAWS` are deleted: only `readBack.ts` used them and each wrote the studio's own sentence about what will run; `turnsTo` stays — [design R25](https://github.com/KirkDiggler/rpg-project/blob/studio-today-design/ideas/encounter-studio/design.md).
- Tests that asserted the old prose keep their document assertions; prose-only tests are dropped and listed in the PR — [rpg-project#968](https://github.com/KirkDiggler/rpg-project/issues/968).

## Found

- In the engine's castle read-back a prop has no group: its statements carry `about {prop, id}` inside the site group "The Mad King’s Castle (the-mad-king)" under "The place" — [rpg-project#968](https://github.com/KirkDiggler/rpg-project/issues/968).
- The full castle read-back from toolkit `main` 4ff62fe5 is 536 KB of JSON; its `not_yet_said` is empty — [rpg-project#967](https://github.com/KirkDiggler/rpg-project/issues/967).
- Roles present on the castle: `uses`, `runs`, `holds`, `asks`, `teaches`, `grants`, `wakes-on`, `said-to`, `member-of`, `speaks-lines-of`, `advances`, `carries`, `tells`, `done-to`, `sends-to` — [rpg-project#968](https://github.com/KirkDiggler/rpg-project/issues/968).
- `behaviorDefinitions.<id>…` paths have no case in the path map, so a routine statement's path is not a jump — [rpg-project#968](https://github.com/KirkDiggler/rpg-project/issues/968).
- `bundles.test.ts` "a bundle that uses itself" overflows the stack on this machine at clean `dev` 285152a2 too, while CI on that head is green — [CI at 285152a2](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/285152a289f1311f8f97addbfc72803617a9fb10).

## Mistaken

- The plan's rule "every group whose `about` is `{creature|prop, <id>}`" would show nothing for a prop and no routine for the captain; the fixture showed it before any code was written, and the rule above replaced it — [rpg-project#968](https://github.com/KirkDiggler/rpg-project/issues/968).
