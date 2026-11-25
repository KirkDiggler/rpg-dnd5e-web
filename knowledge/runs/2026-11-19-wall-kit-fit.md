# Run — 2026-11-19 — Shared wall-kit height fitting

## Shipped

- Initial implementation checkpoint: a pure declared-height planner and the existing upper-row renderer use one bounded layout; the wider kit is still unfinished — [Courtyard S6](https://github.com/KirkDiggler/rpg-project/issues/1022).

- First-pair integration now routes structural walls, doorway assemblies and generated props through the common height assembly; repeated parts get placement-local binding aliases so all courses receive the same finish/chart. The first wall/door Studio checkpoint was accepted by the operator — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

- Feature checkpoint: optional fixed caps and multi-part facade finishes render through the same assembly. Nine existing refs are pinned to candidate provider `05cfd6a`; the inspector now says Wall height with visual-only help. Actual Studio measurements for Wall04/Window03 reach 3.75 and 6 with unchanged fixed/cap geometry and chart error below 7e-8. The :3191 sample is one short wall per feature, not completed one-logical-wall section placement — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

- One-wall Studio continuation adds owned visual sections, fixed-span clipping, section controls through the existing wall edit port, and native-file round-trip. A real wall containing both a door and window measures 3.75/6; a wall-height edit changes both to 5.25, Undo restores the owner, and moving a section keeps one wall row. Captured Play is not delivered: the current engine explicitly reports `sections` as an unknown appearance key — [continuation plan](https://github.com/KirkDiggler/rpg-project/blob/feat/wall-kit-fit/ideas/wall-kit-fit/sections-plan.md).

- Runtime adapter checkpoint adopts actual generated SDK v0.1.286, converts captured wall-section lengths from feet once, retains opaque references without a source lookup, validates spans and preserves them through v2 reveal bridging/opening-only updates. Joined browser Play remains a separate check — [merged contract](https://github.com/KirkDiggler/rpg-api-protos/pull/449).

- Original-height/adaptor checkpoint: fixed regions keep their authored UVs; declared moving masonry extends its actual source chart across repeat rows and one cap. Leafless surrounds can use full-body anchoring as static sections, and legacy absolute height measures companions through the shared scale planner. The accepted editor origins now serve detached d4fcddc5; their drafts and :3193 Play stack remain unchanged — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

- Configured raw Castle Wall Door01 now joins the existing static section choices under its unchanged ref, using candidate provider8086142. Actual one-wall samples measure width3.75 and heights3.75/6, with no new leaf or gameplay opening; preceding feature assets retain their bytes — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

- Castle coverage now includes captured Double01 and seated Single02 pairs with repeat/cap masonry, the large gateway pair with a protected minimum8.1317, and standard gateway masonry at its explicit fixed height. Consumer checks preserve door IDs and correctly refuse short/incompatible choices; source leaf signatures remain exact — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

- Anchored implementation checkpoint adds measured lower/upper layout points, rigid overlapping caps, and declared stretch/repeat infill through the existing assembler and strict generator. Four actual inner-door source candidates now preserve leaves/full wood rails at native and2.7 heights; candidate data is not installed or a joined Studio/Play delivery — [approved continuation](https://github.com/KirkDiggler/rpg-project/issues/1022#issuecomment-7092137564).

- Appearance-group checkpoint consumes optional provider equivalence per asset/surface, shows one Original appearance for the wood panel and distinct plaster choices, and leaves exact saved refs untouched through unrelated edits/reload. Reset remains explicit; no material compatibility or renderer alias is removed — [approved direction](https://github.com/KirkDiggler/rpg-project/issues/1022#issuecomment-7140689435).

- Normal world/material pins now use Assets4f007dc. Actual wood/plaster height edits, native Save-copy, Play, reload and fresh-browser resume after API restart retain exact palette refs and3.4-height geometry; whole cap/leaf dimensions remain fixed. All32 wood/20 plaster panel maps use the captured selection while doors retain Original — [native evidence](https://github.com/KirkDiggler/rpg-game-assets/tree/feat/wall-kit-fit/evidence/1022-wall-kit/inner-native-play).

## Decided

- Defer inner-door atlas inheritance because the operator accepts a single Original door look for this slice; leave the existing captured-frame shape and independent disclosure unchanged rather than infer a hidden wall's palette — [ruling](https://github.com/KirkDiggler/rpg-project/issues/1022#issuecomment-7145840081).

- Bound repeat-row allocation, not a valid requested height: residual scale belongs to the upper rows actually created, never to the fixed opening or leaf — [agreed fitting direction](https://github.com/KirkDiggler/rpg-project/issues/1022).
- Keep the old proportional-input minimum behavior at its legacy adapter while the new explicit-height contract refuses targets below the fixed region — [implementation plan](https://github.com/KirkDiggler/rpg-project/blob/feat/wall-kit-fit/ideas/wall-kit-fit/plan.md).

- Build each height revision as a fresh detached hierarchy before UV/material treatment, rather than append rows to a live object after chart preparation; preserve source slot identities in saved data and expand only placement-local aliases — [plan](https://github.com/KirkDiggler/rpg-project/blob/feat/wall-kit-fit/ideas/wall-kit-fit/plan.md).
- Keep Castle Wall 01's corner policy unchanged with body fitting separate from optional miter opt-in, and key GLTF loading by content hash so new configured bytes cannot reuse an older cached hierarchy — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

- A single logical face choice expands over every declared compatible frame/above/cap binding; it must not be refused simply because a face has multiple parts, nor color unrelated trim or the opposite side — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

- Keep visual sections under `appearance`, never in mechanical openings; preserve the old repeat intent for imported documents but exclude explicitly tagged feature sections from new repeat choices. Fog clips the full configured feature instead of squeezing a second copy into each stretch — [continuation plan](https://github.com/KirkDiggler/rpg-project/blob/feat/wall-kit-fit/ideas/wall-kit-fit/sections-plan.md).

- Original remains the artist's own mapping, not a guessed common material/repeat size. Reuse declared surface scopes and paired channels; leave unbound trim and atlas coordinates alone. Legacy static props retain proportional semantics, while an explicit target measures the complete loaded assembly rather than guessing from the primary mesh — [plan](https://github.com/KirkDiggler/rpg-project/blob/feat/wall-kit-fit/ideas/wall-kit-fit/plan.md).
- Leafless opening metadata is a fitting capability, not gameplay authority. Static placement uses its measured full frame width/body centre; existing doors retain aperture anchoring. New incompatible section/finish choices refuse atomically instead of committing an unrenderable wall — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

- Keep anchored fitting distinct from legacy stacked repetition; use native height as its conservative minimum, keep fixed/rigid geometry intact, and validate real source anchors instead of deriving layout from decorative bounds — [operator ruling](https://github.com/KirkDiggler/rpg-project/issues/1022#issuecomment-7092137564).

## Found

- The old clone cap could render height 66 while reporting 120; the actual-geometry regression now reaches 120 with 64 upper courses and an unchanged 1.8-height leaf, then shrinks back to native height — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).
- Residual scaling about a centred mesh pivot shifted the row base; anchoring the lower face removes the gap without moving fixed geometry — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).
- The planner, loaded-model and generator checks pass (86 focused tests), plus 16 adjacent fit/catalog checks, targeted lint and typecheck; this is not a full-gate, whole-kit or screenshot-reproduction claim — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

- The actual pushed provider `19056c4` supplies measured height profiles through normal sync; strict parsing refuses incompatible roles/dimensions and the loaded upper-row path checks those metrics against its geometry. No new model/image bytes or material enrollment are part of this checkpoint — [provider work](https://github.com/KirkDiggler/rpg-project/issues/1022).

- Focused checks now measure actual structural wall/door geometry at the requested height, continuous UVs across repeated masonry, unchanged leaf height, source/instance isolation, disposal and owner-side refusal below the fixed minimum — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

- Feature checkpoint's focused cap/catalog/finish run passed 80 tests. Full Web tests passed 11296 (30 skipped), with lint/type/build and production guards passing; that first gate's format check caught only the local `_job_1022_features.html` launcher. Its formatting is corrected separately; no full-green claim from that failed gate — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

- One-wall geometry/native editor checks passed 180 focused tests; loaded clipping preserves the fixed lower/cap sizes and its omission mutant fails. Real source meshes retain chart agreement below 2e-7 at the off-repeat-aligned window position. One UI grouping assertion needed updating for the separate immediate section controls — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

- Actual Original Window03/Wall04 checks keep fixed UV values unchanged at heights 3.75/6; moving chart continuation errors stay below 5.3e-7. The actual opening-only Single01 fits width3.75 and height3.75/6 at the correct section centre, without a leaf or extra mechanical opening. This is narrow renderer/adaptor evidence, not full kit/Play completion — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

- Anchored focused checks pass120 tests across10files and provider checks pass43. The complete Web gate passed lint/types/build but recorded11356 passes, two synthetic material-fixture failures and two Studio timeouts. Both fixtures were corrected to carry declared surface names; all four failed cases pass in the focused recheck, and whole-repo formatting passes after formatting the scratch gallery. The full suite was not rerun or relabeled green — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

## Mistaken

- Palette assignment and persistence were mistaken for visible variation: the wood panel uses identical authored texels across all twelve atlases. Provider-owned mapped-colour grouping now drives display-only representatives; actual Studio verifies saved-alias preservation and visible plaster changes. The first readonly UI also inherited a two-column help layout and overlapped its text; visual inspection caught it and the choice wrapper now stacks its help/reset content — [texture diagnosis](https://github.com/KirkDiggler/rpg-project/issues/1022#issuecomment-7120462769).

- The first anchored model integration retained a parent Y fit scale after assembling the target height, rendering10.2857 for requested6. Its real-model regression now protects the actual height and cap/leaf dimensions. Plain fitting also continued UVs for unbound atlas trim under width/offset changes; only explicitly declared surface targets now receive that mapping — [anchored continuation](https://github.com/KirkDiggler/rpg-project/issues/1022#issuecomment-7092137564).

- The unpaintable-frame regression originally used seated Single02, then the standard gateway. Both became correctly enrolled during this pass; the regression now uses the distinct house-frame family at its actual native height, retaining the finish-refusal oracle rather than weakening compatibility checks — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

- The plain fitter stretched Original UVs over the whole target before fixed/repeat assembly, and copied rows reset their authored phase. RED/GREEN loaded-model cases exposed both, plus unbound fixed trim being re-mapped. Fit the fixed source at native height and continue only explicitly enrolled moving charts after assembly — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).
- The proportional minimum omitted cap height, refusing a valid legacy minimum on capped assets. Its actual visible-geometry regression now includes base plus cap. The clipping fixture also needed the real facade identities/maps declared by its provider rather than anonymous untextured boxes — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

- The section checkpoint's first full gate found one old palette/history fixture choosing Castle Wall02 as a repeater. That configured feature now belongs to the section chooser; the test explicitly verifies its absence and exercises the existing swap/history contract with Fit01 instead — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).

- First whole-Web gate found an old unversioned-URL assertion, a door fixture below its protected opening height, and material-only updates rebuilding geometry because equivalent metadata arrays had different identities. Updated the assertions/fixture and keyed the instance by metadata values; focused regressions pass — [slice](https://github.com/KirkDiggler/rpg-project/issues/1022).
- The initial plan proposed rejecting row-count overflow before reconciling the base renderer's documented pool policy; corrected it to preserve requested height with bounded allocation instead — [plan](https://github.com/KirkDiggler/rpg-project/blob/feat/wall-kit-fit/ideas/wall-kit-fit/plan.md).
