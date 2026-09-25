/**
 * Every `SiteScope` key crosses every boundary (rpg-dnd5e-web#1201).
 *
 * THIS TEST EXISTS BECAUSE THE SAME KEY WENT MISSING THREE TIMES. `tables` was
 * declared on `SiteScope`, taught to the decoder and the encoder — and then
 * dropped by BOTH publish call sites, and later by the IMPORT that rebuilt the
 * scope key by key. Each time the form looked like it worked, the document
 * silently lost the key, and the full suite stayed green. Kirk found all three
 * on his walks, not we.
 *
 * THE FIX WAS TO DELETE THE LISTS, NOT TO GUARD THEM. Every boundary now calls
 * `scopeFrom` / `renderScope`, which read the one declaration — so this file no
 * longer inspects a literal at each site (there is nothing there to inspect)
 * and instead pins the two things that can still go wrong:
 *
 *   1. **The helper must carry every key.** A key added to `SCOPE_KEYS` and
 *      handled by neither helper is dropped everywhere at once, which is worse
 *      than the original bug and would look identical from the UI.
 *   2. **A boundary must not go back to spelling the list out.** The source
 *      check below fails if a `...(x ? { x: … })` spread reappears in the
 *      publishing path, because that is how this started.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SCOPE_KEYS,
  renderScope,
  scopeFrom,
  type SiteScope,
} from './siteScope';

/**
 * RESOLVED RELATIVE TO THIS FILE, never by an absolute path.
 *
 * The first version hardcoded the author's own worktree directory. It passed on
 * that machine and failed CI with ENOENT — a test that can only pass where it
 * was written is not a test, and this one shipped that way for exactly one CI
 * run before the runner said so.
 *
 * `import.meta.dirname` rather than `fileURLToPath(new URL('.', import.meta.url))`:
 * under Vitest's transform the URL form threw "The URL must be of scheme file"
 * at module scope, while `dirname` is resolved directly.
 */
const SRC = `${import.meta.dirname}/`;

/**
 * A value for every key, each a DISTINCT marker so a helper that wrote the
 * wrong key's value is caught as well as one that dropped a key entirely.
 * The shapes are deliberately not the real types — these helpers copy, and
 * copying is what is under test, not validation.
 */
function everyKeyAuthored(): SiteScope {
  const scope: Record<string, unknown> = {};
  for (const key of SCOPE_KEYS) scope[key] = { marker: key };
  return scope as unknown as SiteScope;
}

describe('scopeFrom and renderScope carry every declared key', () => {
  it('scopeFrom keeps all of them, with their own values', () => {
    const source = everyKeyAuthored();
    const copied = scopeFrom(source);
    expect(Object.keys(copied).sort()).toEqual([...SCOPE_KEYS].sort());
    for (const key of SCOPE_KEYS) {
      // The VALUE follows its KEY: a helper that shifted values by one would
      // still pass a keys-only assertion.
      expect((copied as Record<string, unknown>)[key]).toEqual({
        marker: key,
      });
    }
  });

  it('scopeFrom treats an absent key as absent, never as present-and-undefined', () => {
    // ABSENCE IS THE AUTHORED STATE — the law the encoder's "emit only what was
    // authored" rule keeps. A key present as `undefined` would be written by
    // YAML emitters that do not prune it, and would make a document that
    // authored nothing differ from one written before the key existed.
    const partial = scopeFrom({ tables: { drill: {} } } as SiteScope);
    expect(Object.keys(partial)).toEqual(['tables']);
    for (const key of SCOPE_KEYS) {
      if (key !== 'tables') expect(key in partial).toBe(false);
    }
  });

  it('renderScope emits all of them, in SCOPE_KEYS order', () => {
    const rendered = renderScope(everyKeyAuthored());
    // ORDER IS THE BYTES: `SCOPE_KEYS` is the root's own key order, and the
    // document's stability depends on it.
    expect(Object.keys(rendered)).toEqual([...SCOPE_KEYS]);
    for (const key of SCOPE_KEYS) {
      expect((rendered as Record<string, unknown>)[key]).toEqual({
        marker: key,
      });
    }
  });

  it('renderScope omits what was not authored', () => {
    expect(Object.keys(renderScope({}))).toEqual([]);
  });
});

