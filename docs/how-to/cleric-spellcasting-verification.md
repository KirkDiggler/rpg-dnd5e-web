# Cleric web handoff verification

## Contract and implementation

The API handoff is `rpg-api/docs/how-to/cleric-bless-web-handoff.md`.
Web consumes generated protos `v0.1.189`, commit
`f97bcce04ae5585345da38954afd70007e794f37`, including protos #333.

The picker renders Cleric, provider domain options and base spell choices.
It retains saved domain/ref selections. If saved choices omit their category,
the summary consults the provider definition with the same choice ID; unknown
IDs do not become spells. Missing spellcasting metadata does not hide known
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
  without category/summary metadata; no category inference for unknown IDs.
- `castFlow.test.tsx`: actual dock/target/hook path for Bless, Cure Wounds and
  Healing Word; exact declarations, ordered targets, provider slot/reason text.
- `clericStory.test.ts` and `useSessionEventStream.test.ts`: typed misses/effects,
  authoritative healing, live/catch-up ordering, deduplication and invalidation.

## Local live probe — 2026-09-13

Used the existing WSL Ubuntu checkout `/home/frank/projects/rpg-deployment` and
its `docker-compose.local-dev.yml`, isolated as Compose project
`cleric-bless-web` on port 8180. API image revision:
`d1f7b2d7d3017f032fa635b2cf5dcfa30ddb851b` (contains API #976).
The host used stale-target policy `refuse`. Runtime map assets came from the
local `rpg-game-assets` provider into ignored public folders.

The browser selected Cleric, cantrips and level-one spells, saved/reloaded the
draft, and displayed its selected refs. Native UI finalization failed:
`draft is incomplete ... Divine Domain required`. `ListClasses` returned
Cleric with `subclasses: []`; `GetClassDetails` was unimplemented. The tested
API's class converter did not populate subclasses. This is a provider blocker,
not permission for web to invent domain options.

To continue probing, Life Domain was seeded via the API into only the disposable
`Mercy Blesscheck` draft. Spell selections were preserved using their provider
choice categories. The character then finalized through the UI and entered
Reference Tomb. The map and ordered join Story loaded. `GetCharacterData`
returned `[internal] character data unavailable`; only exploration controls
were exposed. This seeded probe is not a successful end-to-end creation test.

## Remaining acceptance

1. Provider must expose selectable Cleric domains compatible with finalization.
2. Investigate private character data failure and obtain a combat encounter
   offering the character's cast declarations.
3. Repeat native creation without seeding; cast Bless, Cure Wounds and Healing
   Word with real resources, targets and effects, then reconnect/recover Story.
4. Exercise stale targets against both host policies (`refuse` and `attempt`),
   including authoritative miss/effect/resource results. Neither policy has
   received a successful live casting acceptance pass here.

Prepared-spell workflows, domain automatic grants, and legacy-character spell
backfills remain separate provider work; this web change does not synthesize them.
