# Desktop hotbar concept plan

## Goal, authority and constraints

Authority: https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1225. Approved in conversation by KirkDiggler: browse spells without opening a collection, hover/focus to inspect, click to select; readable opaque inspection above the bar; unavailable offers remain inspectable; existing mobile presentation and live route unchanged. Scope is a fixture-only Concepts Lab experiment, not promotion. Reuse the real CombatExperience/ActionDock gates, generated declarations and targeting. No rule calculations, RPCs, new provider dependencies, persistence or events. Licensed sprites remain ignored local runtime assets, never tracked.

Baseline: rpg-dnd5e-web dev `7d4bcb1e9f9cc5be46504f7ddd62c034d55b40d6`. Inspected OrganizedActionSurface, organizeDeclarations/currentExecutableDeclaration, ActionDock, CombatExperienceActionPresentation, OrganizedHudConcept, its fixtures/tests, ConceptsView, organizedHud.css and CombatExperience.module.css. Existing inspection uses rgba(7,13,15,.62) and overlays an open tray. Existing actionTooltip projects costs/targets/effects/refusal but the cast reference does not supply full spell rules text. This prototype does not fabricate missing spell descriptions.

## Sequence

Task 1 -> Task 2 -> Task 3. Web only, no release/repin dependency. No live promotion, automatic merge or independent-review claim. Operator walkthrough precedes any promotion. Full CI is required at the PR boundary; focused checks and browser proof are required for this local preview.

## Task 1: Opt-in shared icon surface

**Delivers:** R1 direct browsing, R2 inspection, R3 availability/identity safety.
**Owner:** web combat-experience presentation.
**Prerequisites:** existing generated Declaration fields and organizer/executable lookup.
**Files:** new `src/components/session/combat-experience/DesktopActionSurface.tsx`, `DesktopActionSurface.module.css`, `DesktopActionSurface.test.tsx`; modify `organizedActionPresentation.ts` and `OrganizedActionSurface.tsx`.
**Interfaces:** optional `desktopIcons` map on OrganizedActionPresentation, keyed by declaration id, values `{src: string; fallback: string; tone: 'gold'|'green'|'blue'|'violet'}`. Presence opts into DesktopActionSurface; absent preserves existing surface. Component consumes the same declarations, authorityFresh, selection/cancel and utility props as the organizer. Art metadata never establishes membership, names or availability.
**Behavior:** all organizer groups are visible without collection buttons. A focusable aria-disabled button remains inspectable but cannot select. Hover/focus displays a solid card above the entire tray; Escape dismisses inspection; pointer can enter/scroll the card. Lookup against current props on click. Withdrawn offers lose inspection; missing/broken art falls back to readable short lettering with an accessible full name. No native title duplication. Overflow wraps icons rather than hiding spells behind a menu. Selection and cancel retain existing callbacks.
**Tests:** all spells visible before any click; hover/focus produce tooltip without dispatch; disabled/stale click cannot dispatch and refusal is visible; current replacement row dispatched; withdrawn inspection removed; Escape closes; missing artwork fallback; End Turn excluded from icon grid.
**Verification:** worktree `npm run test:run -- src/components/session/combat-experience/DesktopActionSurface.test.tsx src/components/session/combat-experience/OrganizedActionSurface.test.tsx`; typecheck. Browser geometry separately proves opaque background, no action overlap and stationary icons on hover.

- [x] Add tests and surface; run focused tests.
- [x] Preserve default organizer behavior and existing gates.

## Task 2: Cleric fixture and shared-shell concept

**Delivers:** R4 comparable isolated walkthrough, R5 mobile preserved, R6 local Synty sample.
**Owner:** web Concepts Lab fixtures and composition.
**Prerequisites:** Task 1; existing OrganizedHudConcept and SessionCombatMap.
**Files:** new `src/concepts/desktop-hotbar/fixtures.ts`, `DesktopHotbarConcept.tsx`, `DesktopHotbarConcept.test.tsx`, `CONTRACT.md`; modify `src/concepts/organized-hud/OrganizedHudConcept.tsx`, `organizedHud.css`, `src/concepts/ConceptsView.tsx`.
**Interfaces:** parameterize OrganizedHudConcept with typed profiles/title/concept id and optional icon comparison. Current default unchanged. Concept frame ResizeObserver opts into desktopIcons only for frame >=1000px wide and >500px high; absent measurement starts with safe original mobile layout. Current-layout comparison uses identical declarations without desktopIcons. Profiles remain explicit fixtures, not runtime class inference.
**Behavior:** cleric-style Mace/Move/Resistance/Toll the Dead/Bane/Bless/Command/Cure Wounds/Healing Word plus general abilities; available, spent action (Healing Word stays available), spent slots, stale and spectator scenarios. Reuse martial profile for comparison. Spell candidates/options are explicit fixture content. Fixture-only selection receipts; no rule execution. Preview at `?concept=desktop-hotbar&preview=1`, return through standard Lab entry. Use named local sprite URLs under ignored `public/models/synty/interface-preview/`; preserve fallback when absent. No licensed files in git.
**Tests:** direct cast reaches shared targeting; Command reaches shared option chooser; cancel resets; stale/spectator gates; mobile uses existing organizer; art hints cannot mint offers. Existing OrganizedHudConcept tests stay green.
**Verification:** `npm run test:run -- src/concepts/desktop-hotbar/DesktopHotbarConcept.test.tsx src/concepts/organized-hud/OrganizedHudConcept.test.tsx`; browser walkthrough at 1600x900, 1280x720, 844x390 and 393x852.

