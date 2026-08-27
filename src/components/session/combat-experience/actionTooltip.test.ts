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
