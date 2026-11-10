# Run — 2026-11-11 — gate conversation S3 the hail opens the panel

Slice [rpg-project#923](https://github.com/KirkDiggler/rpg-project/issues/923) of story [rpg-project#769](https://github.com/KirkDiggler/rpg-project/issues/769). Base: `rpg-dnd5e-web` `dev` at [`4da397d6`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/4da397d6).

## Shipped

- A Speak row carrying `address` arms Speak on the guard and opens the reply panel with no click, once per address, while the client is idle on the world clock — [rpg-dnd5e-web#1407](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1407).
- The hail centres the camera on the guard through the keyed presentation focus a monster's turn start uses — [rpg-dnd5e-web#1407](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1407).
- The studio's Encounter home gains Interactions, with "Hails within N cells" bounded 1 to 3, and a served-castle round trip that keeps `approach` and `on: approached` — [rpg-dnd5e-web#1407](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1407).
- The guard's hail line toasts to the hailed player as speech at him (`line-to-you`), read off `TableAnswer.to` (protos v0.1.266), and his anonymous voice under the same act tag does not toast a second time — [rpg-dnd5e-web#1407](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1407).

## Decided

- Any cancel while addressed dismisses the hail for that guard + interaction until a fresh offer comes without the address. This is so a cancelled manual Speak on the guard does not spring back as a hail — [rpg-dnd5e-web#1407](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1407).
- Saying a line is not a dismissal: the next addressed offer opens the panel on the remaining lines, because the conversation is what the hail took focus for — [rpg-dnd5e-web#1407](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1407).
- "Idle" excludes free-roam Move. On the world clock Move is never armed (the coherence check keeps Move only on a turn), so "nothing armed" is the whole rule — [rpg-dnd5e-web#1407](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1407).
- The hail camera is not behind the follow-monster-turns dial, because the hail is the viewer's own conversation and the ruling asks for the focus — [rpg-project#923 rulings](https://github.com/KirkDiggler/rpg-project/issues/923).
- `approached` stays out of the studio's `STATE_BEATS`, because it is a behaviors wake and not a dungeonspec states beat — [rpg-dnd5e-web#1407](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1407).
- A table answer's `to`, when present, decides who the line is said to over the act-tag bump inference, which stays only as the fallback for a server that does not send it; a bump said to the viewer keeps `answer-to-your-bump` — [rpg-dnd5e-web#1407](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1407).
- The one-toast rule ties a line to its voice by the act tag both carry, never by timing or text, and the log keeps both rows — [rpg-dnd5e-web#1407](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1407).

## Found

- The previous slice added no interaction form: root `interactions` rode the scope's `unread`, so this slice built the first one — [rpg-dnd5e-web#1405](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1405).
- The client never re-sends a dropped walk remainder: it animates only `MoveResponse.steps` plus the member's own stream walk acts — [rpg-dnd5e-web#1407](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1407).
- On Node 24.19, `bundles.test.ts > a bundle that uses itself` overflows the stack on pristine `origin/dev`, while dev CI passes — [rpg-dnd5e-web#1407](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1407).
- The operator's early look showed only the voice toast for the hail: a table answer toasted only as an answer to the viewer's line or bump, so the hail matched neither — [rpg-project#923](https://github.com/KirkDiggler/rpg-project/issues/923).

## Mistaken

- A first idle test armed Move on the world clock, a state the hook never holds there; the test was dropped and the rule tightened to "nothing armed" — [rpg-dnd5e-web#1407](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1407).
