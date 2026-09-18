import {
  EventKind,
  type Event,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { formatRollCalculation } from './combat-experience/rollTrace';

/** A failed ward save belongs to the aggressor, never the protected target. */
export function formatWardBeat(event: Event, name: (id: string) => string) {
  if (event.body.case !== 'warded' && event.body.case !== 'castWarded')
    return undefined;
  if (
    event.kind !==
    (event.body.case === 'warded' ? EventKind.WARDED : EventKind.CAST_WARDED)
  )
    return undefined;
  const ward = event.body.value;
  const actor = 'attacker' in ward ? ward.attacker : ward.actor;
  const action =
    'attacker' in ward
      ? ward.attack?.name || ward.attack?.ref || 'attack'
      : ward.spell?.name || ward.spell?.ref || 'spell';
  const arithmetic = ward.calculation
    ? formatRollCalculation(ward.calculation, name)
    : undefined;
  const possessive = (id: string) =>
    name(id) === 'You' ? 'Your' : `${name(id)}'s`;
  return {
    headline: `${possessive(ward.target)} ward blocks ${possessive(actor)} ${action}`,
    detail: `${name(actor)} failed the ${ward.ability} save: ${arithmetic ?? `d20 ${ward.roll} · total ${ward.total}`} against DC ${ward.dc}. Ward cast by ${name(ward.source)}.`,
  };
}

/** Response-only summary; the detailed save remains owned by typed Story. */
export function wardedCastNotice(
  targets: readonly string[],
  name: (id: string) => string
): string | undefined {
  return targets.length
    ? `The spell was blocked by a ward for: ${targets.map(name).join(', ')}.`
    : undefined;
}
