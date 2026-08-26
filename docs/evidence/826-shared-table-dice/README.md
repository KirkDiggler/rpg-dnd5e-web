# Web #826 shared-table dice — live review evidence template

This tracked file is a review worksheet, not captured evidence and not an
approval record. Keep screenshots, videos, browser traces, and provider bytes in
the private verification directory; record only hashes here if Kirk asks for a
tracked audit reference.

## Exact launch

```bash
npm run dev -- --host 127.0.0.1 --port 3010
# open http://127.0.0.1:3010/?concept=attack-die-3d&attackDieStage=tray
```

## Capture identity

- Commit under review: `c69b0efebfe423de39d32f33b3c2bc0eaa7355b9` (source HEAD at automated run)
- Browser/version: Chromium `151.0.7922.169` (`/usr/bin/google-chrome`)
- Viewport/input device: desktop `1280×800`, stack-boundary `1024×768`, narrow-touch `390×844` (hasTouch)
- Reviewer/date: automated harness, `2026-08-26T22:06:34.621Z`
- Kirk feel gate: pending live review

## Task 9 automated browser run — BLOCKED

Observed 2026-08-26T22:06:34.621Z against source HEAD
`c69b0efebfe423de39d32f33b3c2bc0eaa7355b9` at the exact launch URL above.
Chromium was `151.0.7922.169` at `/usr/bin/google-chrome`. The previous RED
transcript is unavailable; no claim is made about its contents.

The script used the stable Roller per-die/generation selector, both center and
off-center grabs, and center/quarter/edge tray samples. Its bounded run used a
720000ms global deadline, 20000ms per-step deadline, 30000ms stage deadline,
35000ms scenario deadline, 10000ms cleanup deadline, and three scenario
workers; it completed in 566407ms with no fatal error. The responsive checks
passed at desktop `1280×800`, stack-boundary `1024×768`, and narrow-touch
`390×844`. Attachment failed: all 36 samples exceeded the 2 CSS px limit.
Desktop had 12 failures (20.714337–214.056191 CSS px), stack-boundary had 12
(19.034293–157.290500 CSS px), and narrow-touch had 12
(16.592338–94.933038 CSS px); the aggregate maximum was 214.056191 CSS px.

The candidate/scenario sweep ran all 81 cases: 79 passed and two timed out at
35000ms: narrow-touch/Weighty/critical-damage and
narrow-touch/Physical/critical-damage. The run recorded zero console errors,
three page errors (`Cannot read properties of null (reading 'addEventListener')`)
at narrow-touch/Weighty/great-weapon-fighting,
narrow-touch/Energetic/great-weapon-fighting, and
narrow-touch/Physical/reduced-motion; it also recorded two `net::ERR_ABORTED`
D4 fetches at desktop/Physical/bless-mixed-attack and
stack-boundary/Physical/bless-mixed-attack. Exit status was 1.

A temporary missing-evidence fixture suppressed bridge publication; the final
harness exited 1 with 12 of 12 attachment samples marked `missing`. The
mutation was restored by a shell trap. These automated failures do not change
Kirk's pending live feel gate.

## Candidate/scenario matrix

Run every scenario with each candidate. Record observations, not inferred
approval.

| Candidate | Scenario IDs to throw | Observation |
| --- | --- | --- |
| Weighty | `single-d20`, `bless-mixed-attack`, `ordinary-damage`, `critical-damage`, `great-weapon-fighting`, `duplicate-release`, `missing-release`, `reduced-motion`, `provider-failure` | Pending |
| Energetic | `single-d20`, `bless-mixed-attack`, `ordinary-damage`, `critical-damage`, `great-weapon-fighting`, `duplicate-release`, `missing-release`, `reduced-motion`, `provider-failure` | Pending |
| Physical | `single-d20`, `bless-mixed-attack`, `ordinary-damage`, `critical-damage`, `great-weapon-fighting`, `duplicate-release`, `missing-release`, `reduced-motion`, `provider-failure` | Pending |

For each row note pickup clarity, group attachment, weight/travel, settle,
reroll cue, modifier toast, final-total readability, and Roller/Witness parity.
Also check desktop, the `1024px` stack boundary, and a narrow touch width using
the Roller/Witness tabs.

## Attachment measurement

Read only `window.__sharedTableDiceEvidence` while holding a die. Record:

- bridge revision: `<record>`
- presentation/group/witness/generation/die identity: `<record>`
- projected rendered anchor: `<x, y>`
- held pose applied: `<true/false>`
- frame sequence and whether it increased: `<record>`
- stale callback after scenario/replay rejected: `<yes/no>`

Do not capture or add pointer samples, authoritative results, damage, URLs,
Canvas/WebGL handles, or renderer resources to this worksheet.

## Runtime errors

- Console errors: `<none, or exact messages>`
- Page errors/unhandled rejections: `<none, or exact messages>`
- Failed provider/network requests: `<none, or exact fixture/provider facts>`
- Semantic fallback status/result visibility: `<record>`

## Asset caveat

Non-d20 carved assets are provisional. This review can assess group composition
and motion, but it does not approve their art, engraved-face mapping, provider
manifest, or production ownership.

## Private screenshots (only if captured)

| Private filename | SHA-256 | What it demonstrates |
| --- | --- | --- |
| `<not captured>` | `<not captured>` | `<candidate/scenario/viewport>` |

No screenshot or hash is required to throw the stage. A machine result, private
capture, or completed matrix must not be rewritten as Kirk approval. The only
current status is: **Kirk feel gate: pending live review**.
