/**
 * THE FIVE WALK SITES AND THE CASTLE OPEN AND COME BACK (rpg-project#732).
 *
 * The acceptance inputs are the stack's own content, copied byte-for-byte
 * into `fixtures/stack-sites/` from the castle stack's local, untracked
 * content directory (`.runtime/local/castle/sources/rpg-deployment/content/`,
 * which rpg-deployment's git ignores) as of 2026-10-30, and
 * the toolkit's castle (`dungeonspec/testdata/world-builder-v4-castle.yaml`
 * at rpg-toolkit f6e5e411), which is the web's `fixtures/the-mad-king.yaml`.
 * Each uses a word the studio did not speak before this slice: `fell` with
 * `who`, the `ally` selector, `dash` and the move words, a faction's
 * `options`, the leave ending, and `until` steps with `then`.
 *
 * WHAT "COMES BACK" MEANS, said exactly. Download writes the ENCODER's bytes
 * (`exportDraftYaml`), never the source's: a hand-written file's comments
 * and flow style are not the studio's to keep. So the test pins:
 *
 *   1. the file IMPORTS (Site → Import YAML reads it, no refusal);
 *   2. Download is BYTE-STABLE: importing the downloaded file and
 *      downloading again writes the same bytes;
 *   3. the download MEANS the file: every key and value the source wrote is
 *      written back, once the studio's one ordering law is applied — rows
 *      heaviest first (rpg-project#576 R12, order carries no meaning in the
 *      roll) — and the remaining differences are pinned by name, so a key
 *      dropped silently fails here.
 */
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import allyWalkYaml from './fixtures/stack-sites/ally-walk.yaml?raw';
import gateWalkYaml from './fixtures/stack-sites/gate-walk.yaml?raw';
import survivorsWalkYaml from './fixtures/stack-sites/survivors-walk.yaml?raw';
import stackCastleYaml from './fixtures/stack-sites/the-mad-king.yaml?raw';
import theftWalkYaml from './fixtures/stack-sites/theft-walk.yaml?raw';
import castleYaml from './fixtures/the-mad-king.yaml?raw';

/** A row list the studio carries heaviest first (R12): a table's trigger
 * and an option's verdict. */
const SORTED_ROW_KEYS = new Set(['time', 'success', 'failure']);

/** The source as the studio's ordering law writes it: rows heaviest first,
 * equal weights in authored order. Nothing else is touched. */
function heaviestFirstDeep(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => heaviestFirstDeep(item));
    if (key === undefined || !SORTED_ROW_KEYS.has(key)) return items;
    return items
      .map((row, index) => ({ row, index }))
      .sort(
        (a, b) =>
          (((b.row as { weight?: number }).weight ?? 1) as number) -
            (((a.row as { weight?: number }).weight ?? 1) as number) ||
          a.index - b.index
      )
      .map(({ row }) => row);
  }
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, heaviestFirstDeep(v, k)])
    );
  return value;
}

/** Every difference between two parsed files, by path. */
function differences(a: unknown, b: unknown, path = ''): string[] {
  if (Array.isArray(a) && Array.isArray(b)) {
    const out =
      a.length === b.length ? [] : [`${path}: ${a.length} → ${b.length} items`];
    for (let i = 0; i < Math.min(a.length, b.length); i++)
      out.push(...differences(a[i], b[i], `${path}[${i}]`));
    return out;
  }
  if (
    a &&
    b &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const out: string[] = [];
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
      if (!(k in bo)) out.push(`${path}.${k}: dropped`);
      else if (!(k in ao)) out.push(`${path}.${k}: added`);
      else out.push(...differences(ao[k], bo[k], `${path}.${k}`));
    }
    return out;
  }
  return JSON.stringify(a) === JSON.stringify(b)
    ? []
    : [`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`];
}

const SITES: readonly [string, string, readonly string[]][] = [
  // The castle's empty `mapLabels: []` is the studio's "none", which it
  // writes as absent (the draft's own law for an empty list).
  [
    'the toolkit castle (web fixture)',
    castleYaml,
    ['.room.scene.mapLabels: dropped'],
  ],
  ['the-mad-king (stack)', stackCastleYaml, ['.room.scene.mapLabels: dropped']],
  ['gate-walk', gateWalkYaml, []],
  ['ally-walk', allyWalkYaml, []],
  ['survivors-walk', survivorsWalkYaml, []],
  ['theft-walk', theftWalkYaml, []],
];

describe('the stack’s sites open in the studio and Download writes them back (rpg-project#732)', () => {
  it.each(SITES)('%s imports', (_name, text) => {
    const read = readDraftYaml(text);
    expect(read.ok ? 'imported' : read.refusal).toBe('imported');
  });

  it.each(SITES)('%s downloads byte-stable', (_name, text) => {
    const read = readDraftYaml(text);
    if (!read.ok) throw new Error(read.refusal);
    const once = exportDraftYaml(
      { draft: read.draft, scope: read.scope },
      read.key
    );
    const reread = readDraftYaml(once);
    if (!reread.ok) throw new Error(reread.refusal);
    const twice = exportDraftYaml(
      { draft: reread.draft, scope: reread.scope },
      reread.key
    );
    expect(twice).toBe(once);
  });

  it.each(SITES)(
    '%s downloads every key it was given',
    (_name, text, expected) => {
      const read = readDraftYaml(text);
      if (!read.ok) throw new Error(read.refusal);
      const saved = parse(
        exportDraftYaml({ draft: read.draft, scope: read.scope }, read.key)
      );
      expect(differences(heaviestFirstDeep(parse(text)), saved)).toEqual(
        expected
      );
    }
  );

  it('the castle carries every new word, written back', () => {
    const read = readDraftYaml(castleYaml);
    if (!read.ok) throw new Error(read.refusal);
    const saved = exportDraftYaml(
      { draft: read.draft, scope: read.scope },
      read.key
    );
    for (const word of [
      'fell:',
      'who: king',
      'toward: ally',
      'dash: enemy',
      'enemy: walk',
      'enemy: far',
      'options:',
      'left: front-door',
      'outcome: success',
      'outcome: failure',
      'then: allied',
      'then: hostile',
    ])
      expect(saved).toContain(word);
  });
});
