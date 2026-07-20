import { describe, expect, it } from 'vitest';
import { isLocalPlayerEntity, resolveEntityTint } from './selectionVisuals';

describe('resolveEntityTint', () => {
  it('does not tint the local player even when selectedEntityId is their own id (rpg-dnd5e-web#515 root cause)', () => {
    // Mirrors EncounterMap.tsx/PlaytestMap.tsx's real wiring today: both
    // pass selectedEntityId={myEntityId}, i.e. selectedEntityId ===
    // currentEntityId for the local player on every render.
    expect(resolveEntityTint('char-alice', 'char-alice', 'char-alice')).toBe(
      false
    );
  });

  it('tints a non-local entity that matches selectedEntityId', () => {
    // Forward-compat: if a real target-selection feature ever sets
    // selectedEntityId to something other than the local player, that
    // target should still get the tint.
    expect(resolveEntityTint('goblin-1', 'goblin-1', 'char-alice')).toBe(true);
  });

  it('does not tint an entity that is neither selected nor local', () => {
    expect(resolveEntityTint('goblin-2', 'goblin-1', 'char-alice')).toBe(false);
  });

  it('does not tint the local player when nothing is selected', () => {
    expect(resolveEntityTint('char-alice', undefined, 'char-alice')).toBe(
      false
    );
  });

  it('treats a null currentEntityId (HexGridProps allows null) as "no local player" without throwing', () => {
    expect(resolveEntityTint('char-alice', 'char-alice', null)).toBe(true);
  });

  it('treats an undefined currentEntityId the same way', () => {
    expect(resolveEntityTint('char-alice', 'char-alice', undefined)).toBe(true);
  });
});

describe('isLocalPlayerEntity', () => {
  it('is true for the local player entity id', () => {
    expect(isLocalPlayerEntity('char-alice', 'char-alice')).toBe(true);
  });

  it('is false for any other entity id', () => {
    expect(isLocalPlayerEntity('goblin-1', 'char-alice')).toBe(false);
  });

  it('is false when currentEntityId is null or undefined', () => {
    expect(isLocalPlayerEntity('char-alice', null)).toBe(false);
    expect(isLocalPlayerEntity('char-alice', undefined)).toBe(false);
  });
});
