# Session combat production promotion — #817

- Date: 2026-08-25
- Final evidence: 2026-08-26
- Evidence target web HEAD: `301b9a39c12dd3eeffec3c55b136e095dc22ec45` (`301b9a3`)
- Merged API runtime: `f1aa9d2`

## Reproducible concept target

- Development deep link: `?concept=session-combat`
- Required viewports: `1280x800`, `1024x768`
- Shared renderer: `src/components/session/combat-experience/CombatExperience.tsx`
- Production route: `src/components/session/SessionEncounterView.tsx`

## Automated evidence — PASS

`SessionEncounterView.test.tsx` mounts the production shared shell and proves
panel-first exact Attack targeting, unavailable provider reasons, no unarmed map
dispatch, ambiguity and malformed-target-kind refusal, exact Move/End Turn
selectors, authenticated-owner private cache isolation, public map/action
operation during initial private failure, Turn/Afford freshness and synchronous
event invalidation, unified no-retry FAILED_PRECONDITION recovery for all three
verbs, stable public-roster dice ownership through FightEnded, authoritative-only
result fields, coalesced refresh, immediate Debug, presentation-only
other-member pacing, catch-up Story, equipment response replacement, reconnect,
scope reset, doors, roster pull, movement reconciliation, and the run-ended
overlay.

At final code HEAD, GitHub CI passed Prettier, ESLint, TypeScript, build, tests,
and security audit. Vitest reported `215 passed | 1 skipped` test files and
`3472 passed | 2 skipped` tests. Commit `301b9a3` added the final App-level
coverage for Concepts dev-tool state.

## Visual witness — PASS

The authorized recapture used the actual synced licensed assets, system Chrome,
and SwiftShader. Captures targeted the game frame element rather than the whole
browser page:

| Browser viewport | Captured frame | SHA-256 |
|---|---|---|
| `1280x800` | `1216x800` | `fdf9dab7d216265eed5ff703e1946974e1045d437a51b84fb50d5cb1417fe7b5` |
| `1024x768` | `960x768` | `87f5e7dbe71ea726d1cf58941033c90d0ee2370c1f8e337dcbdfb62a049419e3` |

Both viewports had zero console errors, page errors, and request errors. The
frame and map had real dimensions, and the End Turn control had no overlap with
global development tools after the layout and Concepts-overlay fixes. The
screenshots remain at private local paths and are intentionally not committed;
the hashes identify the reviewed files without publishing licensed material.

The earlier missing-assets/pending-capture statement and the collapsed pre-fix
capture are superseded by this PASS. No fallback, placeholder, intercepted
asset, private log, screenshot, or licensed asset is evidence committed here.

## Authenticated two-context live journey — PASS

The complete untracked report is
`/home/kirk/game-dev/.superpowers/sdd/plan/task-14-live-report.md`. Its 69 private
artifacts remain under `/tmp/session-combat-live-817/`; do not copy those
screenshots, private logs, Redis captures, or licensed assets into git.

Two independent browser contexts used `Dev toolkit-sandbox-fighter` and
`Dev toolkit-sandbox-barbarian`. The principal run used lobby
`lobby_3183ef21-744b-4133-852b-4a0bb52cad6e`, join ref
`join_d67d8c92-8b9a-47fa-a138-e4741e135e3a`, and session
`137fb64c-1092-4412-9fdb-40e56a85b918` in `reference-tomb`. Results by required
witness:

1. **Shared session and privacy:** the real 224-cell map, roster, props,
   monsters, Story, and initiative rendered. Fighter private data was `12/12`,
   AC 16; Barbarian private data was `14/14`, AC 12. Equipment differed by
   owner, and neither DOM exposed the peer's exact HP.
2. **Panel-first Longsword:** combat formed at sequence 16. `Afford` supplied
   `dnd5e:weapons:longsword`; map clicks before arming sent no Attack, and
   arming the panel action alone sent no Attack.
