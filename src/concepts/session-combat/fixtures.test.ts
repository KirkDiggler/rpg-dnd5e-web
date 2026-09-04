import {
  ClockKind,
  LifeState,
  ShortfallReason,
  Slot,
  TargetKind,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { SESSION_COMBAT_FIXTURES } from './fixtures';

describe('session combat generated-shape review fixtures', () => {
  it('provides the complete hard-state matrix', () => {
    expect(SESSION_COMBAT_FIXTURES.map((fixture) => fixture.id)).toEqual([
      'fresh-turn',
      'spent-turn',
      'spectating',
      'free-roam',
      'reconnected',
      'death-save',
    ]);
  });

  it('uses generated Participant, Declaration, and CharacterData messages', () => {
    const fresh = SESSION_COMBAT_FIXTURES[0]!;

    expect(fresh.participants[0]?.$typeName).toBe(
      'dnd5e.api.session.v1alpha1.Participant'
    );
    expect(fresh.declarations[0]?.$typeName).toBe(
      'dnd5e.api.session.v1alpha1.Declaration'
    );
    expect(fresh.characterData.$typeName).toBe(
      'dnd5e.api.v1alpha2.encounter.CharacterData'
    );
  });

  it('carries only first-wave Attack, Move, and End Turn declarations', () => {
    const fresh = SESSION_COMBAT_FIXTURES[0]!;

    expect(fresh.declarations.map((declaration) => declaration.verb)).toEqual([
      Verb.ATTACK,
      Verb.MOVE,
      Verb.END_TURN,
    ]);
    expect(fresh.declarations).toHaveLength(3);
    expect(
      fresh.declarations.find((declaration) => declaration.verb === Verb.ATTACK)
    ).toMatchObject({
      attack: {
        name: 'Longsword',
        ref: 'dnd5e:weapons:longsword',
      },
      available: true,
    });
  });

  it('contains only authoritative roll/total/outcome facts with no bonus equation, target HP, or peer-private exact HP', () => {
    for (const fixture of SESSION_COMBAT_FIXTURES) {
      const serialized = JSON.stringify(fixture);
      expect(serialized, fixture.id).not.toMatch(/"bonus"|"hpAfter"/);
      expect(serialized, fixture.id).not.toMatch(/\b\d+\s*\+\s*\d+\s*=\s*\d+/);
      expect(serialized, fixture.id).not.toMatch(
        /Skeleton (?:Guard|Archer).*\b\d+\/\d+\s*HP/i
      );
      expect(fixture.attackOutcome, fixture.id).toMatchObject({
        d20: expect.any(Number),
        total: expect.any(Number),
        against: expect.any(Number),
        hit: expect.any(Boolean),
        critical: expect.any(Boolean),
      });
    }
  });

  it('keeps every fixture free of forbidden executable, magic, and item content', () => {
    for (const fixture of SESSION_COMBAT_FIXTURES) {
      expect(
        fixture.declarations.every(
          (declaration) =>
            declaration.verb === Verb.ATTACK ||
            declaration.verb === Verb.MOVE ||
            declaration.verb === Verb.END_TURN ||
            declaration.verb === Verb.DEATH_SAVE
        ),
        fixture.id
      ).toBe(true);
      expect(fixture.characterData.inventory, fixture.id).toEqual([]);
      expect(JSON.stringify(fixture), fixture.id).not.toMatch(
        /Healing Potion|Blessed|\bDodge\b|\bDash\b|\bSpells?\b|\bMagic\b/i
      );
    }
  });

  it('carries a narrow provider-authored Dying/Death Save visual review state', () => {
    const dying = SESSION_COMBAT_FIXTURES.find(
      (fixture) => fixture.id === 'death-save'
    )!;
    const actor = dying.participants.find(
      (participant) => participant.member === dying.viewerMember
    );
    const declaration = dying.declarations.find(
      (candidate) => candidate.verb === Verb.DEATH_SAVE
    );

    expect(actor).toMatchObject({
      active: true,
      lifeState: LifeState.DYING,
      deathSaves: {
        successes: 2,
        failures: 1,
        successesNeeded: 1,
        failuresRemaining: 2,
      },
    });
    expect(dying.endTurnBlocked).toBe(true);
    expect(declaration).toMatchObject({
      id: 'offer:aldric:death-save',
      available: true,
      slot: Slot.NONE,
      targetKind: TargetKind.NONE,
      candidates: [],
      deathSave: { name: 'Death Save' },
    });
  });

  it('keeps spent refusal and Move remaining on generated declarations', () => {
    const spent = SESSION_COMBAT_FIXTURES.find(
      (fixture) => fixture.id === 'spent-turn'
    )!;
    const attack = spent.declarations.find(
      (declaration) => declaration.verb === Verb.ATTACK
    );
    const move = spent.declarations.find(
      (declaration) => declaration.verb === Verb.MOVE
    );

    expect(attack).toMatchObject({
      available: false,
      why: { text: 'Action: 1 needed, 0 left.' },
    });
    expect(move).toMatchObject({ available: true, remaining: 10 });
  });

  it('represents another participant turn with provider-authored blockers', () => {
    const spectating = SESSION_COMBAT_FIXTURES.find(
      (fixture) => fixture.id === 'spectating'
    )!;

    expect(spectating.clock).toBe(ClockKind.TURN);
    expect(
      spectating.participants.find((participant) => participant.active)?.member
    ).toBe('skeleton-archer');
    expect(
      spectating.declarations.every(
        (declaration) =>
          !declaration.available &&
          declaration.why?.reason === ShortfallReason.NOT_YOUR_TURN
      )
    ).toBe(true);
  });

  it('represents world time with the provider empty-declaration answer', () => {
    const freeRoam = SESSION_COMBAT_FIXTURES.find(
      (fixture) => fixture.id === 'free-roam'
    )!;

    expect(freeRoam.clock).toBe(ClockKind.WORLD);
    expect(freeRoam.declarations).toEqual([]);
    expect(
      freeRoam.participants.some((participant) => participant.active)
    ).toBe(false);
  });

  it('pins the provider CharacterData taxonomy for the level-3 Fighter', () => {
    for (const fixture of SESSION_COMBAT_FIXTURES) {
      const character = fixture.characterData;

      expect(
        character.features.map((feature) => ({
          typeName: feature.$typeName,
          ref: feature.ref && {
            module: feature.ref.module,
            type: feature.ref.type,
            id: feature.ref.id,
          },
          name: feature.name,
          detail: feature.detail,
          resourceKey: feature.resourceKey,
        })),
        fixture.id
      ).toEqual([
        {
          typeName: 'dnd5e.api.v1alpha2.encounter.FeatureView',
          ref: { module: 'dnd5e', type: 'features', id: 'action_surge' },
          name: 'Action Surge',
          detail: '',
          resourceKey: 'action_surge',
        },
        {
          typeName: 'dnd5e.api.v1alpha2.encounter.FeatureView',
          ref: { module: 'dnd5e', type: 'features', id: 'second_wind' },
          name: 'Second Wind',
          detail: '',
          resourceKey: 'second_wind',
        },
      ]);
      expect(
        character.conditions.map((condition) => ({
          typeName: condition.$typeName,
          ref: condition.ref && {
            module: condition.ref.module,
            type: condition.ref.type,
            id: condition.ref.id,
          },
          name: condition.name,
          detail: condition.detail,
        })),
        fixture.id
      ).toEqual([
        {
          typeName: 'dnd5e.api.v1alpha2.encounter.ConditionView',
          ref: {
            module: 'dnd5e',
            type: 'conditions',
            id: 'fighting_style_dueling',
          },
          name: 'Dueling',
          detail: '',
        },
      ]);
      expect(
        character.resources.map((resource) => ({
          typeName: resource.$typeName,
          key: resource.key,
          name: resource.name,
          current: resource.current,
          maximum: resource.maximum,
        })),
        fixture.id
      ).toEqual([
        {
          typeName: 'dnd5e.api.v1alpha2.encounter.ResourceView',
          key: 'action_surge',
          name: 'Action Surge',
          current: 1,
          maximum: 1,
        },
        {
          typeName: 'dnd5e.api.v1alpha2.encounter.ResourceView',
          key: 'hit_dice',
          name: 'Hit Dice',
          current: 3,
          maximum: 3,
        },
        {
          typeName: 'dnd5e.api.v1alpha2.encounter.ResourceView',
          key: 'second_wind',
          name: 'Second Wind',
          current: 1,
          maximum: 1,
        },
      ]);
    }
  });

  it('retains ordered Story and exhaustive Debug facts after catch-up', () => {
    const reconnected = SESSION_COMBAT_FIXTURES.find(
      (fixture) => fixture.id === 'reconnected'
    )!;

    expect(reconnected.streamState).toBe('caught-up');
    expect(reconnected.story.map((entry) => entry.id)).toEqual([
      'round-1-guard',
      'round-1-mira',
      'round-2-turn',
      'catch-up-restored',
    ]);
    expect(reconnected.debug.at(-1)).toContain(
      'catch_up from_seq=18 entries=3'
    );
  });
});
