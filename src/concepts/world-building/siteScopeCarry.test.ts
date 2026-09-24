/**
 * Every `SiteScope` key crosses both boundaries (rpg-dnd5e-web#1201).
 *
 * THIS TEST EXISTS BECAUSE THE SAME KEY WENT MISSING TWICE. `tables` was
 * declared on `SiteScope`, taught to the decoder and the encoder — and then
 * dropped by BOTH publish call sites, and later by the IMPORT that rebuilds the
 * scope key by key. Each time the form looked like it worked, the document
 * silently lost the key, and the full suite stayed green. Kirk found both on
 * his walk, not we.
 *
 * The three sites spell their scope out by hand, so the failure is invisible to
 * types: `{ ...(decoded.x ? { x: decoded.x } : {}) }` with one key omitted is
 * still a valid `SiteScope`. This test reads the SOURCE of those three sites
 * and requires every declared key to appear, which is the only check that fails
 * when the fourth key is added and one site is forgotten.
 *
 * It is deliberately a source check rather than a behavioural one: three
 * behavioural tests already exist per key and they still missed this, because
 * each only covers the keys it names.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCOPE_KEYS } from './siteScope';

const SRC =
  '/home/kirk/game-dev/rpg-dnd5e-web/.worktrees/1201-yaml-cleanup/src/concepts/world-building/';

/** The one file that carries a scope across every boundary. */
function publishingSource(): string {
  return readFileSync(SRC + 'useRoomPublishing.ts', 'utf8');
}

/** The scope literal handed to `onImportDraft` — the import boundary. */
function importScopeLiteral(src: string): string {
  const at = src.indexOf('onImportDraftRef.current(decoded.draft,');
  expect(
    at,
    'the import scope literal moved; update this test'
  ).toBeGreaterThan(-1);
  return src.slice(at, src.indexOf('});', at));
}

/** Every `encodeSingleRoomDungeon({...})` call — the two publish boundaries. */
function encodeLiterals(src: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf('encodeSingleRoomDungeon({', from);
    if (at === -1) break;
    out.push(src.slice(at, src.indexOf('})', at)));
    from = at + 1;
  }
  return out;
}

/**
 * Whether a literal actually CARRIES a key — an assignment, not a mention.
 *
 * A SUBSTRING TEST IS NOT ENOUGH, and the mutation run proved it: deleting
 * `tables: scope.tables,` left the explanatory COMMENT above it still saying
 * "tables", so `includes('tables')` passed on broken code. The guard has to
 * look for the key in a position that WRITES it — `key:` or the conditional
 * `{ key: ... }` spread the import uses — with a non-identifier character
 * before it, so `otherTables:` cannot masquerade as `tables:`.
 */
function carries(key: string, literal: string): boolean {
  return new RegExp(`(^|[^\\w.])${key}\\s*:`).test(literal);
}

describe('every SiteScope key crosses every boundary', () => {
  it('the import carries all of them', () => {
    const literal = importScopeLiteral(publishingSource());
    const missing = SCOPE_KEYS.filter((key) => !carries(key, literal));
    expect(missing, `dropped on IMPORT: ${missing.join(', ')}`).toEqual([]);
  });

  it('both publish call sites carry all of them', () => {
    const literals = encodeLiterals(publishingSource());
    // Both sites must exist: the memo that renders the panel's YAML, and the
    // publish transaction that puts it on the wire.
    expect(literals.length).toBe(2);
    literals.forEach((literal, i) => {
      const missing = SCOPE_KEYS.filter((key) => !carries(key, literal));
      expect(
        missing,
        `dropped at ENCODE call site ${i + 1}: ${missing.join(', ')}`
      ).toEqual([]);
    });
  });

  it('the decoder returns all of them, so nothing is lost on the way in', () => {
    // `DecodeSingleRoomDungeonResult` is the universe a scope can be built
    // from; a key it cannot return is one no boundary could carry. The interface
    // is mostly comments, so this asks for an optional FIELD (`key?:`) rather
    // than a mention — the same distinction `carries` draws.
    const src = readFileSync(SRC + 'singleRoomDungeon.ts', 'utf8');
    const at = src.indexOf('export interface DecodeSingleRoomDungeonResult');
    const body = src.slice(at, src.indexOf('\n}', at));
    const missing = SCOPE_KEYS.filter(
      (key) => !new RegExp(`^\\s*${key}\\??:`, 'm').test(body)
    );
    expect(missing, `not decodable: ${missing.join(', ')}`).toEqual([]);
  });
});
