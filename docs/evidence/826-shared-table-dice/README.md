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

- Commit under review: `<exact committed SHA from git rev-parse HEAD>`
- Browser/version: `<record>`
- Viewport/input device: `<record>`
- Reviewer/date: `<record after live review>`
- Kirk feel gate: pending live review

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
