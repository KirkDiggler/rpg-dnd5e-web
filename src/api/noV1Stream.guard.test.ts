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
const IMPORT = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g;
const V1_STREAM_CALL = /\bsessionClient\s*\.\s*(?:streamEvents|getStory)\s*\(/;
const COMMENT_LINE = /^\s*(?:\/\/|\/?\*)/;

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

/** Each v1 event type a file imports that the verb responses do not carry. */
function forbiddenV1Imports(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(IMPORT)) {
    if (!match[2]!.endsWith(V1_EVENTS)) continue;
    for (const raw of match[1]!.split(',')) {
      const name = raw
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]!
        .trim();
      if (name && !ALLOWED_TYPES.has(name)) out.push(name);
    }
  }
  return out;
}

function callsV1Stream(text: string): boolean {
  return text
    .split('\n')
    .some((line) => !COMMENT_LINE.test(line) && V1_STREAM_CALL.test(line));
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

  it('calls neither v1 StreamEvents nor v1 GetStory', () => {
    expect(
      FILES.filter(({ text }) => callsV1Stream(text)).map(({ path }) => path)
    ).toEqual([]);
  });

  it('would catch the imports and calls it exists to forbid', () => {
    expect(
      forbiddenV1Imports(
        `import {\n  EventKind,\n  type Event as SessionEvent,\n  RollCalculationSchema,\n} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';`
      )
    ).toEqual(['EventKind', 'Event']);
    expect(
      forbiddenV1Imports(
        `import type { RollCalculation } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';`
      )
    ).toEqual([]);
    expect(
      callsV1Stream('  for await (const e of sessionClient.streamEvents({')
    ).toBe(true);
    expect(callsV1Stream('  // sessionClient.getStory( is gone')).toBe(false);
  });
});
