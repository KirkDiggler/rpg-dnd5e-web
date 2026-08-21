# rpg-dnd5e-web#762 slice 3 — drawing other members, live evidence

Captured against the local `dev` stack (envoy :8080, redis :6380), player
`toolkit-sandbox-fighter`, via a scripted Playwright walkthrough
(`chromium.launch({ executablePath: '/usr/bin/google-chrome' })`).

## Screenshots

- `01-start-first-chamber.png` — the tomb's first chamber at session start.
  Only the local player is drawn; `GetView` returns zero sightings here
  (the skeleton in the middle chamber is not yet perceived).
- `02-skeleton-visible-in-middle-chamber.png` — after walking through the
  first doorway, the skeleton model (`skeleton-soldier-01.glb`, resolved
  via `resolveMonsterModelUrl('skeleton', ...)`) appears at its real cell
  in the middle chamber, drawn from `GetView.sightings` through
  `sightingEntities.ts` -> `SessionCanvas`'s `otherMembers` prop.
- `03-fight-locked-status-line.png` — after the walk toward the skeleton
  forms a fight, a further click's `Move` RPC is refused with the
  `session.ErrInBubble` `FailedPrecondition` ("member is in a fight"), and
  the top-left status line shows the friendly rewrite: **"In a fight —
  movement is locked."** (`moveErrorMessage.ts`'s `formatMoveError`),
  never the raw sentinel text.

## GetView wire excerpt (real response, not fixture data)

The first non-empty `GetView` response captured on the wire
(`getview-network-log.json` has the full request/response log; this is the
`sightings[0]` entry from it):

```json
{
  "$typeName": "dnd5e.api.session.v1alpha1.Sighting",
  "subject": "skeleton-1",
  "channel": "sight",
  "at": "0n",
  "currentVia": ["sight"],
  "status": "current",
  "seen": {
    "$typeName": "dnd5e.api.session.v1alpha1.Seen",
    "position": { "x": 10, "y": 3 }
  }
}
```

`sightingsToEntities` turns this into:

```js
{
  subject: 'skeleton-1',
  monsterRefId: 'skeleton',        // monsterRefIdFromSubject strips the -1
  position: { x: 10, y: -13, z: 3 }, // positionToCube(q=10, r=3)
  remembered: false,                 // currentVia is non-empty (live sight)
}
```

Note: `Sighting.payload` on this wire happens to carry a legacy
JSON-encoded `{"x":10,"y":3}` blob (visible in the raw log) — confirms why
the review brief's "never decode payload, render only from `seen`" rule
matters: `payload` is not authoritative and is never read by this slice's
code (`sightingEntities.ts` only reads `sighting.seen?.position`).

## What this proves against the done criteria

- Walking through the first doorway makes the skeleton appear at its real
  cell (`(10, 3)` on the wire, the same cell noted in prior sessions) —
  never guessed client-side.
- The fight-bubble refusal (`session.ErrInBubble`, gRPC
  `FailedPrecondition`) surfaces as "In a fight — movement is locked."
  instead of raw RPC text, on further clicks after the fight forms.
