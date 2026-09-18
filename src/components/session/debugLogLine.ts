/**
 * debugLogLine — turns one stream `Event` into one line of the debug
 * combat log (rpg-dnd5e-web#740, rescoped 2026-08-23: "render everything
 * on the wire, raw"). Framework-free pure function, same split every
 * other selector on this route keeps (`combatBeat.ts`, combat experience).
 *
 * # Debug, not Story
 *
 * This is deliberately the OPPOSITE discipline from `combatBeat.ts`'s
 * `formatBeat`: that module renders prose ("Skeleton hits you — 23 vs AC
 * 14, 11 slashing.") and returns `null` for kinds it doesn't narrate
 * (`moved`, `turnEnded`). This module renders EVERY event, one line each,
 * with every raw field the typed body carries — `moved`'s exact
 * coordinates, `struck`/`missed`'s roll/total/against/damage/attack ref
 * verbatim, `fightStarted`'s full initiative order — because the debug
 * log's whole reason for existing (Kirk's ruling, rpg-project#202 design
 * §4a) is "the pipeline should flow all the things," including the
 * beats Story mode intentionally hides.
 *
 * # `seq`/`at`, not a wall clock
 *
 * `Event.at` is "the world's clock reading... not a wall time" (its own
 * doc comment) — labeled `clock=` here, never `time=` or `@`, so nobody
 * reads it as when the event actually arrived at this browser.
 *
 * # Names, with the id preserved for hover
 *
 * Every member id renders as its resolved display name (`names`, the
 * same `participantNameMap`-built lookup `combatBeat.ts` reads) rather
 * than the raw id — a debug log a human has to read benefits from names
 * exactly as much as the Story one does. The raw ids used by this line
 * are returned separately (`ids`) rather than embedded as HTML, so the
 * caller can put them in a `title` attribute for "id on hover" (issue
 * #740's own ask) while `text` itself stays one clean, select-all-and-
 * copy-able string.
 *
 * # Unknown bodies render their JSON
 *
 * Two situations reach the `default` branch: a kind with no typed body
 * member at all (`ENDED`, `SCENE_OPENED`, `TICK`, and the wire's own
 * `UNKNOWN` — "delivered on purpose rather than dropped so
 * the recipient still learns its sequence advanced", `EventKind.UNKNOWN`'s
 * own doc comment; catch-up entries are ordinary typed `Event`s same as
 * live ones since rpg-api-protos v0.1.135, so `UNKNOWN` here is never a
 * catch-up artifact — see `useSessionEventStream.ts`'s own doc comment),
 * and a FUTURE typed `body` case this switch doesn't recognize yet. Both
 * render `kind=<name> body=<JSON>` — the typed body's own decoded `.value`
 * (never `Event.payload`, which stays exactly as forbidden to decode
 * here as everywhere else on this route) or `null` when there is none.
 * `JSON.stringify` on an already-decoded protobuf message is safe EXCEPT
 * for a `bigint` field, which it cannot serialize — none of today's
 * bodies carry one, but the `catch` fallback keeps a hypothetical future
 * one from crashing the whole log instead of one line.
 */
import type {
  AnswerCandidate,
  DamageComponent,
  Event,
  RollCalculation,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  AnswerKey,
  AnswerWord,
  EventKind,
  Temper,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  DamageType,
  DissolveKind,
  DoorState,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  formatDebugDamageComponents,
  formatDebugRollCalculation,
} from './combat-experience/rollTrace';

/** One rendered debug-log entry. `text` is the full line, ready to
 * display and select-all-copy verbatim; `ids` are the raw member ids
 * this line named, for the caller to surface on hover (never embedded
 * in `text` itself — see module doc comment). */
export interface DebugLogLine {
  seq: bigint;
  text: string;
  ids: readonly string[];
}

/** A retained raw event and its presentation labels, in the existing bounded feed. */
export interface DebugEventEntry {
  readonly id: number;
  readonly summary: string;
  readonly text: string;
  readonly event: Event;
}

/** Plain diagnostics/legacy fixtures have no structured event to inspect. */
export type DebugFeedEntry = string | DebugEventEntry;

function displayName(names: Map<string, string>, id: string): string {
  return names.get(id) ?? id;
}

/** JSON string quoting keeps provider-authored text lossless and on one framed
 * Debug line while preserving the existing `"ordinary"` representation. */
