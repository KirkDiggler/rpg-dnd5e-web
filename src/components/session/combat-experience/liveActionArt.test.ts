// @vitest-environment node
import { create } from '@bufbuild/protobuf';
import {
  AbilityRefSchema,
  DeclarationSchema,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { liveActionArt } from './liveActionArt';

const sword = create(DeclarationSchema, {
  id: 'opaque-a',
  verb: Verb.ATTACK,
  attack: { ref: 'dnd5e:weapons:longsword', name: 'Provider sword name' },
});

describe('live action art', () => {
  it('maps exact refs to private runtime URLs independently of names and selector generations', () => {
    const renamed = create(DeclarationSchema, {
      ...sword,
      id: 'opaque-b',
      attack: { ...sword.attack!, name: 'Another name' },
    });
    const first = liveActionArt([sword]);
    const next = liveActionArt([renamed]);
    expect(next['opaque-b']).toEqual(first['opaque-a']);
    expect(next).not.toHaveProperty('opaque-a');
    expect(next['opaque-b']?.src).toBe(
      '/models/synty/ui/desktop-hotbar/ICON_DarkFantasy_Inventory_Swords_01_Clean.png'
    );
    expect(sword.attack?.name).toBe('Provider sword name');
  });

  it('keeps unknown refs as readable fallbacks without interpreting names or IDs', () => {
    const unknown = create(DeclarationSchema, {
      ...sword,
      id: '__proto__',
      attack: { ...sword.attack!, ref: 'toString', name: 'Longsword' },
    });
    const art = liveActionArt([unknown])['__proto__'];
    expect(art?.src).toBe('');
    expect(art?.fallback.length).toBeGreaterThan(0);
    expect(liveActionArt([])).toEqual({});
  });

  it('uses the declared verb to choose its identity, not a sibling feature identity', () => {
    const attackWithFeature = create(DeclarationSchema, {
      ...sword,
      ability: create(AbilityRefSchema, {
        ref: 'dnd5e:features:second_wind',
        name: 'Second Wind',
      }),
    });
    expect(liveActionArt([attackWithFeature])).toEqual(liveActionArt([sword]));
    const dodge = create(DeclarationSchema, {
      id: 'dodge',
      verb: Verb.ACTIVATE,
      ability: { ref: 'dnd5e:combat_abilities:dodge', name: 'Provider label' },
    });
    expect(liveActionArt([dodge]).dodge).toMatchObject({
      tone: 'gold',
      src: '/models/synty/ui/desktop-hotbar/ICON_DarkFantasy_Status_Stealthy_01_Clean.png',
    });
  });
});
