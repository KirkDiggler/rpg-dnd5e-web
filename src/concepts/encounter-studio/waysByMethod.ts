/**
 * THE WAYS, COUNTED BY METHOD (rpg-project#974, R30, R39). The studio counts;
 * it does not judge. A count reads only the connections the engine gives a
 * way (rpg-project#981, rpg-toolkit#2444): its join (`through`), the bar it
 * lifts (`lifts`), its line (`{line, <carrier>/<option>, by}`), what it needs
 * and what a miss does, and its approaches, one per `by` method (a `with`
 * method is a part of the approach before it, never a way of its own).
 * `place.way.partial` and `place.way.none` are never counted.
 *
 * THE UNIT IS A WAY AS A PLAYER WOULD NAME IT. The engine says a line once per
 * carrier (the gate's `troupe` on three creatures). Ways through one join are
 * one unit when EVERY connection they carry is the same once the carrier's
 * own identity is taken out (the line `<carrier>/<option>` read by its
 * option alone, any connection naming the carrier as a star): bars, approaches,
 * needs, what a miss does, what it grants, teaches, draws off, advances or
 * arrests. Their carriers are listed as who it is said to. Anything else that
 * differs keeps them apart, including a connection the engine adds later.
 * Sentences are never compared.
 */
import type { ReadBackConnection } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import {
  methodName,
  type PlaceJoin,
  type Places,
  type PlaceWay,
  type WayMethod,
} from './placesView';

const UNCOUNTED = new Set(['place.way.partial', 'place.way.none']);

export interface WayUnit {
  join: PlaceJoin;
  /** The engine's ways this unit stands for, one per carrier. */
  ways: PlaceWay[];
  /** The line's option id (`troupe`), or null for a way with no line. */
  option: string | null;
  /** Who the line is said to, from its line ids, in the engine's order. */
  carriers: string[];
  methods: WayMethod[];
}

export interface MethodCount {
  /** The method's id: `skill:persuasion`, `ability:dex`, `knowledge`,
   * `item`, `fight`, `free`. */
  key: string;
  label: string;
  /** Ways that can be taken by it. */
  ways: number;
  /** The range of difficulties where it has any. */
  min: number | null;
  max: number | null;
  /** The joins whose ways use it. */
  joinIds: string[];
  /** Of its ways, those on a join with no bar that need nothing, and those
   * that carry a `needs` connection (said under the no-check row). */
  open: number;
  needing: number;
}

const lineOf = (way: PlaceWay): ReadBackConnection | undefined =>
  way.carriers.find((c) => c.kind === 'line');

/** A line way's connections with the carrier's identity taken out: methods
 * in the engine's order (a `with` belongs to the `by` before it), every
 * other connection as a sorted set. */
function keyWithoutCarrier(
  way: PlaceWay,
  line: ReadBackConnection,
  carrier: string
): string {
  const own = (c: ReadBackConnection): string => {
    // Only the way's own line is read by its option; a line it names in
    // another role (`arrests gate-1/troupe`) is another thing, kept whole.
    const id =
      c === line
        ? `*/${c.id.slice(carrier.length + 1)}`
        : c.id === carrier
          ? '*'
          : c.id;
    return JSON.stringify([c.kind, id, c.role, c.value]);
  };
  const methods = way.statement.connects.filter((c) => c.kind === 'method');
  const rest = way.statement.connects.filter((c) => c.kind !== 'method');
  return JSON.stringify([methods.map(own), rest.map(own).sort()]);
}

/** A join's counted ways as units, in the engine's order. */
export function wayUnitsOf(join: PlaceJoin): WayUnit[] {
  const units = new Map<string, WayUnit>();
  for (const way of join.ways) {
    if (UNCOUNTED.has(way.kind)) continue;
    const line = lineOf(way);
    const slash = line ? line.id.lastIndexOf('/') : -1;
    const option = line ? line.id.slice(slash + 1) : null;
    const carrier = line && slash > 0 ? line.id.slice(0, slash) : null;
    const key =
      line && carrier
        ? keyWithoutCarrier(way, line, carrier)
        : `way\u0000${way.statement.about?.id ?? units.size}`;
    const unit = units.get(key);
    if (unit) {
      unit.ways.push(way);
      if (carrier && !unit.carriers.includes(carrier))
        unit.carriers.push(carrier);
    } else
      units.set(key, {
        join,
        ways: [way],
        option,
        carriers: carrier ? [carrier] : [],
        methods: way.methods,
      });
  }
  return [...units.values()];
}

const COUNT_LABELS: Record<string, string> = {
  knowledge: 'knowledge',
  item: 'an item',
  fight: 'the fight',
  /** The engine's `free`: a way taken with no check. */
  free: 'no check',
};

/** A method row's label: the method's plain name. */
export function methodCountLabel(key: string): string {
  return COUNT_LABELS[key] ?? methodName(key);
}

/** Every method the encounter's ways can be taken by, with how many ways
 * and the range of their difficulties; sorted by count, then name. A way
 * with two alternatives counts under each. */
export function methodCountsOf(places: Places): MethodCount[] {
  const rows = new Map<string, MethodCount>();
  for (const join of places.joins)
    for (const unit of wayUnitsOf(join))
      for (const key of new Set(unit.methods.map((method) => method.id))) {
        const row = rows.get(key) ?? {
          key,
          label: methodCountLabel(key),
          ways: 0,
          min: null,
          max: null,
          joinIds: [],
          open: 0,
          needing: 0,
        };
        row.ways += 1;
        const needs = unit.ways[0]!.needs.length > 0;
        if (needs) row.needing += 1;
        else if (join.bars.length === 0) row.open += 1;
        for (const method of unit.methods)
          if (method.id === key && method.value > 0) {
            row.min = Math.min(row.min ?? method.value, method.value);
            row.max = Math.max(row.max ?? method.value, method.value);
          }
        if (!row.joinIds.includes(join.id)) row.joinIds.push(join.id);
        rows.set(key, row);
      }
  return [...rows.values()].sort(
    (a, b) =>
      b.ways - a.ways ||
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
  );
}

/** How many ways the encounter has, each counted once (the rows add up to
 * more: a way with alternatives is under each of its methods). */
export function waysTotal(places: Places): number {
  return places.joins.reduce((n, join) => n + wayUnitsOf(join).length, 0);
}

/** A row's difficulty: "DC 11–15", "DC 13", or empty where none is. */
export function difficultyRange(row: MethodCount): string {
  if (row.min === null || row.max === null) return '';
  return row.min === row.max ? `DC ${row.min}` : `DC ${row.min}–${row.max}`;
}

/** The ways INTO a place: every join that reaches it — a door or open floor
 * joins both its places, so it is into each; a passage is into the place it
 * leads `to` — with its counted ways as units. */
export function waysInto(
  places: Places,
  regionId: string
): { join: PlaceJoin; units: WayUnit[] }[] {
  return places.joins
    .filter((join) =>
      join.to !== null ? join.to === regionId : join.regions.includes(regionId)
    )
    .map((join) => ({ join, units: wayUnitsOf(join) }));
}
