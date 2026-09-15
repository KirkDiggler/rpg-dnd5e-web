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
- `actionPresentation.mode: 'organized-hud'` opts into this presentation. Omitting it retains the legacy dock for other callers.
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

This concept checkpoint was not itself promotion to `SessionEncounterView`. The accepted touch controls followed in #1069/#1071. Kirk released the isolated concept stack after merge; the next integration is tracked by #1076 below. Do not automatically merge or deploy.

## Android touch-camera increments — #1069

Kirk accepted the complete touch-camera iteration after the Android walkthrough:
pan “feels pretty good,” pinch “very fluid,” shoulder transition “looks great,”
and twist/Center “no it feels great.” Keep these settings; no further feel tuning
is part of this slice. This is concept acceptance, not live-game promotion.

- Carries the accepted fullscreen/title and log-height corrections from local checkpoint `44bd2593`. Fullscreen is explicitly requested through Controls; log height follows the actual action row rather than covering it.
- This concept opts into `SessionCanvas.touchPanEnabled`. The shared camera hook defaults it to false, preserving input behavior for callers that do not opt in. Mouse right-drag and touch use the same screen-to-ground pan projection and manual-follow cancellation.
- One finger starts panning after 6 CSS pixels. The binding consumes the resulting canvas click, including out-and-back movement, distant release, capture loss, cancellation, blur and multi-touch interruption. A fresh tap is passed to the existing renderer; no synthetic selection is generated.
- Kirk accepted the first pan checkpoint (`d2a6f463`): “feels pretty good.” That checkpoint cancelled two-finger gestures; the subsequently approved pinch increment extends it below. Touch policy remains canvas-scoped and is restored on disposal. HUD touches retain their own handlers.
- The concept also opts into `SessionCanvas.touchPinchEnabled`. Two canvas-origin fingers zoom continuously within the current camera limits (default 35–140), anchoring the ground from the previous midpoint to the new one. The PC wheel deliberately resumes its band controls from the nearest current zoom.
- The first pinch checkpoint (`6514161f`) held the angle fixed. Kirk accepted its fluid feel, then requested over-the-shoulder at closer zooms. Touch now holds the authored tactical pose below its threshold, smoothly blends pitch and focus lead between tactical and shoulder (default zoom 80–110), and holds shoulder at closer zooms. `cameraDials` owns this interpretation of its bands; ground anchoring covers the combined zoom and pose change. The fixed-angle `pitchCurve=0` escape remains fixed.
- Pinch can return to a claimed one-finger pan without a jump. A HUD-origin contact, third finger, cancellation or lost capture blocks the gesture until release. Nearly coincident contacts rebase rather than divide by zero. No release generates a selection; a fresh tap still reaches the renderer.
- After accepting the shoulder transition (`c3eb5c01`), Kirk approved deliberate twist and Center on me. `touchRotateEnabled` adds an 8-degree continuous angular dead zone to the two-finger transform: small pinch jitter does not rotate, crossing the threshold does not jump, and returning to the start unwinds the rotation. Heading changes share the pinch midpoint anchor. Third-finger/cancellation rules remain unchanged.
- Center on me sends a `focusRequest` counter change to the same camera focus path as F; it preserves zoom and heading and does not cancel an armed selection. Its optional `onCenterView` UI callback travels through the secondary-control slot, remaining available outside the viewer's turn and under stale action authority. During the roll-settling gate, Center remains available without exposing the withheld game actions.
- Follow policy after touch zoom uses the **nearest current authored band** when the followed mini actually moves: wide bands stay parked, close bands follow. This is distinct from the smooth pose interpolation. Each pinch invalidates the old band resolution; it still cancels any currently pending follow during the manual gesture. GLM's initial #1071 review found that retaining the pre-pinch band violated this in both directions; regression tests now separate anchor translation from subsequent follow.
- Before live promotion, check fullscreen availability/permissions and touch handling inside Discord's embedded Android WebView. The accepted Chrome/Wi-Fi walkthrough does not cover that environment.
- Pinch/twist are orthographic-only in this increment. Perspective mode retains the earlier second-finger cancellation policy. Inertia is not implemented.
- The canvas is no longer disabled while aiming in this concept. Its own stacking context leaves target panels above it without raising the whole map above the HUD.
- Scoped gesture/camera/session tests and a native Chromium touch probe cover release-click safety, fresh taps and armed-state HUD cancellation. Kirk owns the actual Android feel walkthrough. No full visual matrix or new review loop was part of that feel increment; Kirk subsequently requested the GLM review on #1071.

## Live integration checkpoint — #1076

`SessionEncounterView` now opts into the shared organizer and all three touch controls. Its existing real action/target/equipment callbacks remain the execution paths. Center increments the camera focus request without cancelling selection. The live frame supplies the named size container used by the phone layout; navigation and operation feedback have shell-owned slots so the former Back overlay does not cover the location/HP header.

The first live draft pinned only provider-declared Attack, Move, and Death Save verbs. That was too conservative: it hid common bard actions behind menus despite already-fetched owner facts being available. Kirk's first live walk corrected the policy: **cantrips and owned feature offers stay directly visible on both PC and mobile; only known leveled spells and non-feature abilities belong in collections.**

`liveActionPresentation` now joins current declarations to the existing owner's `knownCantrips` / `knownSpells` and `CharacterData.features[].ref`. This is exact reference identity, not inference from a name, class, ref spelling or cost. Unknown spells remain visible rather than being assumed leveled; missing private feature metadata keeps activations visible until classified. The projection never invents an offer, changes availability, or retains an old signed declaration ID. No new API calls or provider changes were needed.

The observed Staniel response carried Vicious Mockery and Thunderclap in `knownCantrips`, Bane in `knownSpells`, and an unavailable Bardic Inspiration offer with the reason “no ally within reach.” The UI must show that disabled common action and its reason, not make it disappear. The desktop row now uses larger controls/text; phone spacing remains compact without removing those common actions.

Cancel also overlapped the last quick action's Details control: it had been absolutely positioned over the row. It now participates in the quick row's normal wrapping layout. A targeted browser overlap probe failed before the change and passed afterward at 1440×900 and 844×390.

Two integration findings are corrected rather than hidden by the fixture: organized offers now expose their selected state, and Equipment remains accessible in every clock/roll state as it was in the legacy shell (including settling, without exposing withheld game actions). Live adapter tests exercise current declaration IDs through actual controller dispatch, center while armed, and the real equipment surface.

This is a working integration checkpoint, not completed live validation. Kirk's real encounter walkthrough, Discord embedded touch/fullscreen checks, and independent review are pending. The fullscreen toggle still lives in the concept controls; promoting that utility is not claimed by this first wiring increment.
