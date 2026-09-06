import type { Participant } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  LifeState,
  Standing,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { CharacterData } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDeathSaveTruthHold } from './deathSaveTruthHold';

function participant(
  successes: number,
  overrides: Partial<Participant> = {}
): Participant {
  return {
    member: 'fighter-1',
    name: 'Aldric',
    kind: 1,
    standing: Standing.DOWNED,
    active: true,
    lifeState: LifeState.DYING,
    deathSaves: {
      successes,
      failures: 1,
      successesNeeded: 3 - successes,
      failuresRemaining: 2,
    },
    ...overrides,
  } as Participant;
}

function character(
  current: number,
  successes: number,
  overrides: Partial<CharacterData> = {}
): CharacterData {
  return {
    playerId: 'player-1',
    equipped: {},
    inventory: [],
    slots: [],
    mainHandDamage: '1d8 slashing',
    level: 3,
    hitPoints: { current, max: 28, temp: 0 },
    baseSpeedFeet: 30,
    features: [],
    conditions: [],
    resources: [],
    lifeState: LifeState.DYING,
    deathSaves: {
      successes,
      failures: 1,
      successesNeeded: 3 - successes,
      failuresRemaining: 2,
    },
    ...overrides,
  } as CharacterData;
}

describe('useDeathSaveTruthHold', () => {
  it('holds the last visible Participant and only owner HP/life/death progress until settlement', () => {
    const beforeParticipant = participant(1);
    const beforeCharacter = character(0, 1);
    const refreshedParticipant = participant(2, {
      standing: Standing.UP,
      lifeState: LifeState.CONSCIOUS,
      deathSaves: undefined,
    });
    const refreshedCharacter = character(1, 0, {
      level: 4,
      lifeState: LifeState.CONSCIOUS,
      deathSaves: undefined,
    });

    const { result, rerender } = renderHook(
      ({ conceal, presentationKey, participants, characterData }) =>
        useDeathSaveTruthHold({
          scopeKey: 'crypt-run\u0000fighter-1',
          conceal,
          presentationKey,
          participants,
          characterData,
        }),
      {
        initialProps: {
          conceal: false,
          presentationKey: undefined as string | undefined,
          participants: [beforeParticipant] as readonly Participant[],
          characterData: beforeCharacter as CharacterData | undefined,
        },
      }
    );

    rerender({
      conceal: true,
      presentationKey: 'death-save:one',
      participants: [refreshedParticipant],
      characterData: refreshedCharacter,
    });

    expect(result.current.participants).toEqual([beforeParticipant]);
    expect(result.current.characterData).toMatchObject({
      level: 4,
      hitPoints: { current: 0 },
      lifeState: LifeState.DYING,
      deathSaves: { successes: 1 },
    });

    // An off-table retry keeps the same presentation armed and the same hold.
    rerender({
      conceal: true,
      presentationKey: 'death-save:one',
      participants: [participant(3)],
      characterData: character(0, 3, { level: 5 }),
    });
    expect(result.current.participants).toEqual([beforeParticipant]);
    expect(result.current.characterData).toMatchObject({
      level: 5,
      hitPoints: { current: 0 },
      deathSaves: { successes: 1 },
    });

    rerender({
      conceal: false,
      presentationKey: undefined,
      participants: [refreshedParticipant],
      characterData: refreshedCharacter,
    });
    expect(result.current.participants).toEqual([refreshedParticipant]);
    expect(result.current.characterData).toBe(refreshedCharacter);
  });

  it('does not reuse a held snapshot across presentation or session/member scope changes', () => {
    const first = participant(1);
    const second = participant(2);
    const third = participant(3);
    const { result, rerender } = renderHook(
      ({ scopeKey, presentationKey, participants }) =>
        useDeathSaveTruthHold({
          scopeKey,
          conceal: true,
          presentationKey,
          participants,
          characterData: undefined,
        }),
      {
        initialProps: {
          scopeKey: 'crypt-run\u0000fighter-1',
          presentationKey: 'death-save:one',
          participants: [first] as readonly Participant[],
        },
      }
    );

    rerender({
      scopeKey: 'crypt-run\u0000fighter-1',
      presentationKey: 'death-save:two',
      participants: [second],
    });
    expect(result.current.participants).toEqual([second]);

    rerender({
      scopeKey: 'next-run\u0000wizard-1',
      presentationKey: 'death-save:three',
      participants: [third],
    });
    expect(result.current.participants).toEqual([third]);
  });
});
