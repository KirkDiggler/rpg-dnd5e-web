# Dungeon intel concept contract

Related: KirkDiggler/rpg-project#509 (design), #508 (R&D).

## Boundary

The lab selects explicit observer snapshots and renders the same `SessionCanvas`, `buildScene3D`, atlas props/doors, and creature-sighting conversion as production. It has no world simulator, LOS/discovery computation, memory reducer, action legality, gameplay RPC or authoring-document read. Fixed geometry is supplied, not reconstructed by room membership. Mutable placement/status is supplied, not inferred from geometry or an event missing from a stream.

`ObservationMarkers` is shared presentation: green current / amber remembered labels and rings around the supplied prop/door meshes. It does not ghost the prop mesh or redefine creature memory rendering. Unknown prop location has no mesh; explicit positive empty-position evidence has a current marker. Shared camera `fitRequest` invokes Home's existing known-floor fit; omitted preserves production framing. The harness explicitly requests a fit on snapshot selection and offers a Fit button.

## Supplied answers and open contract questions

| Concern                               | Reused input                                                                  | Provisional / upstream gap                                                                                                                                                                                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Discovered fixed geometry and scenery | Generated `GetAtlasResponse`: cells, segments, doorways, regions, props       | The fixture supplies observer-scoped answers; ordinary discovery granularity, server persistence and transport updates remain open. Existing concealment projection is not proof of ordinary discovery.                                                                                                |
| Permitted appearance                  | Known fixed/holdable `AtlasProp.ref`, facing and offsets; real asset renderer | This proves ref-based permitted scenery, not arbitrary authored scene delivery, immutable content revisions or separate builder authorization. No `GetDungeon` bypass.                                                                                                                                 |
| Creatures                             | Generated `Sighting`, `currentVia`, `Seen`                                    | Existing sighting adapter and remembered renderer, not a new memory engine.                                                                                                                                                                                                                            |
| Holdable props                        | Generated `AtlasProp` for a supplied observed placement                       | `PropTestimony` name, observation and optional placement are fixture-only. No placement means location unknown, not nonexistence. Final envelope, footprint observation and clock/revision binding remain open.                                                                                        |
| Door values                           | Generated `DoorInfo` and supplied doorway geometry                            | `DoorTestimony.observation` is fixture-only; a remembered value is not a current `GetDoors` read. Doorway endpoints describe the visible threshold, not a discovered floor cell on its far side. How a permitted threshold is encoded without future interior disclosure remains an upstream question. |
| Observed empty former position        | Explicit fixture coordinate                                                   | Positive evidence is supplied, never inferred from lack of a prop/event. No carrier/destination is supplied. The final absence-correction contract remains open.                                                                                                                                       |

These fields discover consumer requirements; they do not ratify protobuf schemas. The inspector serializes generated messages with protobuf JSON and labels the separated provisional envelopes. It shows only the selected answer, not all fixture states.

## Storyboard acceptance

1. Start: both observers have only entrance floor, fixed bookcase and a closed ordinary door; no room-2 floor/region/scenery/holdable prop/sentinel/further-door data.
2. A looks inside: the supplied gallery geometry, fixed pillar, vase, sentinel and further door render. Obstructed B retains the remembered closed entry door and receives no gallery.
3. A withdraws: discovered construction remains; prop, creature and door observations become remembered.
4. B looks inside: B receives an independent current view; A's answer remains unchanged.
5. Unseen changes: B's supplied answer loses the vase placement and sees a closed entry; A's remembered vase and open entry remain unchanged.
6. A re-observes: the entry is reopened in the storyboard; positive empty evidence replaces the vase's old placement. The known vase has unknown location, with no carrier/destination. B observes the reopened entry as open too. No room-3 interior appears in any answer.

Controls are developer snapshot selectors, not movement/open/pickup game commands. Storyboard text may explain omniscient test setup; the observer account, scene inputs and inspector do not report an unseen pickup to A.

## Verification and limits

- Fixture/adapter tests cover construction channels, observer isolation, unchanged memory, location correction and backwards replacement without accumulation/mutation.
- Mounted concept tests double only `SessionCanvas`'s WebGL boundary; real scene-building and sighting adaptation run. Shared marker and camera tests exercise real R3F trees.
- `scripts/dungeon-intel-evidence.mjs` captures eight real browser scenes and records errors and RPC requests. Run with `CHROME_BINARY=/usr/bin/google-chrome` if Playwright's browser is not installed. The existing app shell may issue five named lobby/catalog reads; they remain in evidence. No dungeon/session RPC or mutation is permitted by this smoke check.
- Browser appearance needs locally synced game assets. Never commit licensed GLBs/source into this public repository.

The developer bundle includes later A/B fixtures. Initial selected renderer inputs omit room 2, but this is **not browser-bundle or authenticated server non-disclosure proof**. No live toolkit/API/proto changes, replay/reconnect, RAW sight/lighting, storage, performance budget, independent review or production promotion are proved by the concept alone. Independent review and the complete local gate remain PR prerequisites. Inward implementation needs upstream contracts and server evidence; no layer is silently absorbed by the web.
