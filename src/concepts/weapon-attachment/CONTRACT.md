# Fighter Equipped Main-Hand Concept Contract

## Verdict

- 2026-08-26: Kirk walked <http://127.0.0.1:3011/?concept=weapon-attachment> and ruled: "looks really good."
- The attachment Concept passed: one shared fighter `Hand_R` socket worked in the live browser for unarmed, the provisional longsword candidate, and the provisional shortbow candidate.
- `SM_Prop_Bow_01` is accepted as the provisional `dnd5e:item:shortbow` Concept candidate and a strong first step.
- `SM_Wep_Slayer_01` attaches and follows the hand, but it is rejected as the final `dnd5e:item:longsword` semantic model because it is an oversized prior large-model sword.
- Bow finger curl is deferred to animation/hand posing; it is not treated as a rigid-attachment failure.

## Proven consumer contract

- The Concept consumes `CharacterData.equipped.main_hand` refs `dnd5e:item:longsword` and `dnd5e:item:shortbow`; missing `main_hand` remains honest `unarmed` behavior.
- The shared socket proven in browser is `Hand_R`, `boneUnitMeters: 0.01`, `positionMeters: [-0.11356871832209599, 0.0437807216160595, -0.0070717729664129085]`, `rotationQuaternion: [-0.31717459916354807, -0.45555976264236875, 0.6828311428133312, 0.47498148472569474]`, `scale: 1`.
- The browser contract uses the derived Three joint-local socket, not the direct Blender quaternion: `C = Rx(-π/2)`, `W_three = C × W_blender × C^-1`, `L_three = inverse(Hand_R_three at Idle_Relaxed t=0) × W_three`.
- Idle, walk, close, orbit, tactical, and all six facings were observed live; both attached candidates stayed bound to the fighter hand, and the converted shortbow orientation matched the approved Blender checkpoint.
- Focused tests continue to pin honest unarmed and unmapped-ref behavior; this Concept does not hide missing equipment behind fake fallback attachments.

## Provider findings

- `dnd5e:item:longsword` currently maps to `/models/synty/characters/weapons/fighter-weapon.glb` from `SM_Wep_Slayer_01`; attachment works, but the asset is rejected as the final longsword candidate.
- `dnd5e:item:shortbow` currently maps to `/models/synty/characters/weapons/bow-01.glb` from `SM_Prop_Bow_01`; the candidate is accepted provisionally for Concept evidence.
- Both current candidates miss the production texture budget: longsword `16 MB > 4.5 MB`, shortbow `64 MB > 4.5 MB`.
- Asset Build owns the next boundary: choose/export a fighter-scale longsword, normalize export/grip for both candidates, reduce texture cost, and decide whether hand-pose support belongs in animation rather than rigid socket data.

## Not requested from Platform

- Existing owner `CharacterData.equipped` is sufficient for the acting-player follow-up.
- No proto, API, toolkit, provider-manifest, or multiplayer transport change is created by this Concept.

## Production review extension (#832, 2026-08-27)

The historical verdict above remains the #821 provisional record. The first
production-backed extension proved fighter, barbarian, monk, and rogue against
unarmed plus the 12 outputs promoted by `rpg-game-assets#71`. The current live
Concept still imports the production exact-ref resolver instead of retaining a
second candidate map, and now exposes those four classes against unarmed plus
all 16 exact supported outputs from `rpg-game-assets#78 · 16-item provider
manifest`.

- Runtime URLs are `/models/synty/weapons/<id>.glb` for the exact supported
  `dnd5e:item:<id>` refs.
- Every current output is 4.0 MB decoded against the 4.5 MB provider budget.
- `townfolk-main-hand-v1` replaces the old provisional-fighter label; merged
  provider evidence proves the same sampled `Hand_R` matrices across all four
  current class rigs.
- The Concept remains a visual fixture matrix. The real session route owns the
  separate `CharacterData.equipped.main_hand` authority proof documented in
  `docs/evidence/832-authoritative-main-hand/`.
- Two-hand contact, finger posing, combat/bow animation, peer equipment, and
  weapons outside the current provider roster remain outside this contract.
