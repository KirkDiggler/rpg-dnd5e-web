# Real-route evidence: prop-model resolver (#528, charter #523)

Per the house rule (see `idle-anim-506-real-route-reverify.md`): the real
game route, not `/playtest`. This PR wires a prop reference-key resolver
(`obstaclePropKeys.ts`, `propManifest.ts`, `PropModel.tsx`) into
`HexEntity`'s obstacle branch, but **no real backend code path sends an
obstacle/prop entity yet** (verified below) — so this doc proves the
resolver renders real GLBs on the real route via a dev-only injected key,
exactly as the charter's evidence house rule anticipates for this case,
and documents precisely what was injected and why.

## Environment

Reused an already-running local stack from this same sandbox (not
rebuilt from scratch — see `idle-anim-506-real-route-reverify.md` for the
from-source recipe if a fresh stack is ever needed): Go-built `rpg-api`
(main, commit `8c770a2`) against a local Redis, fronted by `grpcwebproxy`
on `localhost:8080` (the same grpc-web translation layer `rpg-deployment`
normally provides via Envoy). This PR's own worktree's `npm run dev`
(Vite, port 5186) points at that proxy via `VITE_API_HOST` (`.env`,
unchanged). Driven with a small Playwright script (`drive_props_528.mjs`),
real Chromium, real clicks/navigation, real network calls — no mocking.

Assets: `public/models/synty/` populated by rsync-ing this PR's own
`rpg-game-assets` branch (`asset/528-prop-keys`, PR #12 — the sibling
asset PR this web PR syncs against, not yet merged to `main`) rather than
`npm run assets:sync` (which would pull unmerged-PR `main` and miss the
new `key`/`keys` fields this PR's manifest mirror depends on).

## Confirmed: no server code sets obstacle_ref/prop_ref (or v1alpha1 ObstacleType) yet

Before reaching for a dev injection, checked whether the real backend
could just be asked to spawn a real prop entity:

```
$ grep -rn 'EntityType_ENTITY_TYPE_OBSTACLE\|obstacleRef\|propRef' internal/
(no matches)
$ grep -rln 'ObstacleType\|OBSTACLE' cmd/
(no matches — devseed has no obstacle-injection flag, unlike rpg-api#634's
 --inject-combat used for #512's downed-model evidence)
```

Confirmed: today's real encounter stream never emits an `Entity` whose
`data` oneof is `obstacle` or `prop`, and `cmd/devseed` has no flag to add
one. This is a genuine platform-side gap, not a client-side wiring gap —
exactly what #523 asks platform to close next. Faking a server response
was explicitly out of scope (house rule); the dev-injection path below is
the documented alternative.

## What was injected, and why

`EncounterMap.tsx` reads an opt-in, comma-separated
`?devPropDemoKeys=<key>,<key>,...` query param (same "read the query
string once, default off" convention as its existing `syntyDungeon`
flag) and appends one synthetic `RenderableEntity` per key —
`{ type: 'obstacle', propRefId: <key>, position: <hex neighbor of the
local player> }` — via `buildDevPropDemoEntities`
(`playtestMapHelpers.ts`, unit-tested). This is real, permanent,
documented source in the PR — not a throwaway script hack — gated so it
can only ever ADD entities and never reads/mutates real encounter state;
absent the query param it is a complete no-op for every real player.

Real character used: **Alice the Rogue**, an existing character already
in an **already-real, already-active** solo lobby/encounter from a prior
session in this shared sandbox (`GetMyActiveLobby` returned a live
`lobbyId`/`encounterId` immediately on `?playerId=alice` — the same
dev-auth-bypass convention `drive_game_515.mjs` established for #515).
Navigating straight to that URL lands on the real `EncounterView`/
`GameView` route — the same component tree production players use.

Injected keys: `barrel,pillar,rock-pile,crate,tomb,barricade` (6 of the
17 charter keys — the cap is deliberate, `buildDevPropDemoEntities` only
has 6 hex-neighbor offsets around the anchor before entities would start
overlapping).

## Real GLBs rendering on the real route

**`props-528-real-route-wide.png`** / **`props-528-real-route-zoomed.png`**
— Alice the Rogue on the real `EncounterView`, surrounded by resolved
prop GLBs instead of undifferentiated purple capsules: a wood crate
(`dnd5e:props:crate`), the goblin spike-fence barricade
(`dnd5e:props:barricade`), a rock-pile boulder cluster
(`dnd5e:props:rock-pile`), and a stone pillar (`dnd5e:props:pillar`) are
all clearly, unambiguously visible and distinguishable from one another
in both frames — proving `resolvePropKeyForEntity` -> `resolvePropVariant`
-> `PropModel`'s `useGLTF`/clone/`<primitive>` path is resolving distinct
manifest entries to their correct distinct GLBs, not just rendering _a_
model. I viewed both frames. No console errors beyond the pre-existing
benign `StreamEncounter` `AbortError` on navigation/StrictMode teardown
that `idle-anim-506-real-route-reverify.md` already documented as
unrelated to this line of work.

## Graceful fallback for an unmapped key, on the same real route

**`props-528-fallback-unknown-key.png`** — same real route, same real
character, `?devPropDemoKeys=barrel,unknown-thing-not-in-manifest`: the
unmapped key renders as the exact pre-existing purple capsule primitive
(`HexEntity`'s unchanged obstacle fallback), not a broken/missing model,
a crash, or a blank gap. I viewed the frame. Confirms the `#479` boundary
lineage this codebase already applies to class models
(`ClassCharacterModel`/`resolveClassCharacterModelUrl`) now also holds for
props: an unresolved key degrades to the known-working placeholder, never
a broken reference.

## Judgment calls

- Reused an already-running backend stack in this shared sandbox rather
  than rebuilding Go/Redis/rpg-api/grpcwebproxy from source — the exact
  same binaries/versions the from-source recipe in
  `idle-anim-506-real-route-reverify.md` would have produced, just already
  standing. Did not restart or reconfigure any of those processes (they're
  shared with other concurrent sessions in this sandbox); only this PR's
  own `npm run dev` (a new port) and the Playwright driver are new
  processes.
- Used an existing, already-active character/lobby/encounter (Alice the
  Rogue) rather than creating a fresh character through the wizard
  (contrast with `idle-anim-506`'s two fresh wizard-created characters) —
  a deliberate simplification since this evidence's ask is "does the prop
  resolver render on the real route," not "does character creation still
  work"; #515's evidence used the same fixture-reuse shortcut for the
  same reason.
- `devPropDemoKeys` is real, shipped source (not deleted after capturing
  this evidence) — it is the "dev/demo path proving it renders" the
  charter explicitly asks wave 1 to deliver, kept behind an opt-in query
  param exactly like `syntyDungeon`, not a one-off evidence hack.
