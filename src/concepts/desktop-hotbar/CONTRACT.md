# Desktop hotbar — concept #1225

Issue: https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1225

Open `?concept=desktop-hotbar&preview=1` in the development app, or select **Desktop Hotbar** in Concepts Lab. Expand **Controls** for Cleric/Martial, layout comparison, fixture scenarios and **Next event**. This is a local interactive concept, not a live-game change.

## Walkthrough

- The bar spans the frame with **24px side cushion**, a translucent dark backing and **36px buttons / 22px tinted glyphs**. End Turn remains explicit at the right. **Rows** selects 1–4 rows for the whole bar; the default is one.
- Each section pages independently when it has more offers than fit. Arrows and `1/2` indicators appear only when needed. Paging Spells does not page At hand. Wider windows or additional rows expose more offers; no action disappears from the section.
- Hover/focus inspects without executing. Click selects through the existing shared action path. Tooltips are opaque, above the entire bar, and scroll within the available viewport height.
- Click **Edit bar** before arranging. Drag within a section, or select an icon and use **Move first / Move earlier / Move later**. A favorite on a later page can move first. Action icons cannot execute while editing, including unavailable ones; existing armed selection is cancelled on entry. Cross-section/external/withdrawn drops are ignored. **Done editing** or Escape exits edit. Edits take effect immediately in this preview; Escape is not a discard operation. Artwork and colors are not player editable.
- Select **36 icons (layout only)** to test paging or extra rows. It adds 25 explicitly artificial samples to 11 normal offers, not a real expanded cleric repertoire.
- Select **Action spent**: Cure Wounds remains inspectable and cannot execute; Healing Word remains available in this explicit fixture. **Slots spent** disables limited-use spells, not the cantrip fixtures. Unavailable actions retain their ordering.
- Click Bane to exercise the shared multi-target surface; Command opens the shared Grovel/Flee option path. Cancel returns without an RPC.
- The log starts closed. Use **Controls → Next event** to play an authored sample notice: actor/action prominent, result beneath, six seconds on screen. Open **Log** afterward to read the same entry. Repeated clicks demonstrate a latest-three stack; every sample remains in history. This appends narration only, not map movement, HP changes or RPC execution.
- Open **Log → Debug**, expand **Fixture turn ended · inspect JSON**, then click/focus the JSON. The real log widens to 640px above the bar, captures pointer input and does not reflow its icons. Collapse it to reach covered actions. End Turn remains accessible. The fixture retains a real generated Event for JSON formatting, not a hard-coded JSON picture.
- Frames narrower than 1000px or no taller than 500px use the existing organizer and touch handling. The **Landscape phone** control exercises this fallback.

## State and authority boundaries

`DesktopActionSurface` is a shared opt-in presentation component. `OrganizedActionPresentation.desktopIcons` supplies art only; absent keeps the original organizer and shell. Membership/availability remain current generated declarations through the existing registry and organizer. Names, costs, targets, effects and refusals come from `buildActionTooltip`. Art and order hints cannot mint actions or change game facts. Missing/broken art falls back to lettering and its accessible full name.

`desktopHotbarLayout.ts` owns presentation-only ordering, row limits and page arithmetic. Unknown/duplicate order hints are ignored and newly offered members append. Section width is measured from the rendered grid; 36px icons and 4px gaps determine columns. Page count depends on columns and selected rows. Pages are independently clamped after resize/withdrawal; availability never changes capacity or sorting.

`desktopCustomization` optionally controls `{ rows, orderBySection }` with an onChange callback. The concept harness owns an in-memory row count shared across profiles and section order per profile. These survive scenarios, current-layout comparison, compact fallback and cast-options remounts. Page position and edit mode are transient. Reloading/leaving this concept resets preferences: no localStorage, RPC, durable user settings or provider contract exists.

Order keys are fixture-local declaration IDs. They are **not a proposed durable production identity** for signed live declarations. Saved player/character layouts need an explicit identity and persistence design before promotion.

`storyFeedback` is a separate explicit concept opt-in. `useStoryNotices` consumes the same released story rows as StoryLog after the existing dice/roll-window release gates. Mount, scope, re-enable and reconnection/live transitions baseline current history without replaying it. Later new IDs in live mode show for six seconds, latest three only; repeated IDs update active copy without restarting its timer, withdrawals remove notices, and unmount cleans timers. Scope-local seen IDs prevent history replay. Notices copy context/headline/detail verbatim, never infer actors or rules from text. They do not receive pointer input. While active, they replace the old damage/roll-toast markup in this experiment and own the polite live announcement; history remains available without duplicate automatic speech. Existing callers keep prior feedback and log defaults.

