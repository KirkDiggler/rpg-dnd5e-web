# Session Combat Experience Concept Design

## Purpose

Build a fixture-first Concepts Lab proposal for the session-based encounter route. The concept proves whether a new player can understand their character state, choose a server-offered action, target it, explicitly roll the authoritative d20 result, read the outcome, and end the turn without opening the raw debug feed.

This is a local design proposal, not production combat wiring. It must not add client-side legality calculations or claim that provisional fixture fields already exist on the session wire.

## Composition

The review frame is a 1280×800 gameplay surface with five stable regions:

1. A compact initiative ribbon at the top center shows round, ordered participants, active participant, and standing/downed state.
2. The production `SessionCanvas` remains the dominant center surface, rendering the existing 224-cell reference-tomb fixture, real floor/wall/prop/entity components, movement previews, and server-declared candidate targets.
3. A two-row adventurer dock spans the bottom. Its first row shows identity, HP/AC, movement, three economy shapes, and active feature/condition badges. Its second row shows server-offered actions grouped as Core, Features, Spells, and Items, with End Turn visually separated as the consequential commit.
4. A lower-left dice drawer is compact during ordinary play and expands when a roll-bearing action has a concealed authoritative result waiting for explicit Roll or grab/release.
5. A right-side Story log groups related events into readable exchanges. Debug remains available as a separate developer view and preserves one raw line per event.

At the Concepts Lab level, a control strip switches review fixtures and enables contract annotations without becoming part of the gameplay composition.

## Interaction

The map center is reserved for transient orientation: “Your turn” flashes there for 1.8 seconds and disappears. Persistent targeting, roll, and result guidance stays in a compact context surface along the dock edge so it does not obscure the encounter.

Targeted actions use a panel-first flow. Selecting an action arms it and highlights only candidates supplied with that offer. Clicking a candidate requests that exact offer/target pair. A direct map click may use a default action only when the fixture explicitly marks the choice unambiguous; the client never selects among rules-equivalent offers itself.

A roll-bearing action enters `awaiting-roll` after its authoritative result is available to the presentation adapter but remains concealed from the player. The dice drawer expands and waits indefinitely for explicit Roll or grab/release. The existing `DiceTrayPresentation` boundary owns the tactile ritual and settles to the server result. The gesture changes presentation only.

After release, the Story log appends or reveals the grouped exchange. End Turn remains enabled or disabled from fixture-provided state and never from client inference.

## Fixture contract

The concept uses a deliberately provisional `SessionCombatFixture` rather than coercing the existing session `Declaration` into facts it cannot express. Every provisional field is labeled in the contract inspector.

The fixture carries:

- viewer identity and combat vitals;
- active features and conditions as display-ready references with source and optional resource text;
- initiative participants;
- action offers with stable offer ID, action reference, display label, source group, cost presentation, availability, target mode, server-declared target candidates, and optional roll presentation kind;
- chronological story exchanges made from structured facts, not authored prose;
- raw debug lines for the developer view; and
- a field-source manifest classifying each field as `session-wire`, `existing-other-wire`, `presentation`, or `provisional`.

The concept must not turn these provisional names directly into proto messages. Its final contract report translates only fields the approved interaction actually uses.

## States

The first proposal includes these review states:

- fresh player turn with active conditions and multiple actions;
- targeted Attack armed with valid and unavailable candidates;
- authoritative attack result awaiting explicit dice release;
- settled hit with a grouped roll/damage/condition exchange;
- action spent while movement and a bonus action remain;
- another participant's turn;
- free roam; and
- reconnect/catch-up with Story restored and Debug still complete.

## Accessibility and responsive behavior

All action and target controls are native buttons with visible focus. Armed state, active turn, unavailable reason, dice status, and new Story entries have semantic text in addition to color or shape. Reduced motion flows into the existing dice presentation. At the 1024×768 floor, side surfaces become narrower overlays and the action row may overflow horizontally; actions are never silently removed. Below that floor is diagnostic only for this concept.

## Testing and visual evidence

Component tests pin the five-region structure, server-offer-driven targeting, explicit dice release, Story/Debug separation, fixture states, and contract annotations. Existing dice tests remain the authority for settlement and gesture behavior. Focused tests run after every pass, followed by the full repository suite and `npm run ci-check` before any completion claim.

Visual review uses the reproducible deep link `?concept=session-combat` and screenshots at 1280×800 and 1024×768. Each visible pass is captured before the next is layered on.

## Non-goals

- Production SessionService or character-service wiring.
- Proto, API, or toolkit changes.
- A production dice transport, ownership, or reconnect protocol.
- Client calculation of action legality, targeting, reach, cost, damage, conditions, or outcomes.
- Damage-dice presentation before authoritative individual die results exist.
- Replacing the raw debug feed.