3. **Availability reasons:** the Barbarian candidate was enabled as
   `Available`; both Skeleton candidates were disabled with
   `Unavailable: target out of reach`. Clicking a disabled candidate dispatched
   no Attack.
4. **Exact declaration/request/outcome:** `SessionService.AttackRequest` sent
   session `137fb64c-1092-4412-9fdb-40e56a85b918`, attacker
   `char_2ed37e2a-8d4f-4ee4-b8cc-bfe246d032eb`, target
   `char_d80b367c-d815-4c4c-8085-3fe2df9d02dd`, and declaration ID
   `v1.rkme8u-Yt7vzF-cVzeFgIqa3X7XeLSuMJ6XaifTR-DE`. The authoritative response
   was `roll=17 total=22 against=12 hit=true critical=false damage=10`,
   `attack.ref=dnd5e:weapons:longsword`, and `attack.name=Longsword`.
5. **Dice roles:** the actor initially saw a concealed `?` and had to use the
   real Roll d20 control. The witness auto-settled the same roll read-only,
   without Roll or Grab controls; the actor then settled to the same result.
6. **Story and Debug:** actor Story concealed the strike until release, while
   Debug immediately showed the typed roll, total, AC, damage, weapon ref, and
   components. Story became readable after release.
7. **Owner HP refresh/privacy:** the target's authenticated
   `GetCharacterData` refresh changed only the Barbarian dock from `14/14` to
   `4/14`; the Fighter retained `12/12` and never received the peer's exact HP.
8. **Spent state and selectors:** Longsword became disabled with
   `action: 1 needed, 0 left`. Move to `(4,4)` sent selector
   `v1.n4ncMkCqYuD_AND8Zkt0TV3lAwvnLbPCWTyTR81gd3Q`; End Turn sent
   `v1.7HmEoUAKk_xzzSkLrDm08JsUlDenVuk7l5KdITMcHLs`. Monster turns resolved and
   sequence 25 advanced initiative to round 2.
9. **Terminal-stream recovery:** in independent session
   `b84b9804-1186-4f34-b3c5-1c86afc4527d`, only the Barbarian stream was ended
   successfully with zero messages. A real Fighter move at sequence 7 was
   recovered by `GetStory(fromSeq=7)` in **744 ms**, rendered as `source=catchup`,
   with zero later live stream Event deliveries.
10. **Allowed alternative branch:** the run did not play through a terminal
    `FightEnded`, so terminal declaration removal was not claimed. Instead it
    verified the specified world-clock branch twice: free roam, no turn economy,
    `clock=1`, round 0, no active participant, and empty declarations.

There were zero page errors and zero HTTP responses at or above 400 in either
live context. Expected development/intentional stream-cancellation logs are
listed in the full report and were not treated as product failures. After real
pointer attempts showed headless orthographic wall geometry made deterministic
floor ray hits unreliable, map destinations used the rendered `SessionCanvas`
Fiber callback into the production walk handler; no API client was called
directly, and Attack targeting remained visible DOM interaction.

Cleanup stopped the browser controller and deleted exactly the 32 keys belonging
to the two player pointers and six lobbies, join refs, and sessions created by
the gate. No wildcard deletion or flush was used, created-session residuals were
zero, and pre-existing data was untouched.

## Copilot review and final fixes

- Inline comments `3859462714` and `3859462730` were fixed in
  `4074ed2f26531d946bbdb535544b55332f2311dd` and replied to inline.
- RED was `2 failed | 15 passed`; focused GREEN was `17 passed`. The subsequent
  pacing/drawer/combat/concept gate was `16 files passed | 219 tests passed`.
- The shared review frame/fill-parent separation landed in `c603400`; Concepts
  global dev-tool suppression landed in `7967805`; final App-level coverage
  landed in `301b9a3`.
- The review-fix gates passed Prettier, ESLint, TypeScript, build, focused tests,
  full tests, `npm run ci-check`, and `git diff --check`. Final-head CI counts
  and checks are recorded above.
