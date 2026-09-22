// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from '../singleRoomDungeon';
import {
  decodeWorldBuilderV4Site,
  WORLD_BUILDER_V4_SITE_SHA256,
  WORLD_BUILDER_V4_SITE_YAML,
} from './worldBuilderV4Site';

/** The engine team's own example is the one document that exercises every v4
 * key at once. If the builder cannot read it, the builder cannot configure the
 * form the engine accepts — which is the whole job. */
describe('the engine’s own v4 single-room example', () => {
  it('is the bytes taken at the pinned sha', () => {
    expect(
      createHash('sha256').update(WORLD_BUILDER_V4_SITE_YAML).digest('hex')
    ).toBe(WORLD_BUILDER_V4_SITE_SHA256);
    expect(WORLD_BUILDER_V4_SITE_YAML).toContain('key: front-room-site');
  });

  it('loads at all — the headline, because every assertion below is downstream', () => {
    expect(() => decodeWorldBuilderV4Site()).not.toThrow();
  });

  it('reads the root site scope: a faction’s mix and its inherited table', () => {
    const { factions } = decodeWorldBuilderV4Site();
    expect(factions).toHaveLength(1);
    const goblins = factions?.[0];
    expect(goblins?.id).toBe('goblins');
    // A FACTION's temperament is a MIX to deal one from per member — the shape
    // that must NOT be accepted on a binding.
    expect(goblins?.temper).toEqual({ coward: 2, soldier: 1, aggressive: 1 });
    // The shared table its members inherit.
    expect(Object.keys(goblins?.on ?? {})).toEqual(['intimidated', 'time']);
  });

  it('reads the dispositions, including the predicate that ends one', () => {
    const { dispositions } = decodeWorldBuilderV4Site();
    expect(dispositions).toEqual([
      {
        between: ['goblins', 'party'],
        stance: 'hostile',
        until: { fact: 'goblin-cowed' },
      },
    ]);
  });

  it('reads the creature split: membership on the actor, orders on the binding', () => {
    const { draft } = decodeWorldBuilderV4Site();
    const monsters = draft.room.monsters;
    expect(monsters.map((monster) => monster.id)).toEqual([
      'goblin-1',
      'skeleton-a',
      'skeleton-b',
    ]);
    // `faction` is on the ACTOR, and ABSENT when unauthored — never written as
    // `faction: monsters` (rpg-project#477 Decision 4).
    expect(monsters[0]?.faction).toBe('goblins');
    expect(monsters[1]?.faction).toBeUndefined();
    expect(monsters[2]?.faction).toBeUndefined();

    const bindings = draft.room.monsterBindings;
    // The binding overrides all three: the faction's `on`, its `temper`, and
    // the actions it carries.
    expect(bindings?.['goblin-1']).toEqual({
      on: { time: [{ when: { enemy: 'reach' }, hold: {} }] },
      temper: 'coward',
      actions: ['dnd5e:weapons:scimitar', 'dnd5e:weapons:shortbow'],
    });
    // A binding that overrides only actions is a binding, not a partial one.
    expect(bindings?.['skeleton-a']).toEqual({
      actions: ['dnd5e:weapons:shortsword'],
    });
    expect(bindings?.['skeleton-b']).toBeUndefined();
  });

  it('round-trips idempotently — parse, emit, parse again', () => {
    const once = decodeWorldBuilderV4Site();
    const emitted = encodeSingleRoomDungeon({
      key: once.key,
      draft: once.draft,
      factions: once.factions,
      dispositions: once.dispositions,
    });
    // The document carries v4 keys, so the encoder claims v4.
    expect(emitted.startsWith('version: 4\n')).toBe(true);
    const twice = decodeSingleRoomDungeon(emitted);
    const emittedAgain = encodeSingleRoomDungeon({
      key: twice.key,
      draft: twice.draft,
      factions: twice.factions,
      dispositions: twice.dispositions,
    });
    expect(emittedAgain).toBe(emitted);
  });
});