function quoteDebugString(value: string): string {
  return JSON.stringify(value);
}

function positionText(position: { x: number; y: number } | undefined): string {
  return position ? `(${position.x},${position.y})` : '(?,?)';
}

/** Formats the shared `attack.ref=... attack.name="..." type=...` suffix
 * `struck`/`missed` both carry — verbatim, never reworded. */
function attackText(
  attack: { ref: string; name: string; damageType: DamageType } | undefined
): string {
  if (!attack) return 'attack.ref=? attack.name=? type=?';
  const typeName = DamageType[attack.damageType] ?? String(attack.damageType);
  return `attack.ref=${attack.ref} attack.name="${attack.name}" type=${typeName}`;
}

/**
 * The whole roll behind a check beat, and the entities that decided it.
 *
 * THE DEBUG LOG IS WHERE THE DIE LIVES (R1). The story shows the outcome and
 * the creature's line; this is where a builder reads what was actually thrown
 * against what. A check beat that printed only `dc total beaten` would be the
 * single settled number this slice exists to remove — and it would look
 * finished, because the story half already shows the faces.
 *
 * ABSENT MEANS ABSENT, the same presence law the api keeps: a beat written
 * before the field existed has no calculation, and a door nobody rolled for
 * never had one. Neither gets an empty `calculation=` to puzzle over.
 */
function checkCalculationText(
  calculation: RollCalculation | undefined
): string {
  if (!calculation) return '';
  return ` calculation=${formatDebugRollCalculation(calculation)}`;
}

/**
 * The entities behind a keep record, for the line's hoverable ids — whose
 * Help, whose rule. Same list `struck` already contributes.
 */
function keepSourceIds(calculation: RollCalculation | undefined): string[] {
  const keep = (calculation?.components ?? [])
    .map((component) => component.dice?.keep)
    .find((record) => record !== undefined);
  return [...(keep?.granted ?? []), ...(keep?.imposed ?? [])]
    .map((source) => source.sourceId)
    .filter((id) => id !== '');
}

function strikeDetailText(
  damageComponents: readonly DamageComponent[] | undefined,
  calculation: RollCalculation | undefined
): string {
  const components = damageComponents ?? [];
  const segments: string[] = [];
  if (components.length > 0) {
    segments.push(`components=${formatDebugDamageComponents(components)}`);
  }
  const detail = segments.length === 0 ? '' : ` ${segments.join(' ')}`;
  // THE SAME ONE MECHANISM the check beats use. This used to render the keep
  // itself, off the beat rather than off the trace, which was a second
  // spelling of one fact — and the attack's own d20 faces were nowhere in the
  // line at all. `debugDiceTrace` carries the keep now, so the whole roll
  // arrives with it.
  return `${detail}${checkCalculationText(calculation)}`;
}

/** `key=` and `temper=` render by their enum NAMES, like every other enum on
 * this line. Unknown falls back to the raw number rather than to a word: a
 * debug log inventing a spelling for a value it does not know is exactly the
 * thing this log exists not to do. */
function answerKeyName(key: AnswerKey): string {
  return AnswerKey[key] ?? String(key);
}

function temperName(temper: Temper): string {
  return Temper[temper] ?? String(temper);
}

/** Whether a key had a verb and a check behind it — which is the whole
 * question `verb` and `beaten` answer (rpg-project#465).
 *
 * THE PAIR IS DEPRECATED AND UNSET ON A TIME PICK, and printing it anyway
 * would render `verb=UNSPECIFIED beaten=false` about a creature that simply
 * took its turn — a sentence about a threat that never happened. The server
 * leaves both unset there by contract; this line leaves them out. */
function answerKeyIsSocial(key: AnswerKey): boolean {
  return (
    key === AnswerKey.INTIMIDATED ||
    key === AnswerKey.INTIMIDATE_FAILED ||
    key === AnswerKey.PERSUADED ||
    key === AnswerKey.PERSUADE_FAILED
  );
}

/** THE LOADED TABLE AS ROLLED, one pair per eligible entry:
 * `entry:weight×percent=loaded`.
 *
 * EVERY NUMBER THE ROLL WAS MADE OF, which is the whole point of carrying
 * candidates rather than the total alone — add the `loaded` values and you get
 * `of`, and the face lands in exactly one of them, so a reader can redo the
 * engine's arithmetic instead of trusting it. `percent` is the temperament's
 * multiplier, so a coward's halved line reads `2:1×50=50` beside a soldier's
 * `2:1×100=100`.
 *
 * EMPTY PRINTS `[]` RATHER THAN VANISHING. A `time` roll where no entry's
 * `when` held put nothing on the die, and "the creature was asked and had
 * nothing to do" is a different fact from "this line forgot a field". */
