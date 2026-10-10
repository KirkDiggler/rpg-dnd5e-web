# Action information consumer proof

Tracking: [project#543](https://github.com/KirkDiggler/rpg-project/issues/543).
Design and checked plan: `rpg-project/ideas/action-information/`.

`?concept=action-information` renders the real `ActionDock`, desktop/compact
organizers and reusable `ActionInformationContent` on generated declaration
fixtures from `fixtures.ts`. The standalone body examples remain alongside it.
This is not a live description catalogue or a fallback table.

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

Published wire: protos#384 / v0.1.230, `Declaration.information` and
`CastOption.description`. The consumer lab records UI intents only and sends
no game commands. It exercises supplied/absent metadata, unavailable offers,
long descriptions, real hover cards, touch inspection and cast-option controls.

Toolkit#1987 and API#1084 own live metadata delivery; Patient Defense repair
remains separately filed in toolkit#1986. Fixture screenshots and consumer
unit/route tests do not prove those provider boundaries are connected. The
UI code does not repair a gameplay defect or fabricate a missing description.
