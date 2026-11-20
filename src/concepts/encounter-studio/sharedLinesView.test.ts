/**
 * The conversations written once, read from the engine's read-back
 * (rpg-project#1027): the list, its carriers, its lines and each carrier's
 * own lines come from statements and connections, never from the file.
 */
import { describe, expect, it } from 'vitest';
import { conversationsSiteReadBack } from './fixtures/engineReadBack';
import { lineCounts, sharedConversationsOf } from './sharedLinesView';

describe('the conversations written once, from the read-back', () => {
  const conversations = sharedConversationsOf(conversationsSiteReadBack());
  const gate = conversations.find((c) => c.id === 'gate-claims');

  it('lists the conversation the engine says is written once, at its path', () => {
    expect(gate).toBeDefined();
    expect(gate!.path).toBe('conversations.gate-claims');
  });

  it('carries it by each carrier the engine connects with `carries`', () => {
    expect(gate!.carriers).toEqual(
      expect.arrayContaining([
        { kind: 'creature', id: 'gate-1' },
        { kind: 'creature', id: 'gate-2' },
        { kind: 'creature', id: 'captain' },
      ])
    );
  });

  it('places each carrier’s `use:` at the entry the engine names', () => {
    expect(gate!.uses).toEqual(
      expect.arrayContaining([
        {
          carrier: { kind: 'creature', id: 'gate-1' },
          path: 'room.room.monsterBindings.gate-1.options[0]',
        },
        {
          carrier: { kind: 'creature', id: 'captain' },
          path: 'room.room.monsterBindings.captain.options[1]',
        },
      ])
    );
  });

  it('holds the lines said once at the conversation, never a carrier’s copy', () => {
    expect(gate!.linePaths).toEqual(
      expect.arrayContaining([
        'conversations.gate-claims.lines[0]',
        'conversations.gate-claims.lines[1]',
        'conversations.gate-claims.lines[2]',
        'conversations.gate-claims.lines[3]',
      ])
    );
    expect(
      gate!.linePaths.every((path) => path.startsWith('conversations.'))
    ).toBe(true);
    expect(lineCounts(conversations).get('gate-claims')).toBe(4);
  });

  it('keeps the captain’s own line beside the conversation, as his', () => {
    expect(gate!.ownLines).toContainEqual({
      carrier: { kind: 'creature', id: 'captain' },
      path: 'room.room.monsterBindings.captain.options[0]',
    });
    expect(gate!.ownLines.some((line) => line.carrier.id === 'gate-1')).toBe(
      false
    );
  });

  it('says nothing without a read-back', () => {
    expect(sharedConversationsOf(null)).toEqual([]);
  });
});
