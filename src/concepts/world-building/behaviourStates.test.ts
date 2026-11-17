/**
 * THE STATES A POST MAY BE KEYED BY (rpg-project#975 D review): the body
 * behaviour is resolved exactly as the engine resolves it
 * (`dungeonspec/behaviors.go` `roomBehaviorInput`, `bindBehaviorSource`),
 * and every state of its recipe is offered — the engine
 * (`encounter.validatePostStates`) accepts any.
 */
import { describe, expect, it } from 'vitest';
import { behaviourStates } from './behaviourChoice';
import type { RoomMonsterBinding } from './roomDraft';
import type { SiteScope } from './siteScope';

const definition = (states: Record<string, unknown>) => ({
  recipe: { ref: 'x', initial: Object.keys(states)[0], states },
});

const scope = (factions: SiteScope['factions'] = []): SiteScope => ({
  factions,
  unread: {
    behaviorDefinitions: {
      guard: definition({ posted: {}, alert: {}, done: { terminal: true } }),
      patrol: definition({ walking: {}, resting: {} }),
    },
  },
});

const binding = (b: Record<string, unknown>) =>
  b as unknown as RoomMonsterBinding;

describe('behaviourStates mirrors the engine', () => {
  it('offers every state of the recipe, a terminal one too', () => {
    expect(
      behaviourStates(
        scope(),
        binding({ behaviors: [{ id: 'policy', use: 'guard' }] })
      )
    ).toEqual({
      kind: 'states',
      behaviour: 'guard',
      states: ['posted', 'alert', 'done'],
    });
  });

  it('several own behaviours and no behaviorState: the engine needs one named', () => {
    expect(
      behaviourStates(
        scope(),
        binding({
          behaviors: [
            { id: 'a', use: 'guard' },
            { id: 'b', use: 'patrol' },
          ],
        })
      )
    ).toEqual({ kind: 'ambiguous' });
  });

  it('a behaviorState naming no attached behaviour is refused by the engine', () => {
    expect(
      behaviourStates(
        scope(),
        binding({
          behaviors: [{ id: 'a', use: 'guard' }],
          behaviorState: 'nope',
        })
      )
    ).toEqual({ kind: 'unattached', body: 'nope' });
  });

  it('the creature’s own behaviorState wins over its faction’s', () => {
    const factions = [
      {
        id: 'garrison',
        behaviors: [
          { id: 'a', use: 'guard' },
          { id: 'b', use: 'patrol' },
        ],
        behaviorState: 'a',
      },
    ] as unknown as SiteScope['factions'];
    expect(
      behaviourStates(
        scope(factions),
        binding({ faction: 'garrison', behaviorState: 'b' })
      )
    ).toMatchObject({ kind: 'states', behaviour: 'patrol' });
  });

  it('no faction key reads as `monsters`', () => {
    const factions = [
      { id: 'monsters', behaviors: [{ id: 'policy', use: 'patrol' }] },
    ] as unknown as SiteScope['factions'];
    expect(behaviourStates(scope(factions), binding({}))).toMatchObject({
      kind: 'states',
      behaviour: 'patrol',
    });
  });

  it('`behaviors: []` does not fall back to the faction', () => {
    const factions = [
      { id: 'monsters', behaviors: [{ id: 'policy', use: 'patrol' }] },
    ] as unknown as SiteScope['factions'];
    expect(
      behaviourStates(scope(factions), binding({ behaviors: [] }))
    ).toEqual({ kind: 'none' });
  });
});
