# Action information consumer proof

Tracking: [project#543](https://github.com/KirkDiggler/rpg-project/issues/543).
Design and checked plan: `rpg-project/ideas/action-information/`.

`?concept=action-information` renders the real reusable
`ActionInformationContent` with explicit, provisional `InformationFixture`
values. This is not a live description catalogue or a fallback table.

The consumer needs an action description and ordered label/value base facts,
separate from existing contextual effect rows. Warhammer demonstrates base
damage above a Rage row without combining them; Bane and Dodge demonstrate
that zero effect rows cannot hide descriptions. Command demonstrates option
explanations. The unavailable toggle preserves the information rather than
turning it into an executable action.

The body takes no command callback, renders text rather than HTML, keeps
actor and target-held rows separate, and identifies missing descriptions or
blank fact fields without inventing game facts. Its outer surface owns
hover, focus, pinning and scrolling; this fixture does not prove the live
surface's lifecycle or execution fencing.

Wire delta: protos#384, `Declaration.information` and
`CastOption.description`. Live provider delivery, selector independence,
current-target wiring, real effects and desktop/mobile encounter acceptance
remain integration work. Fixture screenshots and unit tests are not evidence
that those boundaries are already connected.
