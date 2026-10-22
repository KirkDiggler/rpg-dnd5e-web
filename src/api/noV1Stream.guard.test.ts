// @vitest-environment node
/**
 * The web reads no v1 event stream (rpg-dnd5e-web#1305, rpg-project#631).
 *
 * The player UI reads acts (event-stream R14) and the debug panel reads the
 * record (Law 9); the v1 `StreamEvents`/`GetStory` RPCs and the `Event` types
 * they carried are deleted from the protos next (E5c). This guard keeps the
 * web off them in the meantime, so that deletion compiles:
 *
 * - no file imports a v1 event type, except the `RollCalculation` family the
 *   surviving v1 verb responses still carry (`AttackResponse.calculation`,
 *   `CastResponse.calculation`) — that family and everything it references;
 * - no file calls the v1 session client's `streamEvents` or `getStory`.
 *
 * Comment lines are skipped, so prose about the old stream is not a finding.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(process.cwd(), 'src');
const SELF = 'api/noV1Stream.guard.test.ts';

/** `RollCalculation` and every type it references, with their schemas. */
const ALLOWED_TYPES = new Set(
  [
    'RollCalculation',
    'RollComponent',
    'RollSource',
    'DiceTrace',
    'DiceKeep',
    'DiceReroll',
    'KeepRule',
  ].flatMap((name) => [name, `${name}Schema`])
);

const V1_EVENTS = 'session/v1alpha1/events_pb';
/** A named import of the v1 module: the only shape a file may carry it in. */
const NAMED_IMPORT =
  /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]*session\/v1alpha1\/events_pb['"]/g;
/** `.streamEvents(` or `.getStory(` on any receiver, across whitespace and
 * newlines; the receiver is captured so `storyClient` alone is allowed. */
const STREAM_CALL =
  /([A-Za-z_$][\w$]*)?\s*(?:\)\s*)?\.\s*(streamEvents|getStory)\s*\(/g;

/** The text with `//` and block comments removed: prose is not a finding. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = walk(SRC)
  .map((file) => ({
    path: relative(SRC, file).split(sep).join('/'),
    text: readFileSync(file, 'utf8'),
  }))
  .filter(({ path }) => path !== SELF);

/**
 * Each v1 event use a file makes that the verb responses do not carry. Every
 * occurrence of the module specifier must sit in a named import whose names
 * are all in ALLOWED_TYPES; any other shape — a namespace import, a
 * re-export, an inline `import('…')` type — is a finding, as is a forbidden
 * name in a named import.
 */
function forbiddenV1Imports(text: string): string[] {
  const src = code(text);
  const out: string[] = [];
  let allowedSites = 0;
  for (const match of src.matchAll(NAMED_IMPORT)) {
    allowedSites++;
    for (const raw of match[1]!.split(',')) {
      const name = raw
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]!
        .trim();
      if (name && !ALLOWED_TYPES.has(name)) out.push(name);
    }
  }
  const sites = src.split(V1_EVENTS).length - 1;
  if (sites > allowedSites)
    out.push(`${sites - allowedSites} other use(s) of ${V1_EVENTS}`);
  return out;
}

/** Each `streamEvents`/`getStory` call on a receiver other than storyClient. */
function v1StreamCalls(text: string): string[] {
  const out: string[] = [];
  for (const match of code(text).matchAll(STREAM_CALL)) {
    if (match[1] !== 'storyClient')
      out.push(`${match[1] ?? '(expression)'}.${match[2]}`);
  }
  return out;
}

describe('no v1 event import (rpg-dnd5e-web#1305)', () => {
  it('finds source files to check at all', () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it('imports no v1 event type outside the RollCalculation family', () => {
    const offenders = FILES.flatMap(({ path, text }) =>
      forbiddenV1Imports(text).map((name) => `${path}: ${name}`)
    );
    expect(offenders).toEqual([]);
  });

  it('calls streamEvents and getStory only on storyClient', () => {
    expect(
      FILES.flatMap(({ path, text }) =>
        v1StreamCalls(text).map((call) => `${path}: ${call}`)
      )
    ).toEqual([]);
  });

  it('would catch the imports and calls it exists to forbid', () => {
    const v1 = `'@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb'`;
    expect(
      forbiddenV1Imports(
        `import {\n  EventKind,\n  type Event as SessionEvent,\n  RollCalculationSchema,\n} from ${v1};`
      )
    ).toEqual(['EventKind', 'Event']);
    expect(
      forbiddenV1Imports(`import type { RollCalculation } from ${v1};`)
    ).toEqual([]);
    // The shapes a named-import pattern alone misses (#1316 review).
    for (const shape of [
      `import * as V1 from ${v1};`,
      `export { EventKind } from ${v1};`,
      `import type * as T from ${v1};`,
      `export type E = import(${v1}).Event;`,
    ]) {
      expect(forbiddenV1Imports(shape), shape).not.toEqual([]);
    }
    expect(forbiddenV1Imports(`// a comment naming ${v1} is prose`)).toEqual(
      []
    );

    expect(
      v1StreamCalls('for await (const e of sessionClient.streamEvents({')
    ).toEqual(['sessionClient.streamEvents']);
    expect(
      v1StreamCalls('const c = sessionClient; c.streamEvents({});')
    ).toEqual(['c.streamEvents']);
    expect(v1StreamCalls('sessionClient\n  .getStory({ session });')).toEqual([
      'sessionClient.getStory',
    ]);
    expect(v1StreamCalls('storyClient.streamEvents({ session })')).toEqual([]);
    expect(v1StreamCalls('  // sessionClient.getStory( is gone')).toEqual([]);
  });
});