- [x] Add fixture/composition tests and implement registration.
- [x] Stage selected art only in ignored private paths and document provenance locally.

## Task 3: Walkthrough evidence and preview

**Delivers:** integrated acceptance evidence and reachable preview.
**Owner:** web local environment and concept documentation.
**Prerequisites:** Tasks 1–2; existing browser Playwright installation, local model assets.
**Files:** ignored `evidence/desktop-hotbar/` for screenshots/browser probe; update this plan and CONTRACT with actual commands and limitations.
**Interfaces:** Vite dev server on a free local port, development query entry; no provider writes or server changes.
**Behavior/tests:** hover every spell without clicking; tooltip foreground opaque, above bar, in viewport, unchanged offer bounds. Inspect unavailable Cure Wounds and click Healing Word. Select Command then an option. Open log while browsing; narrow layout keeps existing collection controls and no page overflow. Unknown/broken image fallback works. Check no licensed tracked files. Browser rendering—not just rectangle checks—is required.
**Verification:** focused tests, `npm run typecheck`, changed-file ESLint/Prettier, Playwright screenshots and read images. Full `npm run ci-check` only before PR publication. Report preview URL and known limits; do not claim live fix or acceptance before operator walk.

- [x] Capture and inspect rendered desktop/mobile evidence.
- [x] Record checks and provide URL.

Completion evidence: 38 focused tests passed; typecheck and changed-file lint/format passed. Browser assertions and inspected screenshots at 1600×900, 1280×720, 844×390 and 393×852 are recorded in ignored `evidence/desktop-hotbar/verification.json`. Preview: `http://localhost:3031/?concept=desktop-hotbar&preview=1`. See CONTRACT.md for checks and limits. Full CI/review deferred to publication at the PR boundary, not claimed here. No production promotion.

Implementation detail correction: frame measurement and comparison fit inside the parameterized existing harness without new global concept CSS; `organizedHud.css` was left unchanged. Dependencies copied from the root were stale; installing the tracked lockfile in this worktree fixed the typecheck without changing package pins.

## Requirement coverage

| Requirement / acceptance                    | Task | Concrete proof                                                        |
| ------------------------------------------- | ---- | --------------------------------------------------------------------- |
| R1 Browse without opening menu              | 1,2  | all cleric spells visible on initial desktop render                   |
| R2 Hover/focus inspection, opaque above bar | 1,3  | no-dispatch tests; screenshot and geometry/opacity probe              |
| R3 Unavailable inspection, current identity | 1,2  | spent action/slots/stale/replacement/withdrawal assertions            |
| R4 Same real shell, no live changes         | 2    | shared TargetSurface and cast options tests; default regression tests |
| R5 Mobile unchanged                         | 2,3  | frame observer + original surface; 844x390 / 393x852 screenshots      |
| R6 Synty local sample                       | 2,3  | images loaded, fallbacks, git ignored-path check                      |

## Provider/consumer seams

| Provider                               | Consumer             | Produced vs consumed                                | Availability                   | Proof                                       |
| -------------------------------------- | -------------------- | --------------------------------------------------- | ------------------------------ | ------------------------------------------- |
| generated Declaration + actionTooltip  | DesktopActionSurface | exact names/costs/refusals; no description invented | existing installed protos      | tooltip and refusal assertions              |
| organizer/currentExecutableDeclaration | DesktopActionSurface | executable membership and current available row     | existing                       | end-turn exclusion, replacement/stale tests |
| desktopIcons fixture                   | organizer wrapper    | optional id-keyed art metadata only                 | Task 2 after Task 1 type       | defaults unchanged; missing art test        |
| parameterized OrganizedHudConcept      | DesktopHotbarConcept | same state/callbacks/real CombatExperience          | Task 2                         | cast target/option/cancel tests             |
| frame ResizeObserver                   | desktopIcons opt-in  | >=1000 width and >500 height; otherwise absent      | browser; mocked bounds in test | desktop/mobile browser matrix               |
| local licensed sprites                 | icon image           | named ignored URLs; fallback if load fails          | local only                     | load verification and git check             |

Plan checks: no changed wire, persistence, events or package pins. Full spell descriptions are absent at the inspected seam; tooltip keeps available facts rather than inventing mechanics. Layout threshold is local experiment sizing, not a production device policy. Existing accepted mobile behavior remains the fallback. No required architectural decision left open for this bounded concept.
