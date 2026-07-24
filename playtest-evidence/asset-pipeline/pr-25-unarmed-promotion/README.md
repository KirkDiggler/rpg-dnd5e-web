# Unarmed character promotion — staged-release evidence

Evidence for rpg-game-assets#25 (rpg-game-assets#24 / rpg-project#119): the four
approved unarmed idle/walk checkpoints promoted to staged runtime GLBs.

Rendered from the **staged** GLBs (nothing canonical was overwritten) with
three.js 0.181 — the version rpg-dnd5e-web ships — in headless Chromium.
Each character is posed at 35% through the clip and shot from four angles.

| File | Contents |
| --- | --- |
| `four-class-contact-sheet.png` | Overview: 4 classes x 2 clips x 4 angles |
| `fighter-idle-walk-multiangle.png` | Fighter, 380px cells for the anatomy pass |
| `barbarian-idle-walk-multiangle.png` | Barbarian, 380px cells |
| `monk-idle-walk-multiangle.png` | Monk, 380px cells |
| `rogue-idle-walk-multiangle.png` | Rogue, 380px cells |

Multi-angle per rpg-dnd5e-web#542's lesson: side-on-only strips hide facing,
arm, and ankle artifacts, and the animation QA harness gates temporal
continuity (seam/drift) only — never anatomical pose correctness.

Licensed `.glb`/`.fbx` never appear here; screenshots only.
