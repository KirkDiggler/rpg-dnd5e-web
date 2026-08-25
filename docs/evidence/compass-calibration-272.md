# Compass calibration — eight facings measured (rpg-project#272)

The #261 lesson stands: yaw is measured against rendered output, never
inferred. The vocabulary changed (one eight-name true-compass set, both
orientations), so the eight names were re-measured on 2026-08-25 against
`dnd5e:props:statue-reaper` — the same asymmetric prop the original
`FACING_YAW_OFFSET` measurement used (folded hands + hood read as its
front; wings/scythe read as its back).

## The fixture

A pointy-top 11×11 floor with eight statues in a compass ring around
[5,5], each authored to face its own ring position — so a correct table
reads as every statue facing radially OUTWARD, and any wrong entry
breaks the symmetry visibly. Loaded through the Concepts Lab's
fixture-mode builder (no server), by temporarily pointing
`DungeonBuilderSandbox` at this document:

```yaml
place:
  - { ref: "dnd5e:props:statue-reaper", at: [5,2], blocks_movement: true, blocks_los: true, facing: n }
  - { ref: "dnd5e:props:statue-reaper", at: [7,3], blocks_movement: true, blocks_los: true, facing: ne }
  - { ref: "dnd5e:props:statue-reaper", at: [8,5], blocks_movement: true, blocks_los: true, facing: e }
  - { ref: "dnd5e:props:statue-reaper", at: [7,7], blocks_movement: true, blocks_los: true, facing: se }
  - { ref: "dnd5e:props:statue-reaper", at: [5,8], blocks_movement: true, blocks_los: true, facing: s }
  - { ref: "dnd5e:props:statue-reaper", at: [3,7], blocks_movement: true, blocks_los: true, facing: sw }
  - { ref: "dnd5e:props:statue-reaper", at: [2,5], blocks_movement: true, blocks_los: true, facing: w }
  - { ref: "dnd5e:props:statue-reaper", at: [3,3], blocks_movement: true, blocks_los: true, facing: nw }
```

(plus three wall edges on row 0, used below as an axis anchor.)

## The 2D measurement — `compass-calibration-2d-ticks.png`

The canvas is the clean instrument: screen north IS document north
there. All eight facing ticks point radially outward at exact 45°
steps — `n` straight up, `e` right, `s` straight down, `w` left, the
four diagonals at true 45° (NOT the 30°/60° hex-edge angles the #261
vocabulary would have drawn). This is `facingAngleDeg`'s geometry half
measured directly.

## The 3D confirmation — `compass-calibration-3d-ring.png`

The preview camera looks from the map's south side. Axis anchor: the
green start hex is [0,0] (top corner) and the three authored row-0 wall
panels sit on the upper-right edge, so +col (east) runs down-right and
+row (south) runs down-left. Reading the ring: the north-side statues
(n/ne/nw positions) show their BACKS — wings and scythe — to the
camera, and the south-side statues show their FRONTS (hood + folded
hands), i.e. every statue faces outward from the ring center. That is
`facingToYaw` (geometry + the carried-over measured
`FACING_YAW_OFFSET`) confirmed against rendered models at all eight
names.
