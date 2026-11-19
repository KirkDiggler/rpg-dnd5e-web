/**
 * A MOVED ROW CARRIES ITS COMMENT (rpg-project#998). Both list editors — the
 * Bundles page's rows and the machine editor's List pop-up — commit a moved
 * row as the whole list re-ordered, and the file splice (`spliceYaml`) writes
 * it. The castle records hand edits in comments directly above rows; a move
 * keeps that comment above its row, keeps the row's own text byte for byte,
 * and changes no other line. Moving it back writes the served file again.
 */
import { describe, expect, it } from 'vitest';
import type { SiteBundles } from '../world-building/siteScope';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-served.yaml?raw';
import {
  definitionOf,
  setBehaviorDefinition,
  tableRowsOf,
  withTableRows,
} from './machineEdit';

function read(text: string) {
  const result = readDraftYaml(text);
  if (!result.ok) throw new Error(result.refusal);
  return result;
}

/** The rows with the one at `from` moved by `by`, as both editors do it. */
function moved<T>(rows: readonly T[], from: number, by: number): T[] {
  const next = [...rows];
  const [row] = next.splice(from, 1);
  next.splice(from + by, 0, row!);
  return next;
}

/** The machine editor's List pop-up: move one row of gate-1-policy's list. */
function moveTableRow(text: string, list: string, from: number, by: number) {
  const result = read(text);
  const definition = definitionOf(result.scope, 'gate-1-policy')!;
  const rows = tableRowsOf(definition, list);
  return exportDraftYaml(
    {
      draft: result.draft,
      scope: setBehaviorDefinition(
        result.scope,
        'gate-1-policy',
        withTableRows(definition, list, moved(rows, from, by))
      ),
    },
    result.key
  );
}

/** The Bundles page: move one row of a bundle. */
function moveBundleRow(text: string, id: string, from: number, by: number) {
  const result = read(text);
  const bundles = result.scope.bundles!;
  const next: SiteBundles = {
    ...bundles,
    [id]: { ...bundles[id]!, rows: moved(bundles[id]!.rows, from, by) },
  };
  return exportDraftYaml(
    { draft: result.draft, scope: { ...result.scope, bundles: next } },
    result.key
  );
}

/** Endings: move one ending, as `StudioEndings` does. */
function moveEnding(text: string, from: number, by: number) {
  const result = read(text);
  return exportDraftYaml(
    {
      draft: result.draft,
      scope: {
        ...result.scope,
        endings: moved(result.scope.endings!, from, by),
      },
    },
    result.key
  );
}

/** The text of the lines from the first whose trimmed text is `first`
 * through the next line that is exactly `last`. */
function block(text: string, first: string, last: string): string {
  const lines = text.split('\n');
  const a = lines.findIndex((l) => l.trim() === first);
  const b = lines.findIndex((l, i) => i >= a && l === last);
  expect(a).toBeGreaterThanOrEqual(0);
  expect(b).toBeGreaterThanOrEqual(a);
  return lines.slice(a, b + 1).join('\n');
}

/** `after` is `before` with the block `moving` taken out and put back
 * directly before / after the block `neighbour`: every other line is as it
 * was. */
function expectSwapped(
  before: string,
  after: string,
  moving: string,
  neighbour: string,
  where: 'before' | 'after'
) {
  expect(before).toContain(moving);
  expect(before).toContain(neighbour);
  const without = before.replace(`${moving}\n`, '');
  expect(without).not.toBe(before);
  const expected = without.replace(
    neighbour,
    where === 'before' ? `${moving}\n${neighbour}` : `${neighbour}\n${moving}`
  );
  expect(after).toBe(expected);
}

describe('a moved row keeps its comment and its text (rpg-project#998)', () => {
  // gate-1-policy's `time` list: the first row carries a hand-edit comment and
  // a flow-style `when: [{…}, {…}]`.
  const timeFirst = block(
    served,
    '# Hand edit: a gate guard who witnessed the turn marches with the',
    '          toward: {at: {q: 10, r: -19}}'
  );
  const timeSecond = block(
    served,
    '- say: To arms! Intruders at the gate!',
    '          fact: alarm-raised'
  );

  it('the List pop-up: the commented first row moves down, then back up', () => {
    const down = moveTableRow(served, 'time', 0, 1);
    expectSwapped(served, down, timeFirst, timeSecond, 'after');
    const up = moveTableRow(down, 'time', 1, -1);
    expect(up).toBe(served);
  });

  it('the List pop-up: a row moves up past a commented neighbour, to the top', () => {
    const down = moveTableRow(served, 'time', 1, -1);
    expectSwapped(served, down, timeSecond, timeFirst, 'before');
    expect(moveTableRow(down, 'time', 0, 1)).toBe(served);
  });

  it('the List pop-up: a commented row in the middle moves up and down', () => {
    const start = served.indexOf('      post:\n');
    const commented = block(
      served.slice(start),
      '# Hand edit (rpg-project#933): he walks toward a voice raised to a',
      '          toward: sound'
    );
    const above = '        - use: alarm-reactor';
    const up = moveTableRow(served, 'post', 4, -1);
    expect(up.slice(0, start)).toBe(served.slice(0, start));
    expectSwapped(served, up, commented, above, 'before');
    expect(moveTableRow(up, 'post', 3, 1)).toBe(served);
    // To the bottom and back.
    const last = moveTableRow(served, 'post', 4, 1);
    expect(last).toContain(`${commented}\n      cowed:`);
    expect(moveTableRow(last, 'post', 5, -1)).toBe(served);
  });

  it('the Bundles page: guard-base’s commented row moves down, then back up', () => {
    const pursuer = block(
      served,
      '# Hand edit (rpg-project#671): the pursuit for a cold trail only; the',
      '        when: {enemy: lost}'
    );
    const reactor = '      - use: alarm-reactor';
    const down = moveBundleRow(served, 'guard-base', 1, 1);
    expectSwapped(served, down, pursuer, reactor, 'after');
    expect(moveBundleRow(down, 'guard-base', 2, -1)).toBe(served);
    // To the top, past the uncommented first row, and back.
    const top = moveBundleRow(served, 'guard-base', 1, -1);
    expectSwapped(served, top, pursuer, '      - use: dasher', 'before');
    expect(moveBundleRow(top, 'guard-base', 0, 1)).toBe(served);
  });

  it('Endings: king-deposed moves with the hand-edit block directly above it', () => {
    // By the rule, the #716 block is king-deposed's: it sits directly above
    // that row with no blank line, though its prose reads as the list's.
    const deposed = block(
      served,
      '# Hand edit (rpg-project#716, decided 2026-10-29): every ending is at the',
      '    outcome: success'
    );
    expect(deposed).toContain('- id: king-deposed');
    const freed = block(served, '- id: freed', '    outcome: success');
    const down = moveEnding(served, 1, 1);
    expectSwapped(served, down, deposed, freed, 'after');
    expect(moveEnding(down, 2, -1)).toBe(served);
    const up = moveEnding(served, 1, -1);
    expect(up).toContain(`endings:\n${deposed}\n  - id: king-slain`);
    expect(moveEnding(up, 0, 1)).toBe(served);
  });
});
