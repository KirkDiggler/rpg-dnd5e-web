import type { Participant } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  MemberKind,
  Standing,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  participantNameMap,
  resolveName,
  resolveNameLower,
} from './participantNames';

function participant(overrides: Partial<Participant> = {}): Participant {
  return {
    member: 'skeleton-1',
    name: 'skeleton-1',
    kind: MemberKind.MONSTER,
    standing: Standing.UP,
    active: false,
    ...overrides,
  } as Participant;
}

describe('participantNameMap', () => {
  it('builds a member id -> name lookup', () => {
    const map = participantNameMap([
      participant({ member: 'char-1', name: 'Aldric' }),
      participant({ member: 'skeleton-1', name: 'skeleton-1' }),
    ]);
    expect(map.get('char-1')).toBe('Aldric');
    expect(map.get('skeleton-1')).toBe('skeleton-1');
  });

  it('an empty roster builds an empty map', () => {
    expect(participantNameMap([]).size).toBe(0);
  });
});

describe('resolveName', () => {
  it('"You" for the local player, regardless of what the roster names them', () => {
    const map = participantNameMap([
      participant({ member: 'char-1', name: 'Aldric' }),
    ]);
    expect(resolveName(map, 'char-1', 'char-1')).toBe('You');
  });

  it("the roster's own name for anyone else", () => {
    const map = participantNameMap([
      participant({ member: 'skeleton-1', name: 'skeleton-1' }),
    ]);
    expect(resolveName(map, 'skeleton-1', 'char-1')).toBe('skeleton-1');
  });

  it('falls back to the raw id for a member the roster has not named (defensive)', () => {
    const map = participantNameMap([]);
    expect(resolveName(map, 'ghost-1', 'char-1')).toBe('ghost-1');
  });
});

describe('resolveNameLower', () => {
  it('lowercase "you" for the local player', () => {
    const map = participantNameMap([]);
    expect(resolveNameLower(map, 'char-1', 'char-1')).toBe('you');
  });

  it("the roster's own name for anyone else, unchanged", () => {
    const map = participantNameMap([
      participant({ member: 'skeleton-1', name: 'skeleton-1' }),
    ]);
    expect(resolveNameLower(map, 'skeleton-1', 'char-1')).toBe('skeleton-1');
  });
});
