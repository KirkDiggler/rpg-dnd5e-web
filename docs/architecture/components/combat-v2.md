---
name: production session combat experience
description: Shared CombatExperience renderer, exact declarations, private character data, event recovery, and presentation gating
updated: 2026-09-08
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

## Responsive desktop bar

`SessionEncounterView` measures its actual content container through
`useDesktopHotbarFrame`: width at least 1000px and height above 500px selects
one shared desktop opt-in for the adapter, controller and feedback. Smaller or
unmeasured containers retain the compact organizer. The canvas stays at the same
React position; changing interaction mode cancels pending selection without an
RPC or scene remount.

`liveActionPresentation` joins exact known-spell and feature refs to current
provider declarations. Unclassified offers stay visible; unknown spell kinds
stay in Other spells. Empty categories do not mount, while unavailable offers
remain. Artwork is an independent exact-ref/verb presentation lookup; runtime
PNG bytes come from private `rpg-game-assets`, never the public web repository.
No inventory entry or class/level inference mints an action.

`DesktopActionSurface` keeps 1–4 balanced rows and overlapping final pages.
Free-roam desktop uses the same offers-plus-footer composition as combat;
its movement hint and map utilities live in that footer rather than separate
banner/control rows. Compact callers retain their exploration panel.
Favorites are disabled unless a concept explicitly supplies `desktopFavorites`;
the live slice has no stars, edit mode or preference storage. The fixed Status
area keeps private-state absence/freshness explicit. Action inspection renders
provider base information even with no effects and adds contextual effect rows
when present. No unrelated attack supplies an idle inspection context.

`buildActionTooltip` reads `Declaration.information.description` and its ordered
label/value details verbatim, before the existing typed damage-type, cost and
target facts. The UI never parses damage notation, infers a description from a
name, or combines contextual effects into a total. Missing text is explicitly
marked; missing metadata does not change availability. Repeated detail labels
remain separate ordered rows.

`ActionInformationContent` shares that base-first body across desktop, compact,
pinned and target inspections. Candidate answers remain tied to their action;
target-held effects are still a separate list. A compact hover card accepts the
pointer for scrolling, and keyboard focus can pin it without selecting. Its
position clears the measured collection menu, while dimensions stay bounded by
the owning frame. Provider refreshes replace the text under the same current ID.

The desktop action reader retains its named offer during pointer travel across
empty space, so even a far-right icon's long text can be reached and scrolled.
Another offer replaces it; withdrawal removes it. Close/Escape dismisses only
information and returns focus to the action sections. Outside presses and other
dock-control hover/focus dismiss it without swallowing their input. Opening
never takes focus or dispatches a command; no invisible map-wide hover shield or
timed transit window is used.

Cast and reaction choices show `CastOption.description` before commitment,
outside the action button so stale/disabled controls do not dim their explanation.
Compact option lists scroll under width pressure; their bounded description
regions are keyboard-focusable and cannot submit. Only the original option ID
is sent on deliberate selection. Reaction information and End Turn descriptions
also use the provider fields, without changing the existing execution gates.

The UI consumes these optional fields; field support in the SDK does not prove
that a running provider populates them. Provider delivery and gameplay gaps are
tracked through rpg-project#543 rather than patched with client-side rules.

`CombatExperienceStoryExchange.deliverySource` carries live/catch-up provenance
through the existing story/pacing projection. Temporary desktop notices consume
only newly released live entries; initial/recovered/unknown-provenance entries
remain history-only. The log starts closed on desktop. Notice expiry never
removes retained history, and a stream-state flag cannot turn background
recovery into a new announcement.

## Authority and actions

`useSessionAfford` retains generated nested `Declaration[]` unchanged. An
Attack declaration carries its full `AttackRef`, `target_kind`, candidate rows,
independent declaration/candidate availability, provider `why.text`, and opaque
`id`.

Selection and dispatch share one current-offer boundary:

1. the player selects an available authored Attack;
2. that exact declaration becomes armed;
3. `SessionCanvas` receives rings/click routing for only that declaration's
   available candidates, while `TargetSurface` supplies equivalent semantic
   target controls using public-roster names (an optional synchronized list on desktop);
4. either an available canvas ring or target button echoes the exact declaration
   ID and member target.

The compact targeting panel sits below the room label. Desktop targeting uses
a strip above the toolbar, with selected-member chips and an optional list.
Both cap long content and keep inspection separate from command execution.

While a member-targeted action is armed, the existing canvas hover identity also
opens a read-only target-effect peek. It resolves an exact unique current
candidate, including unavailable candidates; it never changes selected IDs or
calls choose/confirm. The preview shows the selected action's supplied base facts first, then
observed target-held rows and the actor's target-specific answers, keeping the
two effect lists separate. `ActionInformationFacts` shares verbatim base rows
with the full action card; no target-adjusted damage total is derived. Empty
rows mean no supplied information, not a condition-free creature.

