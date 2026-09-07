import { create } from '@bufbuild/protobuf';
import {
  MemberKind,
  PublicMemberInfoSchema,
  type PublicMemberInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  FACTION_PALETTE,
  factionColors,
  isDeclaredFaction,
  sideCounts,
  sidesOnRoster,
} from './factionColor';

function roster(
  rows: [id: string, kind: MemberKind, faction: string][]
): ReadonlyMap<string, PublicMemberInfo> {
  return new Map(
    rows.map(([id, kind, faction]) => [
      id,
      create(PublicMemberInfoSchema, { id, name: id, kind, faction }),
    ])
  );
}

const CAMP = roster([
  ['p1', MemberKind.PLAYER, 'party'],
  ['chief', MemberKind.MONSTER, 'goblins'],
  ['scout', MemberKind.MONSTER, 'goblins'],
  ['wolf', MemberKind.MONSTER, 'wolves'],
  ['stray', MemberKind.MONSTER, 'monsters'],
  ['vendor', MemberKind.WORLD, ''],
]);

describe('factionColors (rpg-project#375 §7)', () => {
  it('assigns swatches to DECLARED factions by first appearance, and to nothing else', () => {
    const colors = factionColors(CAMP);
    expect([...colors]).toEqual([
      ['goblins', FACTION_PALETTE[0]],
      ['wolves', FACTION_PALETTE[1]],
    ]);
    expect(colors.has('party')).toBe(false);
    expect(colors.has('monsters')).toBe(false);
    expect(colors.has('')).toBe(false);
  });

  it('a dungeon that declares no faction gets no colours — the screen looks as it always did', () => {
    expect(
      factionColors(
        roster([
          ['p1', MemberKind.PLAYER, 'party'],
          ['sk', MemberKind.MONSTER, 'monsters'],
        ])
      ).size
    ).toBe(0);
  });

  it('is stable as the roster grows: an arrival appends, it never reorders', () => {
    const before = factionColors(CAMP);
    const grown = new Map(CAMP);
    grown.set(
      'reinforcement-1',
      create(PublicMemberInfoSchema, {
        id: 'reinforcement-1',
        kind: MemberKind.MONSTER,
        faction: 'goblins',
      })
    );
    grown.set(
      'bear',
      create(PublicMemberInfoSchema, {
        id: 'bear',
        kind: MemberKind.MONSTER,
        faction: 'bears',
      })
    );
    const after = factionColors(grown);
    expect(after.get('goblins')).toBe(before.get('goblins'));
    expect(after.get('wolves')).toBe(before.get('wolves'));
    expect(after.get('bears')).toBe(FACTION_PALETTE[2]);
  });

  it('lists every side once in roster order, and counts them', () => {
    expect(sidesOnRoster(CAMP)).toEqual([
      'party',
      'goblins',
      'wolves',
      'monsters',
    ]);
    expect([...sideCounts(CAMP)]).toEqual([
      ['party', 1],
      ['goblins', 2],
      ['wolves', 1],
      ['monsters', 1],
    ]);
  });

  it('a roster row with NO faction field at all is a member on no side — never a crash', () => {
    // A server older than the field, or a partial fixture: the row is a
    // plain object without `faction`, not the proto default of ''.
    const partial = new Map<string, PublicMemberInfo>([
      ['p1', { id: 'p1', name: 'Aldric', kind: MemberKind.PLAYER } as never],
      [
        'chief',
        {
          id: 'chief',
          name: 'chief',
          kind: MemberKind.MONSTER,
          faction: 'goblins',
        } as never,
      ],
    ]);
    expect(sidesOnRoster(partial)).toEqual(['goblins']);
    expect([...sideCounts(partial)]).toEqual([['goblins', 1]]);
    expect(factionColors(partial).get('goblins')).toBe(FACTION_PALETTE[0]);
  });

  it('knows the reserved sides from a declared one', () => {
    expect(isDeclaredFaction('goblins')).toBe(true);
    expect(isDeclaredFaction('party')).toBe(false);
    expect(isDeclaredFaction('monsters')).toBe(false);
    expect(isDeclaredFaction('')).toBe(false);
  });
});
