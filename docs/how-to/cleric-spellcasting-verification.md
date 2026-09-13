# Cleric web handoff verification

## Contract and implementation

The API handoff is `rpg-api/docs/how-to/cleric-bless-web-handoff.md`.
Web consumes generated protos `v0.1.189`, commit
`f97bcce04ae5585345da38954afd70007e794f37`, including protos #333.

The picker renders Cleric, provider domain options and base spell choices.
It retains saved domain/ref selections. If saved choices omit their category,
the summary consults the provider definition with the same choice ID; unknown
IDs do not become spells. Selected-domain choice overrides also drive equipment
reconstruction and the finalization guard, matching the picker. Missing spellcasting metadata does not hide known
refs or cause the client to calculate slots, modifiers, or DCs.

The existing Cast action path echoes opaque declarations and provider target
IDs in click order, including remembered targets without map positions. It uses
provider availability/reasons and action slots. Cast acknowledgements are not
effects. Story consumes typed effects and `CastMissed`; a miss has no invented
roll, AC, reason, refund, or spatial data. Duplicate/conflicting event identity
includes ordered cast targets and condition source IDs.

## Automated coverage

- `clericChoice.test.tsx`: domain-required provider fixture, base spell choices,
  saved domain and refs on reopen.
- `CharacterDraftContext.test.tsx`: authoritative returned draft and saved domain
  preservation, including editing when provider subclass options are missing.
- `InteractiveCharacterSheet.test.tsx` and `SpellInfoDisplay.test.tsx`: saved refs
  without category/summary metadata; no category inference for unknown IDs;
  selected-domain equipment overrides permit finalization without borrowing
  options from another domain.
- `castFlow.test.tsx`: actual dock/target/hook path for Bless, Cure Wounds and
  Healing Word; exact declarations, ordered targets, provider slot/reason text.
- `clericStory.test.ts` and `useSessionEventStream.test.ts`: typed misses/effects,
  authoritative healing, live/catch-up ordering, deduplication and invalidation.

## Local live acceptance � 2026-09-13

Used the existing WSL Ubuntu checkout `/home/frank/projects/rpg-deployment` and
its `docker-compose.local-dev.yml`, isolated as Compose project
`cleric-bless-web` on port 8180. The successful API image revision is
`5b44fe69353af9bd1c7343f6f410e9b5c41f418e` (API #979), including toolkit
`rulebooks/dnd5e v0.165.1`. The host used stale-target policy `refuse`.
Runtime map assets came from the local `rpg-game-assets` provider into ignored
public folders; no private assets or runtime fixture state ship in this PR.

The previous API #976 probe was blocked by missing domain options and an
owner-data projection failure. API #979 and toolkit #1721 resolved those
blockers. The earlier `Mercy Blesscheck` draft had its domain seeded only for
diagnosis; it is not the native-creation evidence below.

A fresh `Mercy Dawncheck` was created entirely through the browser: Human,
Life Domain Cleric, provider cantrips/level-one spells, Sage, ability scores,
and the provider's Life Domain chain-mail equipment bundle. Saved selections
survived draft reload and the character finalized without seeding. This exposed
and verified the web fix that makes finalization use the selected domain's
choice overrides, matching the picker.

In The Raider Camp combat:

- Cure Wounds healed self from 4/10 to 10/10. Story showed six applied healing
  and the provider's roll/modifier breakdown. Slots changed from 2/2 to 1/2;
  provider availability prevented Healing Word on that same turn.
- On the next turn, Bless selected Skeleton first and Mercy Dawncheck second.
  Story preserved that order and showed both applied conditions. Slots changed
  to 0/2; the owner panel showed Blessed and Concentrating.
- Browser reload restored the same round, HP, equipment/AC, resources and
  concentration. The healing and Bless Story entries appeared once and retained
  target order. Ignored local evidence includes `bless-live.png` and
  `recovered-story.txt` under `evidence/cleric-runtime`.

Healing Word also passed through the browser in a second Raider Camp encounter
with the same native-created Mercy Dawncheck. As explicit disposable fixture
setup, only her level-one slots were refilled from 0/2 to 2/2 between encounters
because no rest endpoint is exposed. Her existing character record was backed
up; acquisition, HP, equipment and spell selections were preserved. This refill
is not evidence of a rest workflow. After ordinary combat damage reduced her to
1/10 HP, Healing Word restored 9 HP (provider roll 1d4 [3] + 3 spellcasting
modifier + 3 Disciple of Life), leaving 1/2 slots. Sacred Flame remained available
as an action, while other leveled spells displayed the provider's same-turn
restriction. Local evidence: `healing-word-live.png` and `healing-word-live.txt`.

## Acceptance boundaries

API #979 reports passing integration coverage for all three spells, resource
spending, both stale-target policies, mixed miss/effect ordering, and reload-host
live/Story equality. Browser coverage above does not independently reproduce a
stale-target race or `CastMissed` under either policy; web automated tests cover
the corresponding typed events and recovery behavior.

Knowledge Domain's extra skill/language choices remain separate provider work.
Prepared-spell workflows, domain automatic grants, and legacy-character spell
backfills are outside this change; web does not synthesize them. The Raider Camp
currently displays the existing �The Reference Tomb� chamber heading.
