# web#821 fighter weapon attachment evidence

## Observed verdict

- Web commit before evidence: `88c72d2`.
- Provider checkout: `/home/kirk/game-dev/rpg-game-assets` at `6c24b19861df127faa69bd4d1ab6ec8fdfad537e`.
- Synced consumer artifacts: `public/models/synty/characters/fighter.glb`, `public/models/synty/characters/weapons/fighter-weapon.glb`, `public/models/synty/characters/weapons/bow-01.glb`.
- Blender checkpoint basis: Blender `5.0.1`, add-on `1.5`, protocol `4`.
- Live Concepts URL: <http://127.0.0.1:3011/?concept=weapon-attachment>.
- Kirk’s 2026-08-26 live verdict: "looks really good."

## Camera and basis findings

- Evidence was recorded after the reviewed framing/socket fixes already landed at `88c72d2`: close camera `position [-1.2, 1.22, 0.85]`, target `[-0.6, 1.02, -0.025]`; orbit camera `position [2.4, 1.8, 3.1]`, target `[0, 0.7, 0]`; tactical camera stayed on the shared gameplay rig.
- The browser uses the derived Three socket, not the raw Blender quaternion. Proven conversion: `C = Rx(-π/2)`, `W_three = C × W_blender × C^-1`, `L_three = inverse(Hand_R_three at Idle_Relaxed t=0) × W_three`.
- The resulting live socket was `Hand_R`, `boneUnitMeters 0.01`, `pos [-0.113569, 0.043781, -0.007072]`, `quat [-0.317175, -0.455560, 0.682831, 0.474981]`, `scale 1`.
- The direct Blender quaternion was rejected after browser proof; the converted shortbow orientation matched the approved Blender checkpoint instead.

## Attachment status and candidate rulings

- Unarmed fixture: `attachment-status = unarmed`.
- Longsword fixture: `attachment-status = attached`; `SM_Wep_Slayer_01` follows the hand but is rejected as an oversized prior large-model sword.
- Shortbow fixture: `attachment-status = attached`; `SM_Prop_Bow_01` is accepted as the provisional Concept shortbow / strong first step.
- One shared `Hand_R` socket worked for both attached candidates across idle, walk, close, orbit, tactical, and all six facings.
- Bow finger curl is deferred to animation/hand posing, not to socket math.

## Texture warnings

- Longsword candidate: `16 MB > 4.5 MB production budget`.
- Shortbow candidate: `64 MB > 4.5 MB production budget`.

## Screenshot index

| File | Kirk viewed | Attachment status | Verdict |
| --- | --- | --- | --- |
| `01-unarmed-tactical.png` | unarmed, idle, tactical, facing E | `unarmed` | shared fighter baseline is honest; no weapon rendered |
| `02-longsword-hand-idle.png` | longsword, idle, hand close-up, facing E | `attached` | sword socket works, but candidate is oversized and rejected |
| `03-longsword-orbit-walk.png` | longsword, walk, orbit, facing E | `attached` | sword follows motion/orbit; rejection is asset choice, not attachment failure |
| `04-shortbow-hand-idle.png` | shortbow, idle, hand close-up, facing E | `attached` | bow candidate is a good first-step attachment fit |
| `05-shortbow-orbit-walk.png` | shortbow, walk, orbit, facing E | `attached` | bow stays aligned through motion and full-body orbit |
| `06-shortbow-tactical-walk.png` | shortbow, walk, tactical, facing E | `attached` | shared gameplay camera remains judgeable with the provisional bow |
| `07-facing-0-longsword-orbit-idle.png` | longsword, idle, orbit, facing E | `attached` | no facing-specific detach |
| `08-facing-1-longsword-orbit-idle.png` | longsword, idle, orbit, facing NE | `attached` | no facing-specific detach |
| `09-facing-2-longsword-orbit-idle.png` | longsword, idle, orbit, facing NW | `attached` | no facing-specific detach |
| `10-facing-3-longsword-orbit-idle.png` | longsword, idle, orbit, facing W | `attached` | no facing-specific detach |
| `11-facing-4-longsword-orbit-idle.png` | longsword, idle, orbit, facing SW | `attached` | no facing-specific detach |
| `12-facing-5-longsword-orbit-idle.png` | longsword, idle, orbit, facing SE | `attached` | no facing-specific detach |
| `13-verdict-inspector.png` | one live page walked through all equipment/motion/view/facing controls, coverage `3/3 · 2/2 · 3/3 · 6/6`, then the real verdict button was unlocked and pressed | `attached` on final shortbow state | JSON recorded the exact socket, both candidates, and full coverage |

## Evidence capture notes

- `tools/browser/screenshot.mjs` could not launch its missing browser revision in this workspace, so captures used `/usr/bin/google-chrome` through Playwright from `/home/kirk/game-dev/tools/browser/node_modules/playwright` via `/tmp/weapon-attachment-evidence.cjs`.
- The full-page verdict screenshot and `/tmp/weapon-attachment-verdict.json` were produced from the same walked browser page; the recorded JSON shows both candidate refs and coverage over `unarmed`, `longsword`, `shortbow`, `idle`, `walk`, `close`, `orbit`, `play`, and facings `0-5`.

## Deferred scope

- final fighter-scale longsword selection/export in `rpg-game-assets`
- normalized production exports and grip cleanup for both candidates
- texture reduction below the `4.5 MB` budget for both candidates
- bow finger curl / hand posing / animation follow-up
- production equipment wiring, multiplayer propagation, off-hand support, monsters, and combat-animation semantics beyond this Concept
