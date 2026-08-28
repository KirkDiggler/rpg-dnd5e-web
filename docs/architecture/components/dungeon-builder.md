---
name: dungeon builder
description: the /author route — a dungeonspec version-2 editor whose preview is the game's own atlas renderer
---

# Dungeon Builder (`src/author/`)

The `/author` AppView (rpg-project#256 under journey #169; design and plan in
`rpg-project/ideas/dungeon-builder/`). One rule shapes the module: **the YAML
is the artifact, the canvas is a view of it, and the atlas is the proof.**

## Shape

| Piece                        | Role                                                                                                                                                                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dungeonYaml.ts`             | The `DungeonDoc` model (dungeonspec **version 2**: `regions[].cells`, `walls`, `doors`, absolute `place`, `archetype`, `lighting.intensity`), strict parser, deterministic emitter (cells sorted, one row per line), pure mutators, and `resolveErrorPath`. |
| `hexOffset.ts`               | The ONE `[col,row]` ↔ axial bridge: odd-r for `pointy`, odd-q for `flat` — the toolkit's `HexCellAt` schemes. Pinned by a pixel-formula test per orientation (not a round-trip; see `symmetric-bugs-hide-from-roundtrips`).                                 |
| `creation/CreationBoard.tsx` | The SVG canvas, in axial, drawn under the authored orientation via `concepts/session-tomb/atlas.ts`'s hex geometry. Tools: region brush, erase, wall, door, start, place, select.                                                                           |
| `authoringRpc.ts`            | `usePutDungeonPreview` (debounced `PutDungeon{validate_only}` → `errors[]` + atlas) and `useSaveDungeon`.                                                                                                                                                   |
| `preview3d/`                 | `previewScene` = `resolveSceneLayout` + `buildScene3D` (the session route's own path); `DungeonPreview3D` draws it with `SyntyHexFloor`, `AtlasWalls`, `PropModel`, `HexEntity`. No builder-side geometry.                                                  |
| `DungeonBuilder.tsx`         | Composition root: top-bar verbs (New/Open/Save/Save & Play), palette, canvas or preview, inspector, YAML pane.                                                                                                                                              |
| `AuthorView.tsx`             | The live mount; owns Save & Play (create lobby → ready → `StartEncounter{dungeon_key}` → game route).                                                                                                                                                       |
| `useAuthoringGate.ts`        | Home-button gate: `GetDungeon("reference-tomb")` succeeds ⇒ authoring is on.                                                                                                                                                                                |
| `fixtures/`                  | `referenceTombDoc()` and `fixtureAtlasOf(doc)` for tests and the Concepts Lab mount (`DungeonBuilderSandbox`).                                                                                                                                              |

## Invariants

- Nothing outside `parseDungeon`/`emitDungeon` holds a `[col,row]`.
- `emitDungeon(parseDungeon(emitDungeon(doc))) === emitDungeon(doc)` — the server stores bytes verbatim, so what the pane shows is what `GetDungeon` returns.
- Validation is the server's. The builder only refuses what it cannot represent (version 1, unknown keys). `FieldError.path` is resolved against `emittedLayout(doc)` — the same order the emitter wrote — so `regions[1].cells[0][3]` highlights the cell the file put there.
- The 3D preview and the game gate on layout through one function (`resolveSceneLayout`) and build through one function (`buildScene3D(atlas, HEX_SIZE, layout)`). `hexMath.ts` is pointy-top only (web#763), so both report flat-top by name rather than drawing it.

## Other mounts

- Concepts Lab `?concept=dungeon-builder`: fixtures mode (`fixtureAtlas`), never calls the server.
- Toolkit-contributor sandbox: `authoringClient` injected, fixed version-2 document, no New/Open/file IO.
