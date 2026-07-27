/**
 * The event boundary (rpg-dnd5e-web#605).
 *
 * The concept has two halves: an authority that owns world truth, and a
 * knowledge path that may know only what an event told it. This test is what
 * keeps that true after everyone has forgotten the rule — client-side line of
 * sight is exactly the kind of thing that arrives later as a convenience.
 *
 * Design: rpg-project/ideas/fog-of-war/design.md §"Concept architecture".
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The knowledge path: types, memory, and the renderer adapter. These process
 * or render viewer knowledge, so they may not reach for world truth at all.
 *
 * `FogOfWarConcept.tsx` is deliberately absent. It is the composition root —
 * something has to construct the fake server and hand its events to the
 * reducer, and in production that wiring is replaced by a stream
 * subscription. It gets its own, narrower rule below.
 */
const KNOWLEDGE_PATH = ['events.ts', 'reducer.ts', 'adapter.ts'];

const read = (file: string): string | undefined => {
  const path = join(__dirname, file);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
};

describe('fog concept boundary', () => {
  it('the knowledge path never imports world truth', () => {
    const checked: string[] = [];

    for (const file of KNOWLEDGE_PATH) {
      const source = read(file);
      if (source === undefined) continue;
      checked.push(file);

      expect(
        source,
        `${file} must not reach across the event boundary for world truth`
      ).not.toMatch(/from\s+['"][^'"]*authority/);
    }

    // Guard against the list silently drifting to empty and passing vacuously.
    expect(checked).toEqual(KNOWLEDGE_PATH);
  });

  it('the concept page never computes visibility', () => {
    // The composition root may build the world and the authority. It may not
    // ask what can be seen from where — that answer only ever arrives in an
    // event.
    const source = read('FogOfWarConcept.tsx');
    if (source === undefined) return;

    expect(source).not.toMatch(/from\s+['"][^'"]*authority\/los/);
    expect(source).not.toMatch(/visibleFrom/);
  });
});
