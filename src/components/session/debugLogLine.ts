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
  AttackModifierSource,
  DamageComponent,
  Event,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { EventKind } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  DamageType,
  DissolveKind,
  DoorState,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

/** One rendered debug-log entry. `text` is the full line, ready to
 * display and select-all-copy verbatim; `ids` are the raw member ids
 * this line named, for the caller to surface on hover (never embedded
 * in `text` itself — see module doc comment). */
export interface DebugLogLine {
  seq: bigint;
  text: string;
  ids: readonly string[];
}

function displayName(names: Map<string, string>, id: string): string {
  return names.get(id) ?? id;
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

function damageComponentText(component: DamageComponent): string {
  const fields = [`source=${component.source}`];
  if (component.sourceRef) fields.push(`ref=${component.sourceRef}`);
  if (component.dice) fields.push(`dice=${component.dice}`);
  fields.push(`final_rolls=[${(component.finalRolls ?? []).join(',')}]`);
  fields.push(`flat=${component.flatBonus}`);
  fields.push(
    `type=${DamageType[component.damageType] ?? String(component.damageType)}`
  );
  if (component.multiplier !== undefined) {
    fields.push(`multiplier=${component.multiplier}`);
  }
  return `{${fields.join(' ')}}`;
}

function attackModifierSourceText(
  source: AttackModifierSource,
  names: Map<string, string>
): string {
  const fields: string[] = [];
  if (source.sourceRef) fields.push(`ref=${source.sourceRef}`);
  if (source.sourceId) {
    fields.push(`source=${displayName(names, source.sourceId)}`);
  }
  return `{${fields.join(' ')}}`;
}

function strikeDetailText(
  damageComponents: readonly DamageComponent[] | undefined,
  advantageSources: readonly AttackModifierSource[] | undefined,
  disadvantageSources: readonly AttackModifierSource[] | undefined,
  names: Map<string, string>
): string {
  const components = damageComponents ?? [];
  const advantage = advantageSources ?? [];
  const disadvantage = disadvantageSources ?? [];
  const segments: string[] = [];
  if (components.length > 0) {
    segments.push(
      `components=[${components.map(damageComponentText).join(', ')}]`
    );
  }
  if (advantage.length > 0) {
    segments.push(
      `advantage=[${advantage.map((source) => attackModifierSourceText(source, names)).join(', ')}]`
    );
  }
  if (disadvantage.length > 0) {
    segments.push(
      `disadvantage=[${disadvantage.map((source) => attackModifierSourceText(source, names)).join(', ')}]`
    );
  }
  return segments.length === 0 ? '' : ` ${segments.join(' ')}`;
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
      const advantage = b.advantageSources ?? [];
      const disadvantage = b.disadvantageSources ?? [];
      const modifierSourceIds = [...advantage, ...disadvantage]
        .map((source) => source.sourceId)
        .filter((id) => id !== '');
      return {
        seq,
        ids: [b.attacker, b.target, ...modifierSourceIds],
        text:
          `${prefix} struck attacker=${name(b.attacker)} target=${name(b.target)} ` +
          `roll=${b.roll} total=${b.total} against=${b.against} damage=${b.damage} ` +
          `crit=${b.critical} ${attackText(b.attack)}` +
          strikeDetailText(b.damageComponents, advantage, disadvantage, names),
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
          `ability.ref=${b.ability?.ref ?? '?'} ability.name=${b.ability ? `"${b.ability.name}"` : '?'}${target}`,
      };
    }
    case 'activationResult': {
      const b = event.body.value;
      const actor = `${prefix} activation_result actor=${name(b.actor)}`;
      switch (b.result.case) {
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
              `source.ref=${result.sourceRef} source.name="${result.sourceName}"`,
          };
        }
        case 'conditionApplied': {
          const result = b.result.value;
          return {
            seq,
            ids: [b.actor, result.target],
            text:
              `${actor} result=condition_applied target=${name(result.target)} ` +
              `condition.ref=${result.ref} condition.name="${result.name}"`,
          };
        }
        case 'conditionRemoved': {
          const result = b.result.value;
          return {
            seq,
            ids: [b.actor, result.target],
            text:
              `${actor} result=condition_removed target=${name(result.target)} ` +
              `condition.ref=${result.ref} condition.name="${result.name}" ` +
              `reason="${result.reason}"`,
          };
        }
        case 'capacityGranted': {
          const result = b.result.value;
          return {
            seq,
            ids: [b.actor, result.member],
            text:
              `${actor} result=capacity_granted member=${name(result.member)} ` +
              `description="${result.description}"`,
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
      const b = event.body.value;
      const stateName = DoorState[b.state] ?? String(b.state);
      const attempt = b.dc
        ? ` dc=${b.dc} total=${b.total} beaten=${b.beaten}`
        : '';
      const actor = b.actor ? ` actor=${name(b.actor)}` : '';
      return {
        seq,
        ids: b.actor ? [b.actor] : [],
        text: `${prefix} door door=${b.door} state=${stateName}${actor}${attempt}`,
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
