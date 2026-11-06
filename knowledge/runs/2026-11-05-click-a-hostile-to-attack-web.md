# 2026-11-05 · Click a hostile to attack · Walk up and swing, only when in reach

Card [rpg-project#872](https://github.com/KirkDiggler/rpg-project/issues/872), decisions D1–D4. Protos pinned at [rpg-api-protos v0.1.257](https://github.com/KirkDiggler/rpg-api-protos/releases/tag/v0.1.257): `TargetCandidate.approach = 6`, the cell where the attacker's own walk this turn stops within weapon reach. Built while the api slice (rpg-api, branch `approach-872`) and the toolkit slices (rpg-toolkit#2285, #2286) were built in parallel.

## Shipped

- **The Attack row is the only authority on reach.** A candidate in reach on an available row swings at once. A candidate with `approach` walks there first. Neither reads "Out of reach". A row refused for anything but reach (not this member's turn, no action left, downed) offers no Attack verb, so the click behaves as before — [clickToAct.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3fb14c11b00edba2d975bc436f014d25fac3cfb8/src/components/session/clickToAct.ts).
- **The walk never swings on its own.** The strike intent rides the walk the way the Speak approach does. The swing fires on the first fresh offer after the Move only if the Move's steps ended on the cell asked for AND the refreshed row has him in reach. A short walk, a refused Move, or a row that no longer offers him sends nothing — [useSessionCombatExperience.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3fb14c11b00edba2d975bc436f014d25fac3cfb8/src/components/session/combat-experience/useSessionCombatExperience.ts), [strikeFlow.test.tsx](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3fb14c11b00edba2d975bc436f014d25fac3cfb8/src/components/session/combat-experience/strikeFlow.test.tsx).
- **The swing is the ordinary attack.** The armed-click attack and the click-to-attack swing share one `fireAttack`, so the log shows the same attack either way.
- **The walk is the floor click's own route.** `walkToCell` plans with `findAtlasPath` over the same index, so shut doors stay shut, and the hover previews the very path the click sends. `MoveOutcome.accepted` now hears the cell the server's steps ended on — [useSessionWalk.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3fb14c11b00edba2d975bc436f014d25fac3cfb8/src/components/session/useSessionWalk.ts).
- **The hover names the click.** "Attack Orc" with the walk drawn to the approach cell, "Out of reach" in red, "Speak to Guard", or the choices joined by " · ". It uses the same tag as the bump's "Walk up to Gate Guard" — [MoveIndicator.tsx](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3fb14c11b00edba2d975bc436f014d25fac3cfb8/src/components/session/MoveIndicator.tsx).
- **Speak walks into range.** With one Speak offer standing, a creature the row does not list still offers "Speak to <name>", beside Attack or the bump. Choosing it walks into interaction reach and opens his lines on arrival — [clickToAct.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/click-attack-872/src/components/session/clickToAct.ts).
- **More than one verb shows the choices.** Attack, Speak and the bump are listed in that order. An out-of-reach Attack shows disabled. Escape, a floor click or Close shuts the menu — [CreatureVerbMenu.tsx](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3fb14c11b00edba2d975bc436f014d25fac3cfb8/src/components/session/CreatureVerbMenu.tsx).
- **The dial.** "Click a creature to act" sits in the feel dials drawer under Controls, in the same per-browser store as the camera and dice dials, and ships on. Off, no offers reach the map and every creature click is what it was — [controlDials.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3fb14c11b00edba2d975bc436f014d25fac3cfb8/src/feel/controlDials.ts).

## Decided

- **Attack is offered by a click only against a hostile stance.** The Attack row names allies and neutrals too, and the card says "a click on a hostile". A neutral is still attacked from the dock.
- **The dial covers every creature click, not only hostiles.** Off also drops the Speak verb and the menu. That is the one reading under which "off behaves as today" holds for every creature.
- **Among several Attack rows, in reach beats a walk, and the action slot beats a bonus one.** A main hand in reach swings before an off hand that would need a walk.
- **A target that moved but is still in reach after a full walk is swung at.** The rule is the server's offer at the end cell. Only a walk cut short of the cell asked for is refused locally.

## Found

- **Speak beyond reach was first left out, and review caught it.** The first head offered Speak only to creatures the Speak row already lists, so a far hostile with lines went straight to the swing. Kirk's D3 words were "if there are more options, we should see them and not just default to attack. for speaking we would just auto walk into range". The fix offers Speak whenever the one Speak offer stands, and choosing it runs the armed Speak's approach walk (rpg-project#753 R4). His lines open on arrival. With none, the Speak list opens, as armed Speak does today. This offers Speak to creatures the server never listed, the same trade the armed approach already makes.
- **The cut-short test catches its mutant.** Removing the arrival check makes "a walk cut short never swings" fail.

## Mistaken

- **The first run of the dial-order test failed.** It pinned camera, dice, then notifications as the last group, so a fourth group broke it. The test now pins controls after notifications.

— cross-team agent, on behalf of KirkDiggler
