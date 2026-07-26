# Fog-of-war contract log — evidence, not asks (rpg-dnd5e-web#605)

Produced by the fixture-first Fog of War concept (`/concepts` → Fog of War).
Same method and structure as `src/concepts/combat-pacing/CONTRACT.md`: this
file records what the concept needed, what the wire carries today, and where
those differ. It is **not** a pre-authored feature request. Nothing here
becomes a cross-repo ask until Kirk reviews the concept and confirms a
candidate is a real, scoped need.

Design: `rpg-project/ideas/fog-of-war/design.md`.

## 1. The wire has no state between "explored" and "gone" (the core gap)

`rpg-api-protos/dnd5e/api/v1alpha2/encounter/types.proto:184-195` documents
`Space` as running two different visibility models side by side, and says so
plainly:

- "hexes and walls are sticky (explored geometry persists per character across
  the campaign)"
- "entities are real-time LOS (server filters per player per event)"

Sticky geometry is drawn as though currently observed. There is no way to say
"the viewer knows this hex but is not looking at it right now", which is the
entire feature. This is a wire gap, not a rendering shortfall — the renderer
half already shipped in #602.

## 2. `GeometryRevealed` is additive only

`events.proto:109-114` carries `repeated Hex hexes` and `repeated Wall walls`
and can only add. It has no current-visibility semantics and no way to express
that previously-known geometry is now memory. The concept's
`HexKnowledgeChanged` replaced it rather than extending it.

## 3. Hexes carry no occupancy

`Hex` (`types.proto:146-151`) is `position`, `terrain`, `zone_id`. Where an
entity stands lives on the entity, not the hex. The concept needed the
opposite: a hex record whose `contents` is a complete statement of what is
there, because `contents: []` is what deletes a remembered occupant on
re-sight without a separate forget message.

Candidate: hex-scoped placement (`entity_id` + `facing`) resolved against a
separately-disclosed entity collection.

## 4. Nothing on the wire carries facing

The concept needs facing per _observation_, not per entity — two viewers who
saw the same skeleton face different ways must keep different memories. Facing
does not appear in `Hex`, `Wall`, or the entity messages.

Related, and possibly the same need from a different direction:
rpg-dnd5e-web#590 / `rpg-project/ideas/character-facing/`. Worth reconciling
before either is asked for separately.

## 5. `EntityDisappeared.last_known_position` is subsumed

`events.proto:121-130` carries a per-viewer `last_known_position` whose
comment says it exists so the client can render "freeze marker at last-seen
hex without client-side game-state tracking". A hex record _is_ the last-seen
position, so the concept needed neither the field nor the event. Flagging as
evidence that the wire was already reaching for per-hex memory.

## 6. `zone_id` vs `roomId` (minor, adapter-level)

`Hex.zone_id` is the wire's grouping concept; `AbsoluteFloorTile.roomId` is
the renderer's. The concept's adapter maps one to the other rather than
inventing a room list. Not obviously a gap — noting it because the mapping is
an assumption someone should confirm rather than inherit silently.

## 7. Two things that are already right — no ask

- **`Wall` is edge-native.** `Wall{from, to, kind, id}` with doors as a
  `DOOR_*` kind, not a separate list (`types.proto:152-163`). The concept
  attaches walls to hex records unchanged.
- **Per-viewer routing exists end to end.** `Broker.Subscribe(encID,
playerID)` delivers only events whose `Audience` contains that player, every
  toolkit event implements `Audience()`, and `TranslateEvent(evt, viewer,
now)` already translates per viewer for 22 event types. Fog of War is new
  event types flowing through machinery that is already built.

## 8. Not observed, flagged as untested

The concept runs one viewer. Multi-viewer isolation is asserted by the design
and by the existing `Audience` mechanism, but this concept does not prove it.
Whoever picks up the production work should not treat single-viewer success as
evidence of isolation.
