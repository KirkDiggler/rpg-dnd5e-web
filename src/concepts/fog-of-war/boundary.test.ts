/**
 * The event boundary (rpg-dnd5e-web#605).
 *
 * The concept has two halves: an authority that owns world truth, and a
 * consumer that may know only what an event told it. This test is what keeps
 * that true after everyone has forgotten the rule — client-side line of sight
 * is exactly the kind of thing that arrives later as a convenience.
 *
 * Design: rpg-project/ideas/fog-of-war/design.md §"Concept architecture".
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every consumer-side module. Task 5 adds FogOfWarConcept.tsx here. */
const CONSUMER_MODULES = [
  'events.ts',
  'reducer.ts',
  'adapter.ts',
  'FogOfWarConcept.tsx',
];

describe('fog concept boundary', () => {
  it('no consumer module imports from the authority half', () => {
    const checked: string[] = [];

    for (const file of CONSUMER_MODULES) {
      const path = join(__dirname, file);
      if (!existsSync(path)) continue; // not written yet
      checked.push(file);

      const source = readFileSync(path, 'utf8');
      expect(
        source,
        `${file} must not reach across the event boundary for world truth`
      ).not.toMatch(/from\s+['"][^'"]*authority/);
    }

    // Guard against the list silently drifting to empty and passing vacuously.
    expect(checked.length).toBeGreaterThan(0);
  });
});
