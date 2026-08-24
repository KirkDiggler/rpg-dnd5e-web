# Live wire evidence — rpg-project#261 prop facing/offset

2026-08-24. Against the real local stack after the api lane's rpg-api#830
merged and rpg-api:local was rebuilt from `dev` (authoring enabled, envoy on
`:8080`) — not a fixture, not `fixtureAtlasOf`. Driven through the actual
builder UI (`AuthorView` → `DungeonBuilder`) in a real browser, painting two
floor cells, placing `dnd5e:props:statue-reaper`, and setting its facing to
`ne` and offset to `[0.3, 0]` through the real `FacingControl`/`OffsetControl`
panel this PR adds.

Decoded `PutDungeon` response (the app's own dev-mode response logger,
`src/api/client.ts`'s `loggingInterceptor`), after setting facing:

```json
{
  "$typeName": "dnd5e.api.authoring.v1alpha1.PutDungeonResponse",
  "errors": [],
  "atlas": {
    "$typeName": "dnd5e.api.session.v1alpha1.GetAtlasResponse",
    "grid": 2,
    "layout": 1,
    "cells": [
      { "x": 0, "y": 0 },
      { "x": 1, "y": 0 }
    ],
    "props": [
      {
        "$typeName": "dnd5e.api.session.v1alpha1.AtlasProp",
        "ref": "dnd5e:props:statue-reaper",
        "blocksMovement": true,
        "blocksLineOfSight": true,
        "facing": "ne",
        "offsetX": 0,
        "offsetY": 0,
        "at": { "x": 1, "y": 0 }
      }
    ]
  }
}
```

And after then setting offset to `[0.3, 0]` (same session, next `PutDungeon`
round trip — the server round-tripped the exact IEEE-754 float32 the wire
carries a `float` as):

```json
"facing": "ne",
"offsetX": 0.30000001192092896,
"offsetY": 0,
```

This is the full path the toolkit/api lanes built, live: dungeonspec YAML
(this PR's `place[i].facing`/`offset`) → toolkit `dungeonspec` parse/validate
→ `encounter.PropInput`/`Atlas.Props` → `session` projection → api's
`AuthoringService.PutDungeon` → wire `AtlasProp.facing`/`offset_x`/`offset_y`
→ this PR's web client, decoded exactly as authored.

Screenshots:

- `prop-facing-live-yaml.png` — the 2D canvas (facing tick visible on the
  marker), the live Inspector panel (facing compass with `ne` active, offset
  steppers at `0.3`/`0`), and the compiled YAML pane, all live against
  `localhost:8080`.
- `prop-facing-live-3d-preview.png` — the same dungeon's 3D preview tab,
  rendering the statue through the real `DungeonPreview3D`/`PropModel` path
  against the live-returned atlas, facing `ne`.

`Save & Play` was attempted but stayed disabled in this pass (not
investigated further — this evidence already answers the specific ask, a
populated live atlas; `Save & Play`'s own gate is outside this PR's scope).
