import { create } from '@bufbuild/protobuf';
import { CharacterSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  Class,
  Race,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CharacterHeader } from './CharacterHeader';

function character(overrides: {
  level: number;
  entitledLevel: number;
  experiencePoints: number;
  nextLevelThreshold: number;
}) {
  return create(CharacterSchema, {
    id: 'char-1',
    name: 'Arthur',
    race: Race.HUMAN,
    class: Class.FIGHTER,
    ...overrides,
  });
}

describe('CharacterHeader experience and the level-up prompt', () => {
  it('shows the total against the threshold the next level needs', () => {
    render(
      <CharacterHeader
        character={character({
          level: 1,
          entitledLevel: 1,
          experiencePoints: 120,
          nextLevelThreshold: 300,
        })}
      />
    );

    expect(screen.getByTestId('experience-readout')).toHaveTextContent(
      '120 / 300'
    );
  });

  it('shows the total alone at the top of the table, where there is no next level', () => {
    render(
      <CharacterHeader
        character={character({
          level: 20,
          entitledLevel: 20,
          experiencePoints: 355000,
          nextLevelThreshold: 0,
        })}
      />
    );

    const readout = screen.getByTestId('experience-readout');
    expect(readout).toHaveTextContent('355000');
    expect(readout.textContent).not.toContain('/');
  });

  it('offers the level when entitlement runs ahead of the record', () => {
    const onLevelUp = vi.fn();
    render(
      <CharacterHeader
        character={character({
          level: 1,
          entitledLevel: 2,
          experiencePoints: 300,
          nextLevelThreshold: 900,
        })}
        onLevelUp={onLevelUp}
      />
    );

    const prompt = screen.getByTestId('level-up-prompt');
    expect(prompt).toHaveTextContent('Level Up to 2');

    fireEvent.click(prompt);
    expect(onLevelUp).toHaveBeenCalledTimes(1);
  });

  it('offers nothing to a freshly created character, which is the true state of a game that awards no experience', () => {
    render(
      <CharacterHeader
        character={character({
          level: 1,
          entitledLevel: 1,
          experiencePoints: 0,
          nextLevelThreshold: 300,
        })}
        onLevelUp={vi.fn()}
      />
    );

    expect(screen.getByTestId('experience-readout')).toHaveTextContent(
      '0 / 300'
    );
    expect(screen.queryByTestId('level-up-prompt')).not.toBeInTheDocument();
  });

  it('offers nothing to a character that has already taken the level it is entitled to', () => {
    render(
      <CharacterHeader
        character={character({
          level: 2,
          entitledLevel: 2,
          experiencePoints: 400,
          nextLevelThreshold: 900,
        })}
        onLevelUp={vi.fn()}
      />
    );

    expect(screen.queryByTestId('level-up-prompt')).not.toBeInTheDocument();
  });
});