Opening a peek takes no focus and sends no intent. Its scrollable surface is
pointer-reachable and keyboard-focusable: clicks and wheel gestures belong to
that reader, not the map underneath. The last named candidate stays visible
while the pointer crosses empty space or a non-candidate on its way to the
panel. Close preview/Escape dismisses information, not the armed action. The
peek still stays out of the way of other dock-control inspections. List/chip
mouse or pen entry and keyboard focus use the same candidate lookup. Explicit
Info controls open and focus the existing scrollable full reader; that reader
keeps its named target until closed or changed. Close/Escape clears inspection,
not the action or its picks. Withdrawn/ambiguous candidates and action changes
cannot retain another target's old rows. No new provider read or wire field is
introduced by this UI path.
Desktop multi-member CAST selection toggles map/list/chip picks; reaching the
provider maximum never casts. Separate confirmation echoes the ordered members
and chosen option. Re-clicking an armed multi-target icon preserves its picks;
`onChangeCastOption` is a separate controller intent that reopens the current
option tray and clears prior picks only after current-offer/scope checks. Both
initial selection and explicit option replacement use the same tray-opening
boundary. Scalar verbs retain their scalar protocol; unsupported list
shapes fail closed. The controller fences callbacks by selection epoch and
session/member/mode so cancellation or replacement cannot resurrect old intent.

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

At session-scene entry, `LocalWorldDieWarmup` primes the existing dice asset
provider and Rapier's own initialization cache. Its empty physics world is
paused and released after initialization; no die, outcome, or roll command is
created. A real attempt still owns its scene/collider snapshot and readiness.
Both warmup and attempt have local Suspense boundaries so a cold or overlapping
load cannot hide the dungeon. Warmup is best-effort: asset failures remain in
the provider snapshot, and actual physics failures report the existing die
failure terminal rather than replacing the game screen.

The presentation reducer keeps recipient-local Story ordering while the
provider's opaque `presentation_id` names one shared d20 across phases and
recipients. An identified RollWindowOpened already supplies the rolled face to
the existing actor/witness dice path before Struck/Missed; its missing target
and outcome fields remain absent, not a fabricated miss. The paired response
can fill in known attack facts. A later same-ID outcome retains settlement and
retires provisional target holds instead of requesting another d20. Legacy
ID-less windows remain in their separate Story identity beside the response.
Stable public-roster roles and names are the only dice/Story identity authority; Turn participants never
supply or overwrite identity. Unknown roles remain unresolved with no inferred
ownership, and late roster facts may authorize them. Once a local player roll
is armed, FightEnded or a transient empty participant/roster snapshot cannot
revoke or auto-settle it. The acting player sees no current Story verdict,
result, or live announcement until the authoritative d20 presentation is
explicitly released. A local live RollWindowOpened choice uses its own token
(or the paired legacy response token) and stays on a no-timer gate until that `presentation_id` reaches
its visible terminal; stale terminals cannot open it. The same gate conceals
that window's Story entry and its tail via the existing Story suffix helper,
so the log cannot reveal the roll before the choice does. Event-first and
response-first arrivals converge, while catch-up/reconnect, semantic fallback,
explicitly non-physical presentation, and a lost response do not wedge the
provider's answerable window. Other known players, monsters, and catch-up
history auto-settle. Conflicting facts fail closed; raw payload bytes never
become Story. Player-facing attack Story/result presentation shows the provider roll,
the display-only difference between provider roll and total, and provider total
as `d20 + modifier = total`; it omits target AC while raw Debug retains the
provider `against` field. A resolved Struck result also labels authoritative
advantage/disadvantage source refs and source members against the event's exact
attacker/target relationship. Missing source facts remain absent rather than
being inferred. Target `hpAfter` and peer exact HP are never shown. The existing
local die pickup control shares the bottom-left personal-tray position rather
than floating beside the upper-right Story rail.

Remaining #996 scope: no persistent pre-attack True Strike target marker or
advantage/disadvantage preview is provided here. The pinned active
`ConditionView` has ref/name/detail/source member but no affected-target field;
a historical Cast target alone does not establish current eligibility. Resolved
Struck attribution is not a substitute for this marker, and Missed currently
has no modifier-source arrays. Do not infer live eligibility from display prose
or duplicate the toolkit's condition rules in the client.

Story is always available in production. The whole log can collapse to a
small tab without stopping ingestion; reopening preserves its selected mode,
reading position, and disclosure state. Focus moves to the visible toggle.
Raw Debug ingests immediately but renders only in development or on an
explicitly enabled Concepts diagnostic surface. The existing capped feed holds
immutable typed event snapshots plus plain diagnostics, not a second event
store. Compact rows expand inline and lazily format protobuf JSON with colored
tokens and Copy JSON; clicking or keyboard-focusing the JSON widens only Debug
to at most 640px, capped by its containing frame and viewport. The width control
restores compact Debug without toggling width during text selection; Story keeps
its original width. uint64 values remain strings and bytes remain base64.
Opaque payload bytes are not decoded as game facts. Opening an entry pauses
auto-follow so new receipts do not pull it away. Plain diagnostics remain
visible even when they have no JSON. Debug uses `aria-live="off"`; only Story
owns the polite live log.

## Scope reset

`SessionEncounterView` keys its mounted production scope by
session/member/authenticated-player. Selection, presentation, Story/Debug,
equipment-open state, private data,
timers, and callbacks therefore reset synchronously. Controller and query
generations fence late completions and stale map callbacks. ENDED closes
Equipment immediately and announces the ending through `RunEndedToast` (#1001).
The camera and Story/Debug stay readable; gameplay verbs are blocked at their
own call sites rather than making the whole game surface inert.
