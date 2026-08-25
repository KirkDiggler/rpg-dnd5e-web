import {
  ClockKind,
  ShortfallReason,
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
    expect(JSON.stringify(fresh)).not.toMatch(
      /Healing Potion|Blessed|\bDodge\b|\bDash\b|Spells/
    );
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

  it('keeps current non-magical Fighter facts informational in CharacterData', () => {
    const character = SESSION_COMBAT_FIXTURES[0]!.characterData;

    expect(character.features.map((feature) => feature.name)).toEqual([
      'Dueling',
      'Second Wind',
      'Action Surge',
    ]);
    expect(character.conditions).toEqual([]);
    expect(character.resources.map((resource) => resource.name)).toEqual([
      'Second Wind',
      'Action Surge',
    ]);
    expect(character.inventory).toEqual([]);
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
