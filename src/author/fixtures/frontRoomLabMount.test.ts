import { describe, expect, it } from 'vitest';
import { sandboxDocForSearch } from '../DungeonBuilderSandbox';

/**
 * The front room mounts in the Concepts Lab by name, like every other
 * fixture. It is not decoration: the Lab is how a fixture's sections are
 * looked at without a running authoring server, and the front room is the
 * only file in the project carrying an answer table — so without this
 * mount there is nowhere to SEE the feature except the real `/author`
 * route against a live API.
 *
 * Kept out of `referenceFrontRoom.test.ts` on purpose: that file runs in
 * the node environment to hash the fixture's bytes, and this one imports
 * the Lab's component module, which wants the DOM environment the rest of
 * the builder's tests use.
 */
describe('the front room is selectable in the Concepts Lab', () => {
  it('loads the pinned snapshot for ?authorFixture=front-room', () => {
    expect(sandboxDocForSearch('?authorFixture=front-room').key).toBe(
      'reference-front-room'
    );
  });

  it('leaves the default mount alone', () => {
    expect(sandboxDocForSearch('').key).toBe('reference-tomb');
  });

  it('carries a real answer table, or the mount would show nothing', () => {
    // THE GOBLINS' TABLE LIVES ON THEIR FACTION (rpg-project#466), inherited
    // by all four placements — so this reads the faction, not the goblin.
    const doc = sandboxDocForSearch('?authorFixture=front-room');
    const goblins = doc.factions.find((f) => f.id === 'goblins');
    expect(goblins?.on?.map((t) => t.trigger)).toEqual([
      'intimidated',
      'intimidate_failed',
      'persuaded',
      'persuade_failed',
    ]);
    // And the mix that gives four goblins four behaviours off one table.
    expect(goblins?.temper?.mix?.map((s) => s.word)).toEqual([
      'coward',
      'soldier',
      'aggressive',
    ]);
  });
});
