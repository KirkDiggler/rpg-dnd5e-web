---
name: production session combat experience
description: Shared CombatExperience renderer, exact declarations, private character data, event recovery, and presentation gating
updated: 2026-08-26
confidence: high — production and concept import the same renderer; focused route/controller/recovery suites pass
---

# Production session combat experience

The production session route and `?concept=session-combat` now render the same
production-owned tree under
`src/components/session/combat-experience/`: `CombatExperience`, `ActionDock`,
`TargetSurface`, `StoryLog`, and `DiceDrawer`. The concept supplies generated
fixtures and review controls; `SessionEncounterView` supplies live provider
hooks and `SessionCanvas`. There is no concept copy and no production-only
combat panel renderer.

This supersedes two older surfaces:

- `src/components/combat-v2/`, deleted in game-screen rebuild slice 3 (#447);
- the later session-local `CombatPanel` / `useCombatPanel` / `combatPanel.ts`,
  its `DeclarationRow` expansion shim, direct-floor Attack flow, old TurnHud,
  and separate DebugCombatLog. Those files are deleted in #817.

## Authority and actions

`useSessionAfford` retains generated nested `Declaration[]` unchanged. An
Attack declaration carries its full `AttackRef`, `target_kind`, candidate rows,
independent declaration/candidate availability, provider `why.text`, and opaque
`id`.

Attack is panel-first in the first production cut:

1. the player selects an available authored Attack;
2. that exact declaration becomes armed;
3. `SessionCanvas` receives rings/click routing for only that declaration's
   available candidates, while `TargetSurface` renders the equivalent semantic
   list of native target buttons using public-roster names;
4. either an available canvas ring or target button echoes the exact declaration
   ID and member target.

Unavailable candidate buttons are disabled, stay readable with provider
`why.text`, and remain absent from canvas rings. Keyboard and screen-reader
players therefore have the same panel-first target authority. They cannot
dispatch. A map click with no armed action never attacks. Multiple offers are
never auto-selected. End Turn echoes its own unique available declaration.
Selectors are compared and echoed only; they are never parsed or constructed.
Dispatch also validates each generated target shape: Attack requires MEMBER,
turn-clock Move requires PATH, and End Turn requires NONE. A malformed shape,
empty selector/member, unavailable fact, duplicate, or missing candidate never
dispatches.

Movement keeps the atlas path/request and authoritative response-step animation.
Authority is fail-closed: WORLD/WORLD supplies the exact empty selector;
TURN/TURN requires one available non-empty PATH Move declaration; partial,
mismatched, missing, ambiguous, stale, and failed snapshots lock the path
preview and are not ready. WORLD/WORLD remains unlocked only while both
snapshots are fresh. `remaining` is rendered as provider display context only.
The web performs no feet-to-cell or path-price calculation.

Turn and Afford keep last-good display separately from execution freshness.
Every invalidate/refetch revokes `fresh` immediately; only the newest successful
request for the current key restores it, while errors and reversed/stale
responses remain false. Each delivered event sequence revokes both before the
coalesced refresh starts. A successful Move response also revokes both and
queues the coalesced Turn/Afford refresh immediately, before response-step
animation or MOVED delivery; Where reconciliation remains animation-timed. Old
declarations may remain visible with an explicit stale marker, but Attack, Move
preview/dispatch, and End Turn stay disabled. A selector-bearing
FAILED_PRECONDITION uses one recovery path for all three verbs: clear selection,
revoke authority, show `That option changed; review your current actions.`,
refresh Turn+Afford, append only refreshed provider `why.text` when present, and
never auto-retry. Any other Attack or End Turn failure is an ambiguous mutation
outcome: retain its honest error, clear selection, revoke Turn/Afford, reconcile
the same authoritative snapshots as success, and never retry the command.

## Public identity and private status

The public session roster supplies names, member kind, and body refs used by the
map, target list, and explicit shared-dock viewer name/class on both world and
turn clocks. A missing viewer roster row renders `You` / `Adventurer`; neither
Turn participants nor private CharacterData may substitute identity. The route
no longer calls v1alpha1 `GetCharacter` for the local model, HP, or level.

Authenticated-owner `useCharacterData(characterId, playerId)` supplies exact
level, HP, base speed, AC display, equipment, features, conditions, and
resources. Session, character, and authenticated player all participate in the
synchronous private scope; changing owner with the same session/character
clears prior private value/error before an owner-gated reread. It keeps the last
confirmed value on background failure, records invalidation while a read is in
flight, and performs one serialized trailing owner snapshot. That last
confirmed private value remains visible with a stale warning while newer public
door/path state is published.

An initial private loading/failure never blocks atlas, position, roster, Turn,
Afford, Story, or map interaction. The shared dock renders a retryable private
status area and omits private badges/equipment until CharacterData succeeds.
Key changes and authoritative mutation replacement cancel the read and any
trailing pass. EquipItem and UnequipItem success replace the cache directly
with the complete response `CharacterData`; the web does not recompute slots,
AC, damage, HP, or resources.

## One event funnel and recovery

`useSessionEventStream` sequences live StreamEvents and GetStory entries through
one monotonic gap-aware lane. Every delivery includes `live` or `catchup`
provenance. Initial connection, reconnect, observed gaps, the five-second
terminal poll, focus, visibility, and aged-out from-zero recovery use that same
serialized lane.

`SessionEncounterView` then applies each delivered event in this order:

1. synchronously revoke Turn/Afford execution freshness, then schedule the
   immediate, burst-coalesced CharacterData/Turn/Afford/View/Where (plus
   roster/door) refresh; passes are serialized and invalidations observed
   during one pass force one immediate coalesced trailing pass;
2. ingest raw Debug and authoritative typed presentation facts;
3. advance presentation-only other-member pacing;
4. apply door notice and run-ending route handlers.

Query/state reconciliation is never delayed for animation. The existing
`monsterBeatQueue` semantics pace only another member's live Story cursor;
catch-up history settles immediately. Self-MOVED refreshes Where, other-member
movement refreshes View, JOINED pulls roster identity, door events pull live
door state, and ENDED preserves the run outcome overlay. Disposed/key-stale
schedulers and queued timers are generation-fenced before every flush; Turn
also fences reversed responses and key changes like Afford.

## Story, dice, and diagnostics

The presentation reducer keys authority by `(session, seq)` and reconciles
AttackResponse with typed Struck/Missed events. Stable public-roster roles and
names are the only dice/Story identity authority; Turn participants never
supply or overwrite identity. Unknown roles remain unresolved with no inferred
ownership, and late roster facts may authorize them. Once a local player roll
is armed, FightEnded or a transient empty participant/roster snapshot cannot
revoke or auto-settle it. The acting player sees no current Story verdict,
result, or live announcement until the authoritative d20 presentation is
explicitly released. Other known players, monsters, and catch-up history
auto-settle. Conflicting facts fail closed; raw payload bytes never become
Story. Result presentation contains only provider roll, total, against,
hit/critical, damage/type, and AttackRef facts—never a bonus equation, target
`hpAfter`, peer exact HP, or client arithmetic.

Story is always present in production. Raw Debug ingests immediately but is
rendered only in development or on an explicitly enabled Concepts diagnostic
surface. The closed/open Debug feed uses `aria-live="off"`; only Story owns the
polite live log.

## Scope reset

`SessionEncounterView` keys its mounted production scope by
session/member/authenticated-player. Selection, presentation, Story/Debug,
equipment-open state, private data,
timers, and callbacks therefore reset synchronously. Controller and query
generations fence late completions and stale map callbacks. ENDED closes
Equipment immediately, marks the preserved game surface inert and hidden,
layers the correctly labelled `aria-modal` dialog above every panel, and focuses
its Leave action so underlying pointer/keyboard actions cannot fire.
