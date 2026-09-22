// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from '../../singleRoomDungeon';
import sample01Minimal from './01-minimal.yaml?raw';
import sample02Inherited from './02-inherited-vs-overridden.yaml?raw';
import sample03Sides from './03-two-sides.yaml?raw';
import sample04FrontRoom from './04-front-room-in-v4.yaml?raw';

/** The sample corpus — authored documents to test the builder against as it
 * grows, each one carrying the rule it exists to make visible in its own header
 * comment.
 *
 * WHAT THIS TEST IS AND IS NOT. It proves every sample still DECODES in the
 * builder, so the corpus cannot silently rot when the strict decoder tightens.
 * It is not proof the samples are legal: the authority for that is the engine,
 * and these were graded by `dungeonspec.Load` — the same dispatch the game
 * server uses at play time — with a local scratch program (see the notes on
 * rpg-dnd5e-web#1160). Three of the four were REFUSED the first time and taught
 * their author the rules below, which is the reason to keep the corpus graded by
 * the engine whenever it changes.
 *
 * The rules the engine caught while these were being written, recorded here
 * because they are easy to get wrong and expensive to discover at play:
 *   - a placement's cell must be in the authored `walkableHexes`
 *     ("at author's axial q=2 r=0: is not standable");
 *   - a faction of MANY that waits on a fact must name a `mind`
 *     ("name a mind, or the faction cannot learn"). A faction of one does not:
 *     its single member is its mind;
 *   - a social outcome takes `say` and a result word, NEVER a time action
 *     ("`attack` is what a creature does with time, and `intimidate_failed` is
 *     an outcome");
 *   - `toward: {at: [col,row]}` is refused in this dialect — name `enemy`,
 *     `attacker` or `actor`, or wait for the sites layer.
 */
const SAMPLES: ReadonlyArray<readonly [name: string, yaml: string]> = [
  ['01-minimal', sample01Minimal],
  ['02-inherited-vs-overridden', sample02Inherited],
  ['03-two-sides', sample03Sides],
  ['04-front-room-in-v4', sample04FrontRoom],
];

describe('the authored sample corpus', () => {
  it.each(SAMPLES)('%s decodes in the builder', (_name, yaml) => {
    expect(() => decodeSingleRoomDungeon(yaml)).not.toThrow();
  });

  it.each(SAMPLES)('%s round-trips idempotently', (_name, yaml) => {
    const first = decodeSingleRoomDungeon(yaml);
    const emitted = encodeSingleRoomDungeon({
      key: first.key,
      draft: first.draft,
      factions: first.factions,
      dispositions: first.dispositions,
    });
    const second = decodeSingleRoomDungeon(emitted);
    expect(second).toEqual(first);
  });

  it('exercises the keys this corpus exists to cover', () => {
    // A sample list that quietly stopped covering a key would still pass every
    // assertion above, so the coverage itself is asserted.
    const scopes = SAMPLES.map(([, yaml]) => decodeSingleRoomDungeon(yaml));
    expect(scopes.some((s) => (s.factions?.length ?? 0) === 0)).toBe(false);
    expect(scopes.some((s) => (s.dispositions?.length ?? 0) === 0)).toBe(true); // 01-minimal deliberately has none
    expect(scopes.some((s) => (s.factions?.length ?? 0) > 1)).toBe(true); // 03 and 04 have two sides
    expect(
      scopes.some((s) => s.factions?.some((f) => f.mind !== undefined))
    ).toBe(true); // 02 and 03 name a mind
    expect(
      scopes.some((s) => s.factions?.some((f) => f.temper !== undefined))
    ).toBe(true); // 02 has a mix
    expect(
      scopes.some((s) =>
        s.draft.room.monsters.some((m) => m.faction !== undefined)
      )
    ).toBe(true);
    expect(
      scopes.some((s) =>
        s.draft.room.monsters.some((m) => m.faction === undefined)
      )
    ).toBe(true); // 03 has one on the kind's default side
    expect(
      scopes.some(
        (s) => Object.keys(s.draft.room.monsterBindings ?? {}).length > 0
      )
    ).toBe(true);
  });
});
