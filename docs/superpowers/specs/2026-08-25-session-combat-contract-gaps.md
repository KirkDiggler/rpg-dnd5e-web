# Session Combat Concept — Observed Contract Gaps

This report records only data the rendered `?concept=session-combat` interaction actually consumes. It does not prescribe proto message names yet.

## Current session wire already sufficient

- Round, initiative order, active participant, display name, member kind, and standing from `TurnResponse.participants`.
- Remaining movement from the `MOVE` declaration.
- Per-target melee reach, affordability, slot, and shortfall from current `ATTACK` declarations.
- Attack d20, total, defense, hit/miss, critical, damage, attack reference/name, and damage type from `AttackResponse` and typed `Struck`/`Missed` event bodies.
- Turn transitions and catch-up ordering from typed events, sequence, and `GetStory`.
- Raw event fields for the Debug feed.

## Existing non-session wire reused by the concept

- Character identity, level, class, hit points, maximum hit points, armor class, and speed from existing character reads.
- Equipment and inventory from the existing character equipment surface.

The production design must decide whether the session route continues composing these owner-authorized character reads or receives a session-owned private-self projection. The concept does not decide that ownership seam.

## Presentation-only state; no rules contract needed

- Story grouping, typography, expansion, and Story/Debug preference.
- The transient turn-start announcement and dock-edge context guidance.
- Whether the dice drawer is compact or expanded.
- Local raw pointer samples and decorative throw choreography.
- Condition/action icons and visual tone keyed by authoritative references.

## Missing provider contract proven by the concept

### General action offers

Current `Afford` is closed to `ATTACK` and `MOVE`. The dock needs a generalized server-authored executable offer carrying:

- stable offer identity for dispatch and correlation;
- open action/feature/spell/item reference;
- display label or a reference resolvable through an authoritative catalog;
- source grouping (`Core`, `Features`, `Spells`, `Items`) or equivalent provenance;
- server-authored cost presentation;
- availability and structured shortfall;
- target mode;
- server-declared target candidates and per-candidate shortfalls; and
- whether the resulting presentation includes an authoritative roll ritual.

The client must not derive any of these from class, level, inventory, or action names.

### Active features and conditions

The session route cannot currently render the concept’s active-effect rail from session state. It needs display-ready references for active features/conditions plus only the state a player may observe, such as source, remaining uses, duration, or concentration relationship where those facts exist. Private and public state must remain distinct.

### Dice presentation coordination

The d20 face is already authoritative in attack facts. Production multiplayer presentation still needs:

- one presentation identity correlated with the authoritative attack;
- authoritative equipped dice-preset projection before arming;
- one compact release signal for witnesses;
- reconnect/catch-up behavior that settles rather than replays stale choreography; and
- a non-stalling fallback when coordination is missing.

The release signal must not carry or alter the d20 result.

### Story correlation beyond one self-contained attack event

`Struck` and `Missed` already contain enough facts for one grouped attack exchange. Future multi-event outcomes—condition application/removal, reactions, saves, damage components, and damage-dice groups—need stable authoritative correlation if they are to appear as one Story exchange without client inference. Empty correlation remains legal today, so the provider must either strengthen it for these interactions or emit a self-contained typed outcome.

## Explicitly not requested by this concept

- Client-side reach, cost, target, hit, damage, feature, or condition calculations.
- Individual damage dice before authoritative faces exist.
- A replacement for the exhaustive raw event feed.
- A new map contract; the existing reference-tomb atlas renders through production `SessionCanvas` unchanged.
