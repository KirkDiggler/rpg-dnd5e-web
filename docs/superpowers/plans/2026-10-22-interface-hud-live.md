# Approved interface HUD — live integration plan

**Goal:** Bring the approved interface-looks HUD into the real session route without replacing authoritative gameplay with fixture behavior.

**Case file:** https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1320

**Merge-scope amendment (operator, 2026-10-23):** Finish the existing HUD with readable, damage-first toasts; inventory makeover, portraits and further presentation work may follow separately. Their incomplete tasks below remain follow-ups, not claims of completion or gates on this narrower slice. Toast event eligibility and release timing remain unchanged. The checked toast implementation plan is [in the case file](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1320#issuecomment-6375334061). The early-view checkpoint does not replace full CI, review and the live walkthrough.

**Authority:** Operator approval in the interface-looks conversation: keep the current visual slice, add Debug and loaded-record pagination, then implement it in the game. The local reference remains `../interface-looks/src/concepts/interface-looks/`; it is not a production dependency.

**Architecture:** Keep `SessionEncounterView` as the live data/intent owner and `CombatExperience` as the composition root. Adapt the existing desktop action, equipment, story and record surfaces; do not mount `InterfaceLooksConcept` in a session. Promote only reusable presentation, with generated messages and existing callbacks at its boundaries.

**Execution:** Direct implementation, task by task. No new notification/toast policy, rules calculations, guessed availability or wholesale candidate-proto adoption. Preserve the existing mobile path. Independent review and live walk remain release gates, not substitutes for the operator's early look.

**Finish line:** Approved HUD on an isolated local stack against real API data; existing targeting, cast options, reactions, equipment and turn behavior intact; current and unavailable data states honest; scoped tests and `npm run ci-check` pass; visible PR(s) linked to the slice issue and early-view instructions supplied. No automatic merge or change to the operator's :3030 stack.

## Inspected baseline and correction

- Production branch: `origin/dev` at `afcab2b6`, isolated in `.worktrees/interface-live`, branch `feat/interface-hud-live`. The visual-reference worktree stays untouched by promotion.
- Web has RecordService bindings, `useSessionRecordStream`, `recordFeed`, `RecordPanel`, `StoryLog`, `DesktopActionSurface`, `liveActionPresentation`, `useSpellCatalog`, and real equipment callbacks already.
- Inspected toolkit checkout `1cc04981`: `character/status_view.go` and `status_view_bard_test.go` already include typed `SpellSlotLevel1` in status resources. API checkout `2d29c759`, `internal/handlers/dnd5e/v2/character/character_data.go`, copies these rows. Earlier prototype prose saying no spell-slot projection exists was too strong: proto comments are stale. Verify the deployed/pinned path rather than adding a duplicate pool field.
- Passive fighting styles can be `ConditionView` rows, while activatable features are `FeatureView` rows. Neither name nor absence of an activation offer proves a passive category.
- `SpellInfo.level` exists; `useSpellCatalog` currently fetches levels 0 and 1. The current `SpellRef` carries only ref/name. Exact-level grouping must use catalog metadata, not resource-cost text.
- No generic consumable-use RPC/verb was found in the inspected API protos, session or encounter seam. Equipment already has real Equip/Unequip intents. The mock potion Use is not a production command.

## Status / required decision checkpoint

Task 1 is fully checked and executable. The complete wave is **not yet contract-ready**: Task 2 must resolve passive classification, richer effect/source identity and Quick Items execution scope. This is not permission to omit those requirements or claim the whole HUD is implemented after Task 1.

The operator-owned scope question is whether this HUD slice must introduce consumable-use gameplay when no such offer exists, or whether Quick Items shows real inventory/inspection/equip access with no fabricated Use command. A generic UI replacement must not silently become a new consumables subsystem.

## Requirement coverage

| Requirement                                                       | Owner/task | Concrete proof                                                                                                            |
| ----------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| R1 Approved compact/translucent HUD and existing skins            | T3         | Real `CombatExperience` screenshots at 1440 and 1024; popovers readable; no clipped targets/controls                      |
| R2 Shape-coded costs, inspectable unavailable actions, rich facts | T1, T3     | Slot/none/unknown shape tests; unavailable clicks send nothing; refreshed provider declaration is used                    |
| R3 Portrait identity and separate active/passive areas            | T2, T3     | Real roster refs, explicit fallback; provider category tests; no source/ownership inference                               |
| R4 Inventory/Attack shared information, Quick Items               | T2, T4     | Same provider context used across both surfaces; equip intent reaches existing caller; use scope explicitly resolved      |
| R5 Just Happened, history, Debug and row paging                   | T1, T5     | Loaded-buffer filtering precedes paging; existing subscription visibility/catch-up behavior; no record-to-story synthesis |
| R6 Capability groups, spell levels and resources                  | T2, T3     | Exact-ref joins to existing catalog/status; unknown remains unknown; no class/cost-derived membership                     |
| R7 Real gameplay and no fixture fallback                          | T6         | Live route/stack walk, stale/off-turn/refused transitions, no concept imports or local fake actors/actions                |
| R8 Toast changes excluded                                         | All        | Existing notification paths remain unchanged; no new toast policy introduced                                              |

## Provider/consumer seam check

| Provider                                    | Consumer                              | Contract / dependency                                                                        | Proof                                                                              |
| ------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Afford / session controller                 | DesktopActionSurface                  | Existing `Declaration`, freshness, selectors and callbacks                                   | T1/T3 real component tests, T6 live selection/targeting                            |
| RecordService / useSessionRecordStream      | StoryLog / RecordPanel                | `RecordFeedSnapshot`; 500-row buffer, catch-up independent of display pages                  | T1 row/append/reset tests; T5 visibility tests                                     |
| Character status                            | Character identity/benefits/resources | `CharacterData`, `ConditionView`, `FeatureView`, `ResourceView`; passive category unresolved | T2 classification contract and status-resource provider evidence; T3 adapter tests |
| ListSpellsByLevel                           | liveActionPresentation                | `SpellInfo.spellRef` + `level`; catalog failure cannot hide offers                           | T2/T3 exact-ref and missing-catalog tests                                          |
| Roster / existing asset resolvers           | Portrait provider                     | Public appearance identity, not rules identity                                               | T3 explicit-override/missing-model tests and shared capture surface                |
| Equipment API / owner projection            | Inventory / Quick Items               | Existing item/slot/quantity and EquipIntent; consumable use unresolved                       | T2 scope ruling, T4 real intent tests                                              |
| StoryService / existing presentation pacing | Just Happened/history                 | Existing revealed player-facing exchanges, not raw record                                    | T5 delayed-roll reveal and debug separation tests                                  |

**Check disposition:** No new debug or shape wire is needed. Preserve existing controllers instead of replacing them. T2 is an explicit prerequisite for affected T3/T4 work; it must produce a checked contract amendment before that work begins. Shared files are changed sequentially in this branch. The old prototype branch is never merged wholesale across the v1 stream deletion.

## T1 — Promote wire-independent components (ready)

**Owner:** web UI. **Prerequisites:** fresh dev worktree and installed locked dependencies.

**Files:** create `src/components/ui/inspection/ActionCostMark.tsx`, `actionCostMark.css`, `ActionCostMark.test.tsx`; modify `src/components/session/combat-experience/{DesktopActionSection.tsx,DesktopActionSurface.tsx,DesktopActionSurface.module.css,DesktopActionSurface.test.tsx,RecordPanel.tsx,RecordPanel.module.css,RecordPanel.test.tsx}`.

**Interfaces:** Cost marker consumes generated `Slot`; no availability prop or computation. RecordPanel still consumes `RecordFeedSnapshot`; no new service call or buffer policy. Action selection keeps the existing current-authority callback path.

**Behavior/tests:** `ActionCostMark` distinguishes Action/Bonus/Reaction/None/Unspecified. `DesktopActionSurface` shows the same supplied cost in tile and reader; unavailable offers remain focusable and cannot execute. Existing target/cast/favorite tests stay green. RecordPanel offers 10/25/50 display rows, Previous/Next, count/range, empty/no-match states; filter all loaded rows before slicing, reset page on filter/size changes, keep page on append, clamp on shrink/restart. Transport paging is untouched.

- [x] Copy the existing regression tests and add the production action-surface shape test; observe the missing behavior fail.
- [x] Promote the shared components without importing concepts or changing command callbacks.
- [x] Run the focused command below plus ESLint/typecheck; inspect the desktop-hotbar route.
- Commit checkpoint and SHA are recorded in the case file; verify git before resuming.

**Observed T1 evidence:** 51 tests / 6 files pass; ESLint, typecheck and diff checks pass. Fresh-dev desktop-hotbar fixture route on port 5186 renders the production tile/reader shapes without page errors (`/tmp/interface-live-t1.png`). This is not a joined live-encounter verification. RecordPanel source blobs at the prototype and fresh-dev bases were identical before promotion. No concept code, licensed assets or dependency changes were copied.

**Verification (worktree root):** `npx vitest run src/components/ui/inspection/ActionCostMark.test.tsx src/components/session/combat-experience/DesktopActionSurface.test.tsx src/components/session/combat-experience/RecordPanel.test.tsx src/components/session/combat-experience/StoryLogDetails.test.tsx src/components/session/useSessionRecordStream.test.ts src/components/session/recordFeed.test.ts`; `npm run typecheck`; ESLint on changed TS/TSX; `git diff --check`. Expected: existing behavior preserved and new assertions pass.

## T2 — Close live data/scope contracts (required checkpoint)

**Owner:** UI consumer, with platform owning any provider additions. **Prerequisite:** inspected actual providers, not prototype declarations.

**Files inspected:** web `src/api/useSpellCatalog.ts`, `src/components/session/SessionEncounterView.tsx`, `src/components/session/combat-experience/{liveActionPresentation.ts,characterPresentation.ts}`; API `internal/handlers/dnd5e/v2/character/character_data.go`; toolkit `rulebooks/dnd5e/character/{status_view.go,status_view_bard_test.go}`, `features/status.go`, `conditions/display.go`; proto `dnd5e/api/v1alpha2/encounter/types.proto` and session declarations.

**Delivers:** An issue-linked field-by-field contract for condition presentation category, resource/slot delivery, contextual weapon/effect inspection, and Quick Items commands. Record exact producing task/module and generated fields for any addition; otherwise cite the existing read. Confirm whether new gameplay is in scope before creating a use-item service. No candidate schema becomes canonical merely because it exists in the study.

- [ ] Verify first-level slot rows at the actual API pin and reconcile stale documentation.
- [ ] Resolve authoritative passive classification; explicitly handle unknown categories without relabelling all conditions passive or all features active.
- [ ] Resolve Quick Items execution scope with the operator in the case file.
- [ ] Map every richer weapon/effect fact to a provider or name the required provider task.
- [ ] Amend T3/T4 interfaces/tests and the seam table; only then mark affected work executable.

**Verification:** Source and targeted provider-test evidence, followed by a live status/afford read. Contract changes, if necessary, develop outside-in and merge with released provider tags inside-out. New RPCs must include API role-policy classification/tests. This checkpoint is incomplete until required facts have owners and testable interfaces.

## T3 — Live HUD composition and character/action presentation (category work after T2)

**Execution ruling:** Existing public identity/status relocation and HUD geometry do not consume the unresolved category/use contracts. Implement those portions now for the operator's live early view; keep passive classification, portraits and Quick Items visibly incomplete. This does not waive T2 or relabel unclassified conditions.

**Early-view checkpoint:** The operator started this worktree on port 3002 and is creating a character. Preserve that server/session. The dock now places existing identity, HP/AC/movement and supplied informational status rows together. No condition is newly classified as passive. Public identity currently uses the existing initials fallback, not fixture model art.

**Approved density refinement:** The operator requested icons with hover details in the status area. `CharacterStatusRail` uses mapped artwork, count overlays, keyboard-focus summaries and click-to-inspect via the promoted generic `Inspectable` shell. `characterStatusEntries` joins features/resources only through an explicit, uniquely resolved `resourceKey`; names never establish a link, absent resources never become zero, ambiguous rows remain visible. Known depleted resources remain inspectable. Private-status warnings travel into the inspector. This is read-only presentation, not feature activation or an active/passive classification heuristic.

**Owner:** web. **Files:** modify `CombatExperience.tsx`, its CSS module and `types.ts`; `DesktopStatusSection.tsx`/CSS/tests; `DesktopActionSection.tsx`, `DesktopActionSurface.tsx`/CSS/tests; `desktopHotbarGroups.ts`/tests; `liveActionPresentation.ts`/tests; `SessionEncounterView.tsx`/tests. Proposed focused helpers: `RosterPortraitProvider.tsx`, `CharacterBenefits.tsx` and tests under combat-experience.

**Interfaces preserved:** `CombatExperienceProps` authority/intent callbacks, `TargetSurface`, roll settlement, cast-option replacement and desktop targeting host. Roster input must use generated public member messages, not display-name joins. Additional benefit metadata is blocked on T2, not inferred in the client.

**Behavior/proof:** Move identity/active/passive information under the portrait without dropping private-status warnings/resources. Apply approved skin, geometry, translucency and 46px action art while retaining rich provider facts/effect reasons. Exact spell-level bands use catalog fields; absent catalog yields a visible unclassified band. Preserve unavailable inspection, reaction windows, favorite/order preferences, cancel semantics and existing mobile rendering.

- [ ] Finalize input signatures from T2 before tests.
- [ ] Add named cases: explicit appearance override; unavailable model; stale/private-status failure; unknown category; absent spell metadata; unavailable offer refresh; cast-option/target cancellation; world/turn clocks.
- [ ] Implement and run focused component/controller tests, plus real-route viewport checks.

**Approved cleanup checkpoint:** Desktop turn order is centered; top-left retains Back/location. Existing discovery-sharing, rest controls and the faction key live in Explore without adopting action-budget gates or changing callbacks. Sneak has direct access in the row beneath action icons; its server-reported state, pending/refusal behavior and free-roam visibility are preserved. Mobile retains its previous placement. Recent reminder rows keep the reference's 12px type but use content-sized, backgroundless text/icons with text shadows. Hover-card wheel routing consumes scrolling over the trigger or reader (including at boundaries), preserves browser zoom, and hover readers dismiss on leave rather than remaining pinned. Explicit inspection/history actions are separate.

## T4 — Inventory and Quick Items integration (after T2; may follow T3)

**Owner:** web plus explicitly named provider task if T2 requires one. **Files:** `src/components/game/equipment/{EquipmentPopover.tsx,InventoryLight.tsx,EquipmentSlots.tsx,equipmentTypes.ts}` and their tests; caller `SessionEncounterView.tsx`; proposed reusable inspection components under `src/components/ui/inspection/` and item presentation helpers under equipment.

**Interfaces preserved:** Real `EquipIntent`, owner inventory/quantity, server AC/main-hand damage and operation busy/refusal state. No fixture Use/Equip acknowledgement in the live route. Shared Attack/Inventory information must be tied to the same actor, item and authoritative revision/context; targeted information cannot silently become untargeted information.

- [ ] Finalize Quick Items membership/use interface and absent-command behavior at T2.
- [ ] Add tests for empty inventory, missing metadata, provider refusal, command versus inspection, equipped versus carried quantities, ownership switch and stale summary replacement.
- [ ] Reuse the approved inspection shell; wire only real intents. Verify nested inspection and focus restoration.

## T5 — Just Happened/history/Debug composition (wire-ready; after layout seam chosen)

**Early-view checkpoint:** `JustHappenedPreview.tsx` uses the existing recent-selection categories and released player-facing story, at three rows. `StoryLogModeSwitch.tsx` supplies accessible History/Debug tabs for the desktop mode; the existing legacy/mobile mode remains unchanged. StoryLog preserves the existing record visibility callback, roll-reveal source and real RecordPanel. Opening a recent row goes to its history row; Escape restores the trigger; opening the HUD reader starts on History. Added `StoryLogHud.test.tsx` covers typed acts, raw-record separation, keyboard tabs, visibility/focus and empty state. Existing real session-controller and action suites remain in the gate. Source-level tests and the component fixture on :3002 are not a substitute for the operator's joined live check.

**Owner:** web. **Files:** `StoryLog.tsx`, `StoryLogDetails.test.tsx`, `StoryLog.module.css`, `CombatExperience.tsx`, `useCombatPresentation.test.tsx`, `SessionEncounterView.test.tsx`.

**Approved reminder refinement:** Just Happened rows show an event-type icon and the actor/subject name only. `recentEventIdentity` reads typed act parties (including the attacker on a miss, not the defender leading the sentence). Hover/focus separates the existing describer's headline and outcome into readable lines, followed by labelled supplied roll cards. Attack/check rolls use cool styling; damage uses the same incoming-danger/outgoing-success tone as the feed. Component rolls and supplied multipliers remain separate from applied damage; absent breakdowns are not reconstructed. Click retains the original story-row identity and opens that row in History. No narration parsing, raw-record fallback or toast-policy change. Typed attack/speech/cast samples exercise the shared component in the free-roam layout fixture.

**Interface:** `revealedStory` remains the player-facing source; `record` and `onRecordShownChange` remain the diagnostic source/subscription gate. Display mode and collapse state are UI state only.

**Behavior/proof:** Compact last-three outcomes, expandable History/Debug tabs, approved translucent history background and readable taller Debug panel. Render existing event forms rather than formatting raw debug payloads. Debug starts/stops the existing hook only when shown; closing/reopening retains its transport cursor. Existing roll settlement continues to delay unreleased outcomes; raw records never leak into player history. No new toast behavior.

- [ ] Add real-component assertions for default history, keyboard tabs/Escape, debug visibility callbacks, retained cursor, delayed story reveal and record/story separation.
- [ ] Implement using the existing StoryLog/RecordPanel path and T1 pagination.
- [ ] Run log/controller/record tests and browser-check overlap and scrolling at 1440/1024.

### Operator notes queued after the current cleanup cycle

- Implemented conversation placement: `ConversationPanel` uses the existing dock targeting host, centered over the whole view immediately above the dock. Its width follows content within 280–420px, rather than reserving 560px or offsetting for the portrait column. It retains `speakTargetsOf` / `speakLinesFor`, the member/prop target distinction and the existing opaque-option callback. Choice rows match the new panel styling, support keyboard selection, and never expose unavailable lines. A labelled no-RPC conversation fixture exercises both steps.
- Implemented desktop History/Debug outside-pointer dismissal. Inside interactions remain open; outside clicks keep their own focus/command behavior and stop the existing Debug subscription through its unchanged visibility callback.
- Reconcile weapon-card typography (especially undersized effect labels).
- Implemented tooltip roll refinement: prominent attack/damage roll cards, supplied expressions/totals, separate outcome line and existing red/green perspective. The existing release/settlement gate is preserved; no reconstructed roll results. Richer readable-history polish remains separate.
- The supplied “Operation aborted” snippet is coding-terminal progress output (including “Editing scoped source docs”), not evidence of a gameplay failure. Its cause is unconfirmed; do not invent a game/API regression from it.

## T6 — Joined live verification and publication

**Owner:** web/integration. **Prerequisites:** T1–T5 complete; provider changes tagged and consumers repinned, or explicitly draft until that happens.

- [ ] Boot a builder-owned stack/ports; leave :3030/:8115 untouched. Confirm served web/API revisions and licensed asset delivery.
- [ ] Supply early-view URL and numbered try-it steps before independent review/walk.
- [ ] Exercise world and turn clocks, actor switches, fresh/stale/refused offers, target/cast options, reactions, equipment and shared inspection, active/passive changes, history/debug paging and reconnection.
- [ ] Assert production imports no concept fixtures, fake actors, mock transports or fixture action callbacks. No Synty source/model binaries in the public diff.
- [ ] Run `npm run ci-check` at the PR boundary, record results and open the integrated PR(s) with the case-file issue. Follow the independent-review and live-walk gates after the early view; do not merge automatically.

**Completion evidence:** actual API-backed route observations, screenshots, focused and full gates, released dependency pins, PR URLs and explicit remaining blockers. Unit-only evidence is not completion of this task.
