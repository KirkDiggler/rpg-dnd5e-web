# Desktop hotbar — concept #1225

Issue: https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1225

Open the development app at `?concept=desktop-hotbar&preview=1`, or select **Desktop Hotbar** in Concepts Lab. Expand **Controls** to compare **Icon hotbar** with **Current layout** on identical fixtures, switch Cleric/Martial, or exercise spent/stale/spectator states.

## Walkthrough

- Hover or keyboard-focus Bane, Bless, Command, Cure Wounds and Healing Word without opening any collection. Inspection does not select or dispatch.
- Click Bane to open the shared multi-target surface; Cancel action resets selection.
- Click Command, then Grovel/Flee to exercise the shared cast-option path.
- Select **Action spent** and inspect Cure Wounds: its refusal remains visible and it cannot select. Healing Word stays available in this explicit fixture.
- Select **Slots spent**: limited-use spells remain in place, unavailable. Cantrips remain available in this fixture.
- Open/close the existing log while browsing. The opaque inspection card remains above the hotbar, outside wrapping groups. Its contents are scrollable and keyboard-focusable; Escape dismisses it.
- Shrink the actual preview frame below 1000px wide or to 500px high or less. The existing organizer, collections and touch handling return. The **Landscape phone** control exercises that same fallback.

## Boundaries

`DesktopActionSurface` is a shared, explicitly opt-in presentation component. `OrganizedActionPresentation.desktopIcons` supplies artwork hints only; absence preserves the original organizer. Membership and availability come from current generated declarations, selected by the existing registry/organizer. Names, costs, targets, effects and refusals come from `buildActionTooltip`; artwork cannot create offers or change game facts. Missing artwork falls back to lettering plus the full accessible name.

`OrganizedHudConcept` owns fixture state and frame measurement. The new concept parameterizes that existing harness rather than duplicating its controller. `ActionDock` retains reaction, spectator, cast-option, death-save and End Turn gates. `CombatExperience`, `TargetSurface`, `SessionCombatMap` and the existing log remain shared. No live caller supplies the icon opt-in. Current production desktop and mobile layouts are not modified by this experiment.

Cleric-style and martial fixtures are layout samples, not legal build recommendations or live character snapshots. Availability, targets and resource costs are authored fixture states. Callbacks record fixture intentions only; no RPC or rules execution occurs. The cleric uses the existing reference scene and character models, not a new cleric model.

## Art and content limits

All five distinct INTERFACE archives in Downloads were surveyed. This iteration samples clean glyphs from `INTERFACE_Dark_Fantasy_HUD_SourceSprites_v3.zip`; frames are CSS, not copied Synty artwork. The selected sprites are locally staged under ignored `public/models/synty/interface-preview/`, named by `fixtures.ts`. A local `provenance.txt` accompanies them. No licensed bytes or screenshots are tracked. This is not canonical asset promotion; that belongs in private rpg-game-assets if the concept is accepted.

On a fresh checkout, copy the referenced `ICON_DarkFantasy_*_Clean.png` files from that archive to the ignored directory. The component remains usable with lettering if those local files are absent. Existing reference-scene models must also be locally synced for the 3D scene.

The inspected session declaration seam does not carry full spell descriptions or weapon damage dice. The tooltip renders the facts it has; it does not invent those mechanics. Adding catalog-backed descriptions is not claimed by this layout prototype. Wider repertoire paging/filtering and a redesigned status/log layout are also not part of this first slice.

## Verification

Checked task contracts and requirement/seam coverage: [PLAN.md](PLAN.md).

- `npm run typecheck` — passed with dependencies installed from the existing lockfile.
- Focused new surface/concept and existing organizer/concept tests — 38 passed.
- Changed-file ESLint and Prettier — passed.
- Native Chrome/Playwright: 1600×900 and 1280×720, all five spell icons visible before clicks; hover dispatches nothing; icon bounds unchanged; tooltip opaque and above bar/in viewport; refused click blocked; available bonus action selects; Command options and keyboard focus/Escape/Enter exercised.
- 844×390 and 393×852: original organizer restored, spell collection visible, no document overflow. Screenshots inspected after rendering. This is responsive browser evidence, not an Android/Discord touch walkthrough.
- Local evidence: ignored `evidence/desktop-hotbar/verification.json`, `verify.mjs`, and screenshots. No browser page errors during the walkthrough.

Initial dependency reuse found the root checkout's node_modules out of sync with its tracked lockfile; `npm ci --ignore-scripts` in this isolated worktree restored the declared versions without changing dependency files. That also left this new worktree without Husky's generated hook shim, so the first commit did not execute pre-commit. `npm run prepare` restored the shim; `npx lint-staged --diff HEAD^..HEAD` then checked the entire first commit's changed files, and the documentation follow-up runs the installed hook normally.

Operator visual acceptance, full PR-boundary CI, independent review and live promotion remain outstanding. The running preview is for collaborative iteration, not a merge-ready claim.
