/**
 * THE CASTLE'S WAYS BY METHOD, computed from the recorded read-back without
 * the studio's module (rpg-project#974): a way the engine says once per
 * carrier has the carrier in its id (`…:line:<carrier>:<option>`), so
 * dropping that segment names the way as a player would; its alternatives are
 * its `by` method connections; partial and none are not counted.
 */
import { castlePlacesReadBack } from './engineReadBack';

export function expectedCastleWayTable() {
  const statements = castlePlacesReadBack().sections.flatMap((section) =>
    section.groups.flatMap((group) => group.statements)
  );
  const units = new Map<string, (typeof statements)[number]>();
  for (const statement of statements) {
    if (!statement.kind.startsWith('place.way.')) continue;
    if (statement.kind === 'place.way.partial') continue;
    if (statement.kind === 'place.way.none') continue;
    const key = statement.about!.id.replace(/:line:[^:]+:/, ':line:*:');
    if (!units.has(key)) units.set(key, statement);
  }
  const table = new Map<string, { ways: number; dcs: number[] }>();
  for (const statement of units.values()) {
    const methods = statement.connects.filter(
      (c) => c.kind === 'method' && c.role === 'by'
    );
    for (const id of new Set(methods.map((m) => m.id))) {
      const row = table.get(id) ?? { ways: 0, dcs: [] };
      row.ways += 1;
      row.dcs.push(
        ...methods.filter((m) => m.id === id && m.value > 0).map((m) => m.value)
      );
      table.set(id, row);
    }
  }
  return new Map(
    [...table].map(([id, row]) => [
      id,
      {
        ways: row.ways,
        min: row.dcs.length ? Math.min(...row.dcs) : null,
        max: row.dcs.length ? Math.max(...row.dcs) : null,
      },
    ])
  );
}
