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

- Source base HEAD at automated run: `b249f970f2b98a4e0b496e25404e23aa106b1da8`, with the audited Task 9 Fix Round 1 working-tree changes later committed together with this worksheet
- Browser/version: Chromium `151.0.7922.169` (`/usr/bin/google-chrome`)
- Viewport/input device: desktop `1280×800`, stack-boundary `1024×768`, narrow-touch `390×844` (hasTouch)
- Reviewer/date: automated harness, `2026-08-26T23:19:09.620Z`
- Kirk feel gate: pending live review

## Task 9 Fix Round 1 automated browser run — PASS

Observed `2026-08-26T23:19:09.620Z` against the exact launch URL above. The
bounded run used a 720000ms global deadline, 20000ms per-step deadline, 30000ms
stage deadline, 35000ms scenario deadline, 10000ms cleanup deadline, and two
scenario workers. It completed in 650195ms with overall `passed: true` and no
fatal errors.

The attachment probe retained the 2 CSS px limit, stable Roller per-die and
renderer-generation selector, both center and off-center grabs, and
center/quarter/edge tray samples. It measured both Roller members in the
Physical `bless-mixed-attack` scenario at all three viewports: **36/36 samples
passed**, zero samples failed, and the maximum error was **0.000006 CSS px**.
No pointer coordinates or histories were written to the result.

Responsive checks passed in all three required states: desktop `1280×800` and
stack-boundary `1024×768` showed two panes, while narrow-touch `390×844` showed
the tabbed single-pane mode. The complete sweep passed **81/81** runs across
three candidates, nine scenarios, and three viewports. Runtime records contain
zero console errors, zero page errors, zero request failures, and zero fatal
errors. This automated PASS does not change **Kirk feel gate: pending live
review**.

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
