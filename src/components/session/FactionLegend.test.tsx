import { create } from '@bufbuild/protobuf';
import {
  MemberKind,
  PublicMemberInfoSchema,
  type PublicMemberInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FACTION_PALETTE, SIDE_COLORS } from './factionColor';
import { FactionLegend } from './FactionLegend';

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

describe('the sides legend (rpg-project#375 §7: roster coloured by faction)', () => {
  it('renders nothing for a dungeon that declares no faction', () => {
    render(
      <FactionLegend
        roster={roster([
          ['p1', MemberKind.PLAYER, 'party'],
          ['sk', MemberKind.MONSTER, 'monsters'],
        ])}
      />
    );
    expect(screen.queryByTestId('faction-legend')).toBeNull();
  });

  it('shows every side with its swatch and count once a declared faction is on the roster', () => {
    render(
      <FactionLegend
        roster={roster([
          ['p1', MemberKind.PLAYER, 'party'],
          ['p2', MemberKind.PLAYER, 'party'],
          ['chief', MemberKind.MONSTER, 'goblins'],
          ['scout', MemberKind.MONSTER, 'goblins'],
          ['stray', MemberKind.MONSTER, 'monsters'],
        ])}
      />
    );
    const legend = screen.getByTestId('faction-legend');
    expect(legend).toBeTruthy();
    const goblins = screen.getByTestId('faction-legend-goblins');
    expect(goblins.textContent).toContain('goblins · 2');
    expect(goblins.getAttribute('data-color')).toBe(FACTION_PALETTE[0]);
    // The swatch itself is painted that colour — the DOM, not a prop.
    const swatch = goblins.querySelector('i') as HTMLElement;
    expect(swatch.style.background).toBe('rgb(56, 178, 172)');
    // The reserved sides keep the map's own blue and red.
    expect(
      screen.getByTestId('faction-legend-party').getAttribute('data-color')
    ).toBe(SIDE_COLORS.party);
    expect(
      screen.getByTestId('faction-legend-monsters').getAttribute('data-color')
    ).toBe(SIDE_COLORS.monsters);
    expect(screen.getByTestId('faction-legend-party').textContent).toContain(
      'party · 2'
    );
  });
});
