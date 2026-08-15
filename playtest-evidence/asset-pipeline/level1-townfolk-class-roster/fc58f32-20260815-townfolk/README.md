# Level 1 Townfolk Class Roster Evidence

This public-safe evidence was rendered from the sealed stage at provider commit `fc58f32848056dd40ca6ee3b546ffefeeead5962`.

- Stage root label: `release`
- Stage file count: 2,257
- Stage tree SHA-256: `eb78d28f0209f2df37862c5ec4678bca05a9c04097fc3a89d393bc6faf65db37`
- Creative approval: **PASS** — Kirk, 2026-08-15, after downed evidence fix round 1: “they look great now”

## Public raster inventory

| Category | PNG count | Contents |
|---|---:|---|
| `animation/` | 40 | 32 full-loop strips, four fixed-ground contact sheets, and four fixed high-oblique sheets |
| `palettes/` | 5 | One 12-character A/B/C standing sheet and four per-class standing/downed comparisons |
| `downed/` | 1 | One 12-character static A/B/C downed sheet |
| `portraits/` | 1 | One 12-portrait A/B/C sheet with checkerboards that visibly represent transparency |
| `texture-resolution/` | 13 | Twelve matched 4096-source-versus-2048-runtime close-up sheets and one index |

Total: 60 PNG files. No optional GIF files are included.

## Methods

Full-loop strips use 28 loop samples followed by two wrap samples at fixed 0, 45, 90, and 180 degree views. Fixed-ground contact evidence derives the ground level from the minimum evaluated mesh vertex across the sampled walk union and holds orthographic front, side, and three-quarter cameras fixed. High-oblique evidence uses a fixed 55-degree elevation and 30-degree azimuth.

Static downed evidence uses the runtime orthographic camera (45-degree azimuth and 38.571428571-degree elevation) plus a low side-profile inset (90-degree azimuth and 8-degree elevation).

Texture-resolution pairs use a matched-camera method. Geometry, transforms, UVs, camera, lights, render dimensions, and color management remain fixed between each pinned 4096 source texture view and its embedded 2048 runtime texture view.

## Publication boundary

No GLB, FBX, Blend, atlas image, private JSON report, individual runtime portrait, or other runtime asset bytes were published. Only composed review rasters and public-safe Markdown, JSON, and checksum receipts are present.
