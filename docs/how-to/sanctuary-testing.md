# Testing Sanctuary

This web branch targets API PR #1007, local image `rpg-api:sanctuary-1006`
(commit `8da02bcf018fdd6f7398e57df606e7568bf3ae8a`). Its four Toolkit providers
are development pins, not released versions. Do not use an arbitrary `dev` API
image and assume it contains Sanctuary.

The web SDK is v0.1.201, lockfile commit
`0655dbbca56c17e9f97bddf4715570ce7d840e7a`. This also brings the additive creature
table contract: `tempered` intentionally adds no Story row or refresh. Creature
table rendering remains separate web PR #1123 / API #1005 work.

## Local setup

Use your local development Compose stack with the API service's **image** set
to `rpg-api:sanctuary-1006` (not just the registry tag variable). Keep its existing
auth, Redis, content and Envoy settings. This PR does not switch existing stacks.
Then check out this web branch and run:

```sh
npm ci
VITE_API_HOST=http://localhost:8080 VITE_DEV_PLAYER_ID=sanctuary-tester npm run dev
```

Use the Envoy port of that stack if it is not 8080. Open the URL Vite prints
(normally http://localhost:3001). Restart Vite when changing the API address.

## Browser acceptance

1. Create a fresh Cleric through normal creation and select Sanctuary. Older
   saved characters are not automatically backfilled with the new spell.
2. Enter a test session. Cast Sanctuary using its offered target selection.
   Check the authoritative slot, bonus action and concentration/condition state.
   The current provider models Sanctuary as a touch spell with concentration.
3. Make a weapon attack against the protected creature. On a failed ward save,
   Story says the ward blocked the attack and shows the **attacker's** ability,
   roll, total, DC and warding caster. No normal attack die, miss or damage is
   fabricated. Action availability refreshes.
4. Try a hostile spell against a protected creature. A failed ward save names
   the **hostile caster**, not the target, as the saver. The response notice
   lists only warded targets; neighboring target results remain independent.
   Sacred Flame is suitable for this test. Casting Bane from the same Cleric
   would replace their Sanctuary concentration before the ward test.
5. Repeat until a ward save passes; ordinary provider attack/spell results must
   continue through their existing presentation. No client-side save arithmetic
   or success inference is used.
6. Reload/reconnect and compare recovered Story and Debug with the live facts.
   Confirm the protected target's HP and the acting player's spent resources.

Ward saves use the existing saving-throw dice presentation, attributed to the
attacker/caster, with a sourced calculation in Story. The response carries only
a summary; event sequence, recipient and deduplication remain the stream's own.

Known provider limitation: a nested ward save colliding with an optional roll
offer such as Resistance can return a cannot-be-suspended error. Avoid that
combination for the basic smoke test; no client workaround is added here.

Automated tests cover serialized replay, duplicate/conflicting facts, zero
values, calculation totals, mixed targets, response ordering, cast notices and
refreshes. Full browser gameplay acceptance is still a separate manual step.

## Existing work incorporated

The WSL checkout `/home/frank/projects/rpg-dnd5e-web`, branch `sanctuaryward`,
contained unfinished Sanctuary changes. This PR continues its aggressor-owned
save presentation and carries its ward-presentation tests forward, sharing the
existing save conversion and adding complete replay/conflict identity. The
original checkout is unchanged. Exploratory browser scripts and temporary
character-creation console logging are not part of the PR.
