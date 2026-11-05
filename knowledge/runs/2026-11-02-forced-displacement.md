# Forced displacement presentation

processed: 2026-11-05T201556Z

## Shipped

- Frontend implementation checkpoint, not merged or live-API verified: [web#1377](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1377), part of [project#800](https://github.com/KirkDiggler/rpg-project/issues/800). Code commits `d08fb2fe` and `ca1ee6de`; existing previews and pending six-idle wave unchanged.

## Decided

- Consume released SDKv0.1.252 `WalkAct.forced`; true bypasses decorative readiness, false/absent walks. Keep the cursor, movement owner and native mixer; no cause/spell inference. Operator authorized frontend construction while providing a later API port for testing: [brief and checked plan](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1377#issuecomment-6587503990).
- Use the visual comparison's nominal180ms displacement as presentation tuning, following all supplied path legs and preserving ordinary walking. Live presentation feel and two-observer acceptance remain pending the supplied API: [backend dependency](https://github.com/KirkDiggler/rpg-project/issues/821).

## Found

- Voluntary local movement is filtered out of the stream presentation because its route arrives via Move RPC. Forced local movement has no such RPC and must pass that filter. Generated-act tests prove both local and other members reach the movement owner: [slice](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1377).
- Native browser fixture uses the production cursor/bridge/controller/HexEntity and published private model/library, with generated typed acts replacing only the backend. Entry/sustain/exit interruption all passed; native mixer held while the body moved, old cue/Walk did not resume, configured folded default returned. No page/binding errors; screenshots inspected. Evidence is local at `/tmp/forced-displacement-native/`; fixture at `tools/browser/_job_forced-displacement.local/`, served on3051. This is not live multiplayer evidence: [slice](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1377).

## Mistaken

- An initial fade starts with zero clip weight. Freezing a newly loaded body at that point preserves bind pose, not a standing pose. Red tests reproduced it for profiled and unprofiled bodies; first displaced evaluation now uses full weight before holding. Existing bodies still hold their exact current pose: [fix ca1ee6de](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/ca1ee6de).
