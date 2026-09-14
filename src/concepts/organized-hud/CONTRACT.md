# #1054 organized HUD concept contract

Lab: `?concept=organized-hud`. Walkthrough: `?concept=organized-hud&preview=1`.
Both are development-only Concepts Lab surfaces using real shared components.

## Accepted iteration — 2026-09-14

Kirk walked the concept and accepted this iteration for mobile and PC:

> we have a keeper for the mobile. i like this a lot better for pc than what we had as well. still room for improvement but I am ok with this iteration

Keep this arrangement rather than starting another polish pass:

- Translucent, gold-line overlays let the map remain visible behind controls.
- Location and the local player's unlabelled HP bar/numbers share the top-left area. No redundant player name beside HP.
- End Turn sits beside HP, in the spot previously occupied by Equipment.
- Initiative is width-bounded on the right, with arrows and horizontal scrolling rather than an ever-growing header.
- Actions and collections float at the bottom-left. Equipment sits on that menu row after Explore, right-aligned. A single-entry collection shows its action directly.
- Collapsed Log sits at the bottom-right; its old panel background does not remain expanded.
- PC uses the available frame; Landscape phone uses a bounded phone-sized frame with a smaller explicit shortcut set.

Visual acceptance belongs to Kirk's walkthrough. It is not a claim of live-game integration, touch-camera support, or merge readiness. Further visual-verification/polish loops were explicitly stopped in favor of collaborative iteration.

## Component boundaries

- `CombatExperience` remains the real production-owned scene shell, target surface, initiative, log, character projection, and action lifecycle gate.
- `actionPresentation.mode: 'organized-hud'` opts into this presentation. Omitting it retains the existing live dock.
- `ActionDock` retains reaction, death-save, cast-option and End Turn gates. Its optional End Turn DOM target changes placement through a portal, not authority or execution.
- `OrganizedActionSurface` orders, inspects, and opens current declarations. IDs are resolved against current props before selection. Details are outside clipped scrolling rows and do not arm an action. Secondary controls are composed into the collection row.
- The concept owns profile/scenario/frame selection, cancellation, and fixture-only intent receipts. No concept callback sends an RPC or claims successful rules execution. Equipment currently records a fixture intent; it is not a working inventory modal in this harness.

## Fixtures and provisional metadata

`fixtures.ts` supplies Caster and Martial layout profiles, not runtime class detection or legal character-build recommendations. The caster deliberately uses a mixed repertoire. Generated declaration facts stay separate from provisional `quickDeclarationIds` and `sectionByDeclarationId` display hints.

- Caster PC shortcuts: Move, Longsword, Vicious Mockery, Fire Bolt, Guidance. Phone shortcuts: Move and Vicious Mockery. Other actions remain discoverable in collections.
- Martial shortcuts: Move and Longsword. Second Wind is the single direct feature; general actions are in All actions.
- Full/spent scenarios explicitly author availability: spent spell slots disable Bane and Command, not the cantrip fixtures; the martial spent scenario disables Second Wind.
- Bane exercises generated candidates/cardinality and multi-target confirmation. Command exercises the existing options group. Spectator and stale-authority scenarios preserve the shared gates.
- Crowded initiative adds eight tracker-only participants to demonstrate scrolling. It does not create map actors or actions.

The installed `SpellRef` has only `ref` and `name`. The shared UI does not infer cantrip status, level, legality, or repeatability from names, refs, classes or costs. Live promotion still needs a deliberate source for shortcut/display hints; these fixture choices are not an automatically approved provider contract.

## Evidence and remaining work

The initial automated proof checked only document width and failed to select phone mode, missing a clipped dock and unusable targeting fixtures. Those findings and the correction remain recorded on PR #1057. Subsequent layout decisions came from Kirk's screenshots and direct walkthrough, with focused component/type checks during edits. Earlier full CI/review evidence must not be presented as covering later commits.

Two local hot-reload incidents served empty transformed CSS/TSX modules despite intact source files. Invalidating the affected file restored the exports/styles. Use atomic replacements for further source edits rather than exposing partially written files to Vite.

This is an accepted concept checkpoint, not promotion to `SessionEncounterView`. Further touch gestures, real-device Discord validation, live data wiring, and final PR publication gates remain separate work. Keep the isolated stack available for Kirk; do not automatically merge or deploy.

## Android pan increment — #1069

- Carries the accepted fullscreen/title and log-height corrections from local checkpoint `44bd2593`. Fullscreen is explicitly requested through Controls; log height follows the actual action row rather than covering it.
- This concept opts into `SessionCanvas.touchPanEnabled`. The shared camera hook defaults it to false, preserving live/default input behavior. Mouse right-drag and touch use the same screen-to-ground pan projection and manual-follow cancellation.
- One finger starts panning after 6 CSS pixels. The binding consumes the resulting canvas click, including out-and-back movement, distant release, capture loss, cancellation, blur and multi-touch interruption. A fresh tap is passed to the existing renderer; no synthetic selection is generated.
- Two fingers cancel this increment; there is no pinch, rotation or inertia yet. Touch policy is scoped to the canvas and restored on disposal. HUD touches retain their own handlers.
- The canvas is no longer disabled while aiming in this concept. Its own stacking context leaves target panels above it without raising the whole map above the HUD.
- Scoped gesture/camera/session tests and a native Chromium touch probe cover release-click safety, fresh taps and armed-state HUD cancellation. Kirk owns the actual Android feel walkthrough. No full visual matrix or new review loop is part of this increment.
