import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Class } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TurnOrderOverlay, type TurnOrderEntry } from './TurnOrderOverlay';

describe('TurnOrderOverlay entity icons', () => {
  it('distinguishes character from monster icons even with no Character[] data (GameView playtest gap)', () => {
    const turnOrder: TurnOrderEntry[] = [
      { entityId: 'char-alice', entityType: 'character', initiative: 15 },
      { entityId: 'goblin-1', entityType: 'monster', initiative: 10 },
    ];
    render(
      <TurnOrderOverlay
        turnOrder={turnOrder}
        activeIndex={0}
        characters={[]}
        round={1}
      />
    );
    // No Character objects supplied — the character entry must still render
    // a generic player icon, distinct from the monster icon, rather than
    // falling through to the same '👹' both used to share.
    expect(screen.getByText('🧍')).toBeTruthy();
    expect(screen.getByText('👹')).toBeTruthy();
  });

  it('still prefers the class emoji when full Character data is available (playtest harness path)', () => {
    const turnOrder: TurnOrderEntry[] = [
      { entityId: 'char-alice', entityType: 'character', initiative: 15 },
    ];
    const character = {
      id: 'char-alice',
      name: 'Alice',
      class: Class.WIZARD,
    } as unknown as Character;
    render(
      <TurnOrderOverlay
        turnOrder={turnOrder}
        activeIndex={0}
        characters={[character]}
        round={1}
      />
    );
    expect(screen.getByText('🧙')).toBeTruthy();
  });
});
