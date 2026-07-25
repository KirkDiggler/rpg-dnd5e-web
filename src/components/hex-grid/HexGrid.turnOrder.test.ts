import { describe, expect, it } from 'vitest';
import { visibleTurnOrder } from './HexGrid';

describe('HexGrid turn order knowledge filtering', () => {
  it('excludes remembered entities while retaining omitted and visible entries', () => {
    const turnOrder = visibleTurnOrder(
      [
        { entityId: 'visible', knowledgeState: 'visible' },
        { entityId: 'remembered', knowledgeState: 'remembered' },
        { entityId: 'omitted' },
      ],
      [
        { entityId: 'visible', entityType: 'player', initiative: 20 },
        { entityId: 'remembered', entityType: 'monster', initiative: 15 },
        { entityId: 'omitted', entityType: 'player', initiative: 10 },
      ]
    );

    expect(turnOrder).toEqual([
      { entityId: 'visible', entityType: 'player', initiative: 20 },
      { entityId: 'omitted', entityType: 'player', initiative: 10 },
    ]);
  });
});
