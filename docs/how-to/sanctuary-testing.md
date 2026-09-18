# Testing Sanctuary

This web branch targets merged API PR #1007, merge
`8e8f596456d20d057d99eac6dcdfb47d11d59e5b`. The API adopts published Toolkit
root v0.181.0, resolution v0.54.0, encounter v0.89.0, and session v0.96.0.
No additional web SDK bump is required for this provider release adoption.

The existing local image `rpg-api:sanctuary-1006` and running stack remain the
earlier tested API commit `d1717ba2e409f0ac0651782b7f559ccd8b5a9d98`, which used
the development provider commits. Build the merged API revision into a new image
when verifying the released combination; do not assume the old local tag changed.

The web SDK is v0.1.201, lockfile commit
`0655dbbca56c17e9f97bddf4715570ce7d840e7a`. This also brings the additive creature
table contract: `tempered` intentionally adds no Story row or refresh. Creature
table rendering remains separate web PR #1123 / API #1005 work.

## Local setup

Use your local development stack with an API image built from the merged revision
above. Keep its existing auth, Redis, content and Envoy settings. Updating this PR
does not switch the existing local stack.
Then check out this web branch and run:

```sh
npm ci
# Restore the approved private models/textures for this checkout.
npm run assets:sync
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
3. The protected recipient must immediately show Sanctuary Immune. After the
   next turn refresh, try Sanctuary on that recipient again: the target must
   be unavailable with a cooldown reason. Refusal must spend no bonus action
   or slot. Another caster must also be blocked from reapplying it.
   Ending the ward must leave this cooldown in place; it expires after 20
   recipient turn ends, with progress retained across reloads.
4. Make a weapon attack against the protected creature. On a failed ward save,
   Story says the ward blocked the attack and shows the **attacker's** ability,
   roll, total, DC and warding caster. No normal attack die, miss or damage is
   fabricated. Action availability refreshes.
5. Try a hostile spell against a protected creature. A failed ward save names
   the **hostile caster**, not the target, as the saver. The response notice
   lists only warded targets; neighboring target results remain independent.
   Sacred Flame is suitable for this test. Casting Bane from the same Cleric
   would replace their Sanctuary concentration before the ward test.
6. Repeat until a ward save passes; ordinary provider attack/spell results must
   continue through their existing presentation. No client-side save arithmetic
   or success inference is used. Passing the save must not grant the attacker
   Sanctuary Immune.
7. Reload/reconnect and compare recovered Story and Debug with the live facts.
   Confirm the protected target's HP and the acting player's spent resources.

Ward saves use the existing saving-throw dice presentation, attributed to the
attacker/caster, with a sourced calculation in Story. The response carries only
a summary; event sequence, recipient and deduplication remain the stream's own.

Known provider limitation: a nested ward save colliding with an optional roll
offer such as Resistance can return a cannot-be-suspended error. Avoid that
combination for the basic smoke test; no client workaround is added here.

Automated tests cover serialized replay, duplicate/conflicting facts, zero
values, calculation totals, mixed targets, response ordering, cast notices and
refreshes. On the preceding development stack, the user observed Sanctuary Immune
in Story, saw it remain after the ward, and confirmed that no eligible targets
prevented recasting. Those observations verify the anti-recast interaction; they
do not establish manual timer expiry or every ward-save scenario above. The
20-recipient-turn expiry is covered by provider regression tests.

## Existing work incorporated

The WSL checkout `/home/frank/projects/rpg-dnd5e-web`, branch `sanctuaryward`,
contained unfinished Sanctuary changes. This PR continues its aggressor-owned
save presentation and carries its ward-presentation tests forward, sharing the
existing save conversion and adding complete replay/conflict identity. The
original checkout is unchanged. Exploratory browser scripts and temporary
character-creation console logging are not part of the PR.