The concept's log starts closed on compact frames too, but the original compact action layout remains unchanged. HP/AC/movement still use the existing top display; the proposed Status section has not been implemented in this narration increment.

`ActionDock` retains reaction, spectator, cast-option, death-save and End Turn gates. `CombatExperience`, `TargetSurface`, `SessionCombatMap` and `StoryLog` remain shared. Only the icon opt-in adds the full-width shell attribute; open log/JSON width does not participate in its layout. Live callers and the existing compact/mobile presentation are unchanged.

Fixtures author costs, availability and targets explicitly; callbacks record intentions without rules execution. The cleric still uses the existing reference scene and character models, not a new model.

## Art and content limits

Five distinct INTERFACE archives were surveyed. The preview uses clean glyphs from `INTERFACE_Dark_Fantasy_HUD_SourceSprites_v3.zip` and CSS framing. Licensed sprites remain in ignored local `public/models/synty/interface-preview/`, named in `fixtures.ts`, with local provenance. No PNGs, archives or screenshots are tracked. Canonical asset promotion belongs in private rpg-game-assets after acceptance.

On a fresh checkout, copy the referenced clean PNG filenames from the archive to that ignored directory; lettering remains usable when images are absent. Reference-scene models must also be synced locally.

Dodge now uses the hood in **gold**, while the artificial Stealth sample uses the same silhouette in **blue**, following the operator's clarification. This tests an explicit art choice, not inferred mechanics. Players can rearrange actions, not choose their artwork. Full counts and semantic coverage limits: [ICON-AUDIT.md](ICON-AUDIT.md).

The session declaration seam does not supply full spell descriptions or weapon damage dice. Tooltips do not invent them. Catalog-backed descriptions, durable player settings, filters, cross-section moves, freely assigned empty slots and a redesigned status display are not claimed here.

## Verification

Checked task contracts and coverage: [PLAN.md](PLAN.md), iterations 3–4.

- `npm run typecheck` and changed-file ESLint/Prettier passed.
- 129 focused layout/surface/concept/organizer/log/shell tests passed, including notice expiry/history retention, StrictMode cleanup, burst/deduplication, recovery baseline and the shared roll-window release gate.
- Native Chrome/Playwright `story-notices.mjs`: sample actor/action/result appears then expires while retained in Log; no initial replay; latest-three burst with all8 story rows retained; pointer hit testing passes through notices; re-entering desktop mode does not replay history. Side insets measured25px including frame border at1000/1280/1600, backing gradient alpha0.76–0.84, text opacity1, tooltip opaque. Screenshots inspected.
- Updated Chrome/Playwright `paging.mjs` regression passed with cushion and initially collapsed log. It waits for the actual post-reorder reveal and compact transition, rather than assuming synchronous effects/fixed delays under SwiftShader.
- Native Chrome/Playwright `paging.mjs`: cushioned full-width bar at 1280×720 and 1600×900, 36px icons, default one-row height113px; all36 offers reachable through independent pages, all36 visible at four rows; native drag and moving a later-page favorite first execute no actions; order retained across scenario/comparison/compact changes.
- Actual formatted event JSON widened to640px; icon rectangles unchanged, log wins hit testing over an underlying icon, coordinate click does not dispatch, End Turn stays accessible.
- The additional `verify.mjs` hover/refusal/bonus-action/Command/keyboard/mobile regression passed using Chrome's SwiftShader renderer. Default-renderer runs stalled during repeated viewport transitions; a fixed500ms mobile wait also proved brittle and was replaced with waiting for actual desktop-surface detachment. A minimal native-renderer spent-action probe passed. These are recorded harness observations, not a diagnosed application defect.
- 844×390 / 393×852 retain the original organizer with no document overflow. 1000×501 with four rows plus Edit keeps inspection within the frame; 1000×500 returns to compact layout. Screenshots read after rendering. This is browser evidence, not Android/Discord touch acceptance.
- Evidence is local/ignored: `evidence/desktop-hotbar/story-notices.mjs`, `story-notices.json`, actor-action/retained-history/stack screenshots; `paging.mjs`, `paging.json`, full-width/four-rows/edit/JSON/compact screenshots. No browser page errors in the walk. Earlier `density.mjs` assumes the superseded always-visible layout and is not the current acceptance script.

Earlier setup correction: root node_modules was stale; the isolated lockfile install restored dependencies without changing pins but left Husky's generated shim absent. `npm run prepare` restored it and `lint-staged --diff` checked the first commit; later commits run the installed pre-commit hook normally. The original evidence remains in git and the issue trail.

The operator approved the design direction, not live promotion. Revised walkthrough, full PR-boundary CI and independent review remain outstanding. No merge-ready claim.
