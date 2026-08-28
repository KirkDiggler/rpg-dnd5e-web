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

## grpcurl confirmation (protocol-level, independent of the web client)

The browser evidence above goes through this PR's own client code
(`createGrpcWebTransport`), which is the right evidence for "does the PR
work" but leaves one question open: is the field really on the wire, or
could the client be papering over something? `grpcurl` answers that
directly against the same `localhost:8080` — no web app, no TypeScript,
plain gRPC/server reflection. (An earlier plain-JSON `curl` POST against
this same endpoint returned 415 — that was a protocol mismatch in the
probe, envoy speaks gRPC/gRPC-web here, not Connect's unary-JSON mode, not
an availability gap. This grpcurl call and the browser's grpc-web calls
both reach the same live server fine.)

Schema, via server reflection (`grpcurl -plaintext localhost:8080 describe
dnd5e.api.session.v1alpha1.AtlasProp`):

```
message AtlasProp {
  string ref = 1;
  .dnd5e.api.session.v1alpha1.Position at = 2;
  bool blocks_movement = 3;
  bool blocks_line_of_sight = 4;
  string facing = 5;
  float offset_x = 6;
  float offset_y = 7;
}
```

`PutDungeon(validate_only)` against a fresh dungeon (`grpcurl -plaintext -H
"authorization: Dev web-261-evidence" -d @ localhost:8080
dnd5e.api.authoring.v1alpha1.AuthoringService/PutDungeon`, `facing: ne`,
`offset: [0.3, -0.1]` in the request YAML):

```json
{
  "atlas": {
    "grid": "GRID_KIND_HEX",
    "cells": [{}, { "x": 1 }],
    "props": [
      {
        "ref": "dnd5e:props:statue-reaper",
        "at": { "x": 1 },
        "blocksMovement": true,
        "blocksLineOfSight": true,
        "facing": "ne",
        "offsetX": 0.3,
        "offsetY": -0.1
      }
    ],
    "layout": "HEX_LAYOUT_POINTY_TOP",
    "regions": [
      {
        "id": "region-1",
        "name": "Region 1",
        "cells": [{}, { "x": 1 }],
        "archetype": "crypt",
        "lighting": { "intensity": 0.6 }
      }
    ]
  }
}
```

`facing`/`offsetX`/`offsetY` round-trip verbatim (`ne` / `0.3` / `-0.1`,
matching the request exactly), confirmed at the protocol level, independent
of anything this PR's own client code does.
