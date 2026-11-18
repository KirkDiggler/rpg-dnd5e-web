# Run — 2026-11-17 — studio today S9 forms (B): a line's requirements and its advance

Slice [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975) of story [rpg-project#966](https://github.com/KirkDiggler/rpg-project/issues/966), PR B of four. It is stacked on PR A ([rpg-dnd5e-web#1446](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1446), branch `studio-forms-row-grants`). Shapes read from rpg-toolkit `origin/main` [`bb5806f7`](https://github.com/KirkDiggler/rpg-toolkit/commit/bb5806f7) `dungeonspec`:

- `spec.go`: `OptionSpec.Requires`, `AdvanceSpec`;
- `predicate.go`: `PredicateSpec`, `InteractionPredicateSpec`;
- `grammar.go`: `optionRequirements`, `optionRequires`, `interactionRequirement`, `optionAdvance`;
- `interactions.go`: `interactionShapes`, `grantedTopicsOf`.

## Shipped

- A line's **requirements** are edited as a list, every one of which must hold. Each item is a fact the speaker knows, a prop they carry, a conversation in one or more of its states, or the one spoken to recognising the speaker, or "Unless" one of those — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
- A line **advances** a conversation: the conversation, the beat a win steps it on, and the beat a miss does — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
- `SiteNamesContext` now also offers the site's conversations, each with its recipe's states and the beats it listens for (`recipeBeats`) — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
- The "Requires … — edit these in the file" note is gone, and so is the single-choice picker that produced it (`REQUIRES_CHOICES`, `requiresChoice`, `requiresId`, `requiresOf`) — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).

## Decided

- The form prevents what the engine refuses:
  - conversation states and beats are offered from the recipe only;
  - a state list never empties: the last ticked state cannot be unticked;
  - no recognition requirement on a prop's line;
  - no miss beat on a plain line, unless the file already wrote one;
  - an advance always steps on at least one beat: a new one starts on the recipe's first beat, and the only beat set cannot be cleared to None.

  — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).

- A recognition requirement offers every topic the file mentions, not only the granted ones. Which topics a conversation grants is partly the engine's own rule: an arrest grants `arrested` and `wanted` (`encounter.CheckInteraction`). Restating that rule in the studio would be a second voice, so a topic nothing grants is refused at its field in the engine's words — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
- The author's spelling is kept. One requirement stays a mapping, and becomes a list when a second is added; a list stays a list, even with one item — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
- Part A's "Also held by the conversation's carriers who witness it" enables as soon as the line advances or requires a conversation — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
- A new requirement starts complete: "Add a requirement" and "The speaker knows a fact" start on the first fact the file mentions (`SiteNames.facts`, every `fact: <id>` the file writes), and a conversation requirement is offered only on a site with a conversation. Only a site that mentions no fact at all starts the fact field empty, and then the engine's refusal (by line, and the studio's "must name an id") stands until one is typed — that case is honest free text, not prevention — [rpg-dnd5e-web#1447 review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1447).

## Found

- The engine reads the topics an interaction grants from `encounter.CheckInteraction`, which includes the arrest's topics, not only its `recognize` outcomes — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).

## Mistaken

- The first cut claimed every refusal was prevented, but a new requirement and the "knows a fact" choice wrote `{fact: ''}`, and a conversation requirement was offered on a site with none — [rpg-dnd5e-web#1447 review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1447).
- The first expected YAML replaced the first `requires: holds: purse` in the castle, which belongs to another creature. The expectation now anchors on the scullion's own line — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
