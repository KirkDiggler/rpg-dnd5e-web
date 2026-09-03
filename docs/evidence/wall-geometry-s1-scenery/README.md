# Scenery brush — slice 1 evidence

Wall geometry slice 1 (rpg-project#360, design §2.1–2.5): scenery is
floor nobody stands on. Captured against this branch through a headless
browser driving the Concepts Lab builder on a dev server, not by hand.

## 01 — the 2D board

`01-board-hatched-strip.png`

The reference tomb with a seven-cell scenery strip painted along the
entrance room's south edge. Scenery draws as hatched stone: visibly
floor, visibly not a room, visibly not the void past it. The floor
envelope runs around the strip rather than drawing a cliff at the
room/scenery seam, because the floor does not stop there. "Scenery" sits
between Room and Erase in the palette. The summary line reads 231 floor
cells — 224 owned plus the 7 in the strip.

The document the builder wrote:

```yaml
scenery:
      - [[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,8]]
start: [1, 3]
```

`scenery` after `regions` and before `start`, rows of `[col,row]`, exactly
as a region's cells are written.

## 02 — the 3D preview

`02-3d-preview-plain-floor.png`

The same document in the 3D tab. Scenery tiles as plain floor with **no
client change**: the atlas carries every floor cell in `cells`, and a cell
in `cells` and in no region is scenery (design §5.1).

Shot in fixtures mode, where `fixtureAtlasOf` stands in for the server's
compile. Against the real server this waits for the rpg-api pin — until
the toolkit slice lands, `PutDungeon validate_only` refuses a document
carrying `scenery` as an unknown key. The builder sends it anyway and
shows the refusal; `DungeonBuilder.test.tsx` pins that.

## Known, out of scope, filed

The 3D preview shows a `Legacy lighting: unowned-floor-cells` banner.
`src/rendering/dungeonLighting.ts` falls back to legacy lighting whenever
any floor cell has no owning region, a guard written when that was
impossible. Scenery makes it possible, so one scenery cell drops the whole
dungeon out of per-region lighting. The fix is in the rendering layer,
outside this slice's `src/author/` scope.

## Reproducing

The worktree has no synced Synty assets, so the 3D tab renders black until
`npm run assets:sync` has run. Do not symlink them from another checkout:
the asset-boundary tests under `scripts/` fail on the symlink.
