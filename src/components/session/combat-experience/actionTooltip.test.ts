// @vitest-environment node
import {
  DamageType,
  Slot,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { actionTooltipText, buildActionTooltip } from './actionTooltip';

function declaration(overrides: Partial<Declaration> = {}): Declaration {
  return {
    id: 'v1.attack',
    verb: Verb.ATTACK,
    slot: Slot.ACTION,
    available: true,
    candidates: [],
    targetKind: 0,
    ...overrides,
  } as Declaration;
}

const valueFor = (
  tooltip: ReturnType<typeof buildActionTooltip>,
  label: string
) => tooltip.lines.find((line) => line.label === label)?.value;

describe('buildActionTooltip', () => {
  it('titles an attack with the weapon the server named', () => {
    const tooltip = buildActionTooltip(
      declaration({
        attack: {
          ref: 'dnd5e:weapons:longsword',
          name: 'Longsword',
          damageType: DamageType.SLASHING,
        },
      } as Partial<Declaration>)
    );
    expect(tooltip.title).toBe('Longsword');
    expect(valueFor(tooltip, 'Damage')).toBe('slashing');
    expect(valueFor(tooltip, 'Costs')).toBe('Action');
  });

  it('omits the damage line rather than inventing one', () => {
    // DamageType is a closed set; an unset/unknown value has no word, and a
    // bare "Damage:" row would read as a bug.
    const tooltip = buildActionTooltip(
      declaration({
        attack: { ref: 'x', name: 'Unarmed strike', damageType: 0 },
      } as Partial<Declaration>)
    );
    expect(valueFor(tooltip, 'Damage')).toBeUndefined();
  });

  it('names a bonus-action ability by its own name', () => {
    const tooltip = buildActionTooltip(
      declaration({
        verb: Verb.ACTIVATE,
        slot: Slot.BONUS,
        ability: { ref: 'dnd5e:features:rage', name: 'Rage' },
      } as Partial<Declaration>)
    );
    expect(tooltip.title).toBe('Rage');
    expect(valueFor(tooltip, 'Costs')).toBe('Bonus action');
    // No weapon, so nothing to say about damage.
    expect(valueFor(tooltip, 'Damage')).toBeUndefined();
  });

  it('reports movement verbatim in feet', () => {
    const tooltip = buildActionTooltip(
      declaration({ verb: Verb.MOVE, remaining: 25 })
    );
    expect(tooltip.title).toBe('Move');
    expect(valueFor(tooltip, 'Movement')).toBe('25 ft left');
  });

  it('treats 0 ft as a real answer', () => {
    const tooltip = buildActionTooltip(
      declaration({ verb: Verb.MOVE, remaining: 0 })
    );
    expect(valueFor(tooltip, 'Movement')).toBe('0 ft left');
  });

  it('says nothing about movement when the verb carries no budget', () => {
    expect(
      valueFor(buildActionTooltip(declaration()), 'Movement')
    ).toBeUndefined();
  });

  it('counts the targets the server offered, singular and plural', () => {
    expect(
      valueFor(
        buildActionTooltip(declaration({ candidates: [{}] as never })),
        'In reach'
      )
    ).toBe('1 target');
    expect(
      valueFor(
        buildActionTooltip(declaration({ candidates: [{}, {}, {}] as never })),
        'In reach'
      )
    ).toBe('3 targets');
    expect(
      valueFor(buildActionTooltip(declaration()), 'In reach')
    ).toBeUndefined();
  });

  it('carries the refusal in the server’s own words, and only when refused', () => {
    expect(buildActionTooltip(declaration()).refusal).toBeUndefined();
    expect(
      buildActionTooltip(
        declaration({
          available: false,
          why: { text: 'movement: 20 ft needed, 15 ft left' },
        } as Partial<Declaration>)
      ).refusal
    ).toBe('movement: 20 ft needed, 15 ft left');
  });

  it('still says something when a refused offer carries no words', () => {
    expect(buildActionTooltip(declaration({ available: false })).refusal).toBe(
      'Unavailable'
    );
  });
});

describe('actionTooltipText', () => {
  it('flattens to one readable line', () => {
    const tooltip = buildActionTooltip(
      declaration({
        attack: {
          ref: 'dnd5e:weapons:longsword',
          name: 'Longsword',
          damageType: DamageType.SLASHING,
        },
      } as Partial<Declaration>)
    );
    expect(actionTooltipText(tooltip)).toBe(
      'Longsword · Damage: slashing · Costs: Action'
    );
  });

  it('appends the refusal last', () => {
    const tooltip = buildActionTooltip(
      declaration({
        available: false,
        why: { text: 'not your turn' },
      } as Partial<Declaration>)
    );
    expect(actionTooltipText(tooltip)).toContain('Unavailable — not your turn');
  });
});

// The tooltip is the SEVENTH hand-written verb site (rpg-project#458).
// rpg-dnd5e-web#1104 enumerated six; this one was found on the walk, drawing a
// row labelled "Persuade" whose own tooltip was titled "Move".
describe('the social verbs in the tooltip', () => {
  it('titles each social row with its own name, not the Move default', () => {
    expect(
      buildActionTooltip(
        declaration({ verb: Verb.INTIMIDATE, slot: Slot.NONE })
      ).title
    ).toBe('Intimidate');
    expect(
      buildActionTooltip(declaration({ verb: Verb.PERSUADE, slot: Slot.NONE }))
        .title
    ).toBe('Persuade');
  });

  it('shows NO cost line for a row the server sent free', () => {
    // "Costs: No turn slot" is a sentence about a turn economy, and on the
    // world clock there is none. The badge is already suppressed; a tooltip
    // that still said it would move the wrong claim one hover away.
    const tooltip = buildActionTooltip(
      declaration({ verb: Verb.PERSUADE, slot: Slot.NONE, cost: [] })
    );
    expect(
      tooltip.lines.find((line) => line.label === 'Costs')
    ).toBeUndefined();
    expect(actionTooltipText(tooltip)).not.toContain('No turn slot');
  });

  it('keeps the cost line when the same verb arrives priced', () => {
    // The SLOT is the test and not the clock, so a social verb on the turn
    // clock still tells the player what it spends.
    const tooltip = buildActionTooltip(
      declaration({ verb: Verb.PERSUADE, slot: Slot.ACTION })
    );
    expect(tooltip.lines.find((line) => line.label === 'Costs')?.value).toBe(
      'Action'
    );
  });

  it('keeps a provider cost even on a slotless row', () => {
    // Free of a TURN SLOT is not free of everything: a row that spends a
    // charge still says so, and dropping the whole line would hide it.
    const tooltip = buildActionTooltip(
      declaration({
        verb: Verb.PERSUADE,
        slot: Slot.NONE,
        cost: [{ needed: 1, label: 'Bardic Inspiration' } as never],
      })
    );
    expect(tooltip.lines.find((line) => line.label === 'Costs')?.value).toBe(
      '1 Bardic Inspiration'
    );
  });
});