function answerCandidatesText(candidates: readonly AnswerCandidate[]): string {
  const pairs = candidates.map(
    (c) => `${c.entry}:${c.weight}×${c.percent}=${c.loaded}`
  );
  return `[${pairs.join(' ')}]`;
}

/** Safe JSON stringify for the `default` branch — see module doc comment
 * on why a hypothetical future `bigint` field must not crash the whole
 * log over one unrenderable line. */
function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'undefined';
  } catch (err) {
    return `<unserializable: ${err instanceof Error ? err.message : String(err)}>`;
  }
}

export function formatDebugLine(
  event: Event,
  names: Map<string, string>
): DebugLogLine {
  const seq = event.seq;
  const prefix = `seq=${seq} clock=${event.at}`;
  const name = (id: string) => displayName(names, id);

  switch (event.body?.case) {
    case 'moved': {
      const b = event.body.value;
      return {
        seq,
        ids: [b.member],
        text: `${prefix} moved member=${name(b.member)} to=${positionText(b.to)}`,
      };
    }
    case 'struck': {
      const b = event.body.value;
      // The entities behind the keep record are addressable on hover exactly
      // as the old modifier sources were: whose Help, whose rule.
      const modifierSourceIds = keepSourceIds(b.calculation);
      return {
        seq,
        ids: [b.attacker, b.target, ...modifierSourceIds],
        text:
          `${prefix} struck attacker=${name(b.attacker)} target=${name(b.target)} ` +
          `roll=${b.roll} total=${b.total} against=${b.against} damage=${b.damage} ` +
          `crit=${b.critical} ${attackText(b.attack)}` +
          strikeDetailText(b.damageComponents, b.calculation),
      };
    }
    case 'missed': {
      const b = event.body.value;
      return {
        seq,
        ids: [b.attacker, b.target],
        text:
          `${prefix} missed attacker=${name(b.attacker)} target=${name(b.target)} ` +
          `roll=${b.roll} total=${b.total} against=${b.against} ${attackText(b.attack)}`,
      };
    }
    case 'activated': {
      const b = event.body.value;
      const target = b.target ? ` target=${name(b.target)}` : ' target=';
      return {
        seq,
        ids: b.target ? [b.actor, b.target] : [b.actor],
        text:
          `${prefix} activated actor=${name(b.actor)} ` +
          `ability.ref=${b.ability?.ref ?? '?'} ability.name=${b.ability ? quoteDebugString(b.ability.name) : '?'}${target}`,
      };
    }
    case 'activationResult': {
      const b = event.body.value;
      const actor = `${prefix} activation_result actor=${name(b.actor)}`;
      switch (b.result.case) {
        case 'stabilized': {
          const result = b.result.value;
          return {
            seq,
            ids: [b.actor, result.target],
            text:
              `${actor} result=stabilized target=${name(result.target)} ` +
              `source.ref=${result.sourceRef} source.name=${quoteDebugString(result.sourceName)} ` +
              `life.before=${result.before} life.after=${result.after} hp=${result.hitPoints} ` +
              `progress=${result.progress ? safeJson(result.progress) : 'unset'}`,
          };
        }
        case 'healingApplied': {
          const result = b.result.value;
          return {
            seq,
            ids: [b.actor, result.target],
            text:
              `${actor} result=healing_applied target=${name(result.target)} ` +
              `amount=${result.amount} requested=${result.requested} ` +
              `roll=${result.roll} modifier=${result.modifier} ` +
              `hp.before=${result.hpBefore} hp.after=${result.hpAfter} ` +
              `source.ref=${result.sourceRef} source.name=${quoteDebugString(result.sourceName)} ` +
              `calculation=${formatDebugRollCalculation(result.calculation)}`,
          };
        }
        case 'conditionApplied': {
          const result = b.result.value;
          return {
            seq,
            ids: [b.actor, result.target],
            text:
              `${actor} result=condition_applied target=${name(result.target)} ` +
              `condition.ref=${result.ref} condition.name=${quoteDebugString(result.name)}`,
          };
        }
        case 'conditionRemoved': {
          const result = b.result.value;
          return {
            seq,
            ids: [b.actor, result.target],
            text:
              `${actor} result=condition_removed target=${name(result.target)} ` +
              `condition.ref=${result.ref} condition.name=${quoteDebugString(result.name)} ` +
              `reason=${quoteDebugString(result.reason)}`,
          };
        }
        case 'capacityGranted': {
          const result = b.result.value;
          return {
            seq,
            ids: [b.actor, result.member],
            text:
              `${actor} result=capacity_granted member=${name(result.member)} ` +
              `description=${quoteDebugString(result.description)}`,
          };
        }
        case undefined:
          return {
            seq,
            ids: [b.actor],
            text: `${actor} result=none`,
          };
      }
      return {
        seq,
        ids: [b.actor],
        text: `${actor} result=unknown body=${safeJson(b.result)}`,
      };
    }
    case 'downed': {
      const b = event.body.value;
      return {
        seq,
        ids: [b.member],
        text: `${prefix} downed member=${name(b.member)}`,
      };
    }
    case 'joined': {
      const b = event.body.value;
      return {
        seq,
        ids: [b.member],
        text: `${prefix} joined member=${name(b.member)}`,
      };
    }
    case 'exited': {
      const b = event.body.value;
      return {
        seq,
        ids: [b.member],
        text: `${prefix} exited member=${name(b.member)}`,
      };
    }
    case 'turnEnded': {
      const b = event.body.value;
      return {
        seq,
        ids: [b.member, b.next],
        text: `${prefix} turn_ended member=${name(b.member)} next=${name(b.next)}`,
      };
    }
    case 'fightStarted': {
      const b = event.body.value;
      return {
        seq,
        ids: b.members,
        text: `${prefix} fight_started order=[${b.members.map(name).join(', ')}]`,
      };
    }
    case 'door': {
      // A LOCK IS A CHECK BEAT AND CARRIES THE ROLL (rpg-project#462, R4), so
      // a forced lock prints both faces and the rule here exactly as a threat
      // does. A door that merely changed state rolled nothing and prints
      // neither the attempt nor a calculation.
      const b = event.body.value;
      const stateName = DoorState[b.state] ?? String(b.state);
      const attempt = b.dc
        ? ` dc=${b.dc} total=${b.total} beaten=${b.beaten}`
        : '';
      const actor = b.actor ? ` actor=${name(b.actor)}` : '';
      return {
        seq,
        ids: [...(b.actor ? [b.actor] : []), ...keepSourceIds(b.calculation)],
        text:
          `${prefix} door door=${b.door} state=${stateName}${actor}${attempt}` +
          checkCalculationText(b.calculation),
      };
    }
    // THE TWO SOCIAL CHECKS AND THE WORLD'S ANSWER TO THEM (rpg-project#458).
    // Typed lines rather than the `default` branch's raw JSON, because R1
    // puts THE DIE HERE and nowhere else: the story log shows the outcome and
    // the creature's line, and this is where a builder reads what was
    // actually rolled against what.
    case 'intimidated':
    // eslint-disable-next-line no-fallthrough
    case 'persuaded': {
      //
      // AND THE WHOLE ROLL BEHIND THE VERDICT. `dc total beaten` is the
      // OUTCOME; the calculation is what was thrown to reach it, which for an
      // untrained character is two faces, the kept one, and the word
      // "Untrained". Without it this line is the single settled number the
      // slice exists to remove, and it reads as finished because the story
      // half already shows the faces.
      const b = event.body.value;
      const verb = event.body.case;
      return {
        seq,
        ids: [b.actor, b.target, ...keepSourceIds(b.calculation)],
        text:
          `${prefix} ${verb} actor=${name(b.actor)} target=${name(b.target)} ` +
          `dc=${b.dc} total=${b.total} beaten=${b.beaten}` +
          checkCalculationText(b.calculation),
      };
    }
    // R1 IN FULL, AND NOW ITS ARITHMETIC (rpg-project#465 §6): which table the
    // world rolled on, what loaded the die, every eligible entry with its own
    // numbers, the die, the face, the entry that fired and the word. `of` is
    // the die SIZE and not the entry count, and since the table it is in
    // HUNDREDTHS of a weight — an untempered 70-and-30 rolls against 10000 —
    // so nothing here is a percentage. `entry` indexes the AUTHOR's own list,
    // so a builder can find the line in the file they are looking at.
    //
    // ONE BEAT FOR TWO THINGS. A social verdict's answer and a creature
    // spending one turn's worth of doing are the same roll on the same table
    // under different keys, so they are the same line here; `key=` is what
    // tells them apart, and it is the field to read rather than `verb=`.
    //
    // TWO FIELDS ARE DELIBERATELY ABSENT. `say` is prose, it is in the story
    // log verbatim, and it would bury this line's numbers. `fact` never
    // arrives at all: it is per-observer knowledge and this beat is broadcast,
    // so the server leaves it unset by ruling (rpg-project#458) — printing a
    // field that is always empty would be this log implying the server
    // sometimes fills it.
    case 'answered': {
      const b = event.body.value;
      const word = AnswerWord[b.word] ?? String(b.word);
      const key = answerKeyIsSocial(b.key)
        ? `key=${answerKeyName(b.key)} verb=${Verb[b.verb] ?? String(b.verb)} beaten=${b.beaten}`
        : `key=${answerKeyName(b.key)}`;
      return {
        seq,
        ids: [b.creature],
        text:
          `${prefix} answered creature=${name(b.creature)} ${key} ` +
          `temper=${temperName(b.temper)} roll=${b.roll} of=${b.of} ` +
          `entry=${b.entry} word=${word} ` +
          `candidates=${answerCandidatesText(b.candidates)}`,
      };
    }
    // WHICH GOBLIN CAME OUT THE COWARD (rpg-project#465 §3). A faction's mix is
    // dealt once per member, at the door, and this beat is the only account of
    // that roll anybody gets — an authored `temper:` is not dealt and raises
    // none.
    //
    // THE FACTION IS THE DIE'S ENTITY and is printed as its own field beside
    // the member, because the thrower and the subject of a throw are different
    // questions (rpg-project#463). It is a faction id rather than a member id,
    // so it is deliberately NOT in `ids`: nothing resolves it to a display name
    // and hovering it would offer an id lookup that cannot answer.
    // A ROUTED WALK THAT MOVED NOBODY (rpg-project#465, from Kirk's walk).
    // The world clock charges a round per driven creature whether or not
    // anybody moves, and before this beat that round was narrated as nothing
    // at all — a reader could not tell a creature nobody asked from one that
    // refused from one sent somewhere it could not reach.
    //
    // `cause` IS A REF AND IS PRINTED RAW: `encounter:table:toward` says the
    // creature was walking under its own orders, and a spell's ref says
    // something else. This log neither parses it nor prettifies it, so a
    // router nobody has written yet still reads correctly here.
    //
    // `why` IS THE ROUTE'S OWN SENTENCE, verbatim — the fold's refusal phrase.
    // It is prose, which this log otherwise keeps out, and it is here because
    // it is the ONLY account of where the walk stopped; the story log has
    // none. EMPTY IS PRINTED AS EMPTY and is the commonest case: the route had
    // nowhere strictly nearer to offer, which is a reason rather than a
    // blocker it could name. Omitting the field when empty would hide the
    // difference between the two.
    case 'stayed': {
      const b = event.body.value;
      return {
        seq,
        ids: [b.member],
        text:
          `${prefix} stayed member=${name(b.member)} cause=${b.cause} ` +
          `why=${quoteDebugString(b.why)}`,
      };
    }
    case 'tempered': {
      const b = event.body.value;
      return {
        seq,
        ids: [b.member],
        text:
          `${prefix} tempered member=${name(b.member)} ` +
          `temper=${temperName(b.temper)} roll=${b.roll} of=${b.of} ` +
          `faction=${b.faction}`,
      };
    }
    case 'ended': {
      const b = event.body.value;
      return {
        seq,
        ids: [],
        text: `${prefix} ended ending=${b.ending}`,
      };
    }
    case 'fightEnded': {
      const b = event.body.value;
      const causeName = DissolveKind[b.cause] ?? String(b.cause);
      return {
        seq,
        ids: [],
        text: `${prefix} fight_ended cause=${causeName}`,
      };
    }
    default: {
      const kindName = EventKind[event.kind] ?? String(event.kind);
      const bodyValue =
        event.body && 'value' in event.body ? event.body.value : null;
      return {
        seq,
        ids: [],
        text: `${prefix} kind=${kindName} body=${safeJson(bodyValue)}`,
      };
    }
  }
}
