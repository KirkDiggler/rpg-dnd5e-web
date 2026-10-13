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

  it('carries the goblin’s lines, or the mount would show nothing to speak to', () => {
    // THE GOBLINS' SOCIAL TABLE RETIRED (rpg-project#569 R2): what the goblin
    // answers lives on the two lines it is spoken to by.
    const doc = sandboxDocForSearch('?authorFixture=front-room');
    const goblin = doc.place.find((p) => p.id === 'front-goblin');
    expect(goblin?.options?.map((o) => o.id)).toEqual([
      'lean-on-it',
      'talk-it-round',
    ]);
    const goblins = doc.factions.find((f) => f.id === 'goblins');
    // And the mix that gives four goblins four behaviours off one table.
    expect(goblins?.temper?.mix?.map((s) => s.word)).toEqual([
      'coward',
      'soldier',
      'aggressive',
    ]);
  });
});