describe('SCOPE_KEYS and SiteScope cannot drift apart', () => {
  it('names exactly the fields SiteScope declares', () => {
    /* THE HOLE THE MUTATION RUN FOUND. Deleting `'concealments'` from
     * `SCOPE_KEYS` left every other assertion green: the helpers still agreed
     * with the list, so they were consistently wrong, and `SiteScope` still
     * declared the field while nothing carried it. That is the ORIGINAL BUG
     * wearing the fix's clothes — a key silently dropped, with no UI symptom
     * until someone opens a document that has one.
     *
     * The list and the interface are two statements of the same fact, so this
     * requires them to be the same statement. */
    const src = readFileSync(SRC + 'siteScope.ts', 'utf8');
    const at = src.indexOf('export interface SiteScope {');
    const body = src.slice(at, src.indexOf('\n}', at));
    // Comments are stripped first: the interface's own prose names keys, and a
    // substring test over it would pass on a declared field that was removed.
    const declared = [
      ...body
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*/g, '')
        .matchAll(/^\s*(\w+)\??:/gm),
    ]
      .map((m) => m[1]!)
      .sort();
    expect(declared).toEqual([...SCOPE_KEYS].sort());
  });

  it('the helper result is assignable to SiteScope, so a stray key is a type error', () => {
    // THE COMPILE-TIME HALF OF THE SAME GUARANTEE, and it is not decorative:
    // `renderScope` is spread into `EncodeSingleRoomDungeonInput`, so its type
    // has to keep each key's real type. A `Record<string, unknown>` version
    // typechecked at the helper and failed at BOTH call sites — which is how
    // this assertion came to be written. `tsc` runs in the gate, so a
    // regression fails the build, not just this test.
    const rendered: SiteScope = renderScope(everyKeyAuthored());
    expect(Object.keys(rendered)).toEqual([...SCOPE_KEYS]);
  });
});

describe('no boundary goes back to spelling the scope out by hand', () => {
  const publishing = readFileSync(SRC + 'useRoomPublishing.ts', 'utf8');
  const encoder = readFileSync(SRC + 'singleRoomDungeon.ts', 'utf8');

  it('the publishing path spreads the shared helper instead of listing keys', () => {
    // The shape that caused all three losses: a hand-written conditional spread
    // of a scope field. If one reappears here, a key can go missing again.
    const handWritten =
      /\.\.\.\(\s*\w+\.(tables|factions|dispositions|intel|exits|endings|scenarios|concealments)\s*\?/;
    expect(handWritten.test(publishing)).toBe(false);
    // And the helper IS called, so the check above cannot pass by the file
    // simply having no scope handling at all.
    expect(publishing).toContain('renderScope(');
    expect(publishing).toContain('scopeFrom(');
  });

  it('the encoder emits through the shared helper', () => {
    const handWritten =
      /\.\.\.\(\s*scope\.(tables|factions|dispositions|intel|exits|endings|scenarios|concealments)\s*\?/;
    expect(handWritten.test(encoder)).toBe(false);
    expect(encoder).toContain('renderScope(scope)');
    expect(encoder).toContain('scopeFrom(input)');
  });

  it('the decoder still returns every key, so nothing is lost on the way in', () => {
    // `DecodeSingleRoomDungeonResult` is the universe a scope is built from; a
    // key it cannot return is one no boundary could carry. The interface is
    // mostly comments, so this asks for an optional FIELD (`key?:`) rather than
    // a mention.
    const at = encoder.indexOf(
      'export interface DecodeSingleRoomDungeonResult'
    );
    const body = encoder.slice(at, encoder.indexOf('\n}', at));
    const missing = SCOPE_KEYS.filter(
      (key) => !new RegExp(`^\\s*${key}\\??:`, 'm').test(body)
    );
    expect(missing, `not decodable: ${missing.join(', ')}`).toEqual([]);
  });
});
