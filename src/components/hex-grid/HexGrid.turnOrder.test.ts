import { create } from '@bufbuild/protobuf';
import { WallSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import { rememberedWallRunIds, visibleTurnOrder } from './HexGrid';

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

describe('HexGrid wall-run memory classification', () => {
  it('marks only fully remembered non-empty floor regions and remembered wall IDs', () => {
    const result = rememberedWallRunIds(
      new Map([
        ['0,0,0', { x: 0, y: 0, z: 0, roomId: 'remembered-room' }],
        ['1,-1,0', { x: 1, y: -1, z: 0, roomId: 'remembered-room' }],
        ['2,-2,0', { x: 2, y: -2, z: 0, roomId: 'live-room' }],
        ['3,-3,0', { x: 3, y: -3, z: 0, roomId: '' }],
      ]),
      new Set(['0,0,0', '1,-1,0']),
      [
        create(WallSchema, {
          id: 'remembered-door',
          from: { x: 0, y: 0, z: 0 },
        }),
        create(WallSchema, { id: 'live-door', from: { x: 2, y: -2, z: 0 } }),
        create(WallSchema, { id: '', from: { x: 0, y: 0, z: 0 } }),
      ],
      new Set(['0,0,0'])
    );

    expect(result.envelopeRegionIds).toEqual(new Set(['remembered-room']));
    expect(result.connectorDoorIds).toEqual(new Set(['remembered-door']));
  });

  it('keeps a region live when any known floor is visible', () => {
    const result = rememberedWallRunIds(
      new Map([
        ['0,0,0', { x: 0, y: 0, z: 0, roomId: 'mixed-room' }],
        ['1,-1,0', { x: 1, y: -1, z: 0, roomId: 'mixed-room' }],
      ]),
      new Set(['0,0,0']),
      [],
      new Set()
    );

    expect(result.envelopeRegionIds).toEqual(new Set());
  });
});
