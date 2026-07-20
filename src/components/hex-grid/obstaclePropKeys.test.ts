import { ObstacleType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { describe, expect, it } from 'vitest';
import {
  resolvePropKeyForEntity,
  resolvePropKeyForObstacleType,
  resolvePropKeyForRefId,
  resolvePropVariantForEntity,
  resolvePropVariantForObstacleType,
} from './obstaclePropKeys';

describe('resolvePropKeyForObstacleType', () => {
  it('maps every currently-mapped ObstacleType to its expected key', () => {
    expect(resolvePropKeyForObstacleType(ObstacleType.STALAGMITE)).toBe(
      'dnd5e:props:stalagmite'
    );
    expect(resolvePropKeyForObstacleType(ObstacleType.BOULDER)).toBe(
      'dnd5e:props:rock-pile'
    );
    expect(resolvePropKeyForObstacleType(ObstacleType.PILLAR)).toBe(
      'dnd5e:props:pillar'
    );
    expect(resolvePropKeyForObstacleType(ObstacleType.SARCOPHAGUS)).toBe(
      'dnd5e:props:tomb'
    );
    expect(resolvePropKeyForObstacleType(ObstacleType.CRATE)).toBe(
      'dnd5e:props:crate'
    );
    expect(resolvePropKeyForObstacleType(ObstacleType.BARREL)).toBe(
      'dnd5e:props:barrel'
    );
  });

  it('returns undefined for OBSTACLE_TYPE_UNSPECIFIED', () => {
    expect(
      resolvePropKeyForObstacleType(ObstacleType.UNSPECIFIED)
    ).toBeUndefined();
  });

  it('returns undefined for types with no shipped catalog match yet (STATUE, ALTAR, BRAZIER, TABLE)', () => {
    expect(resolvePropKeyForObstacleType(ObstacleType.STATUE)).toBeUndefined();
    expect(resolvePropKeyForObstacleType(ObstacleType.ALTAR)).toBeUndefined();
    expect(resolvePropKeyForObstacleType(ObstacleType.BRAZIER)).toBeUndefined();
    expect(resolvePropKeyForObstacleType(ObstacleType.TABLE)).toBeUndefined();
  });

  it('returns undefined for an undefined obstacleType', () => {
    expect(resolvePropKeyForObstacleType(undefined)).toBeUndefined();
  });
});

describe('resolvePropVariantForObstacleType', () => {
  it('resolves straight to a manifest variant for a mapped type', () => {
    const variant = resolvePropVariantForObstacleType(ObstacleType.BARREL);
    expect(variant?.name).toBe('SM_Prop_Barrel_01');
    expect(variant?.file).toBe('props/SM_Prop_Barrel_01.glb');
  });

  it('returns undefined for an unmapped type', () => {
    expect(
      resolvePropVariantForObstacleType(ObstacleType.STATUE)
    ).toBeUndefined();
  });

  it('returns undefined for an undefined obstacleType', () => {
    expect(resolvePropVariantForObstacleType(undefined)).toBeUndefined();
  });
});

describe('resolvePropKeyForRefId (v1alpha2 obstacle_ref/prop_ref.id — rpg-dnd5e-web#528)', () => {
  it('composes a refId straight into the dnd5e:props: namespace', () => {
    expect(resolvePropKeyForRefId('barrel')).toBe('dnd5e:props:barrel');
    expect(resolvePropKeyForRefId('rock-pile')).toBe('dnd5e:props:rock-pile');
  });

  it('returns undefined for an undefined or empty refId', () => {
    expect(resolvePropKeyForRefId(undefined)).toBeUndefined();
    expect(resolvePropKeyForRefId('')).toBeUndefined();
  });
});

describe('resolvePropKeyForEntity / resolvePropVariantForEntity', () => {
  it('prefers propRefId over obstacleType when both are present', () => {
    expect(
      resolvePropKeyForEntity({
        obstacleType: ObstacleType.PILLAR,
        propRefId: 'barrel',
      })
    ).toBe('dnd5e:props:barrel');
  });

  it('falls back to obstacleType when propRefId is absent', () => {
    expect(resolvePropKeyForEntity({ obstacleType: ObstacleType.PILLAR })).toBe(
      'dnd5e:props:pillar'
    );
  });

  it('returns undefined when neither signal is set', () => {
    expect(resolvePropKeyForEntity({})).toBeUndefined();
  });

  it('resolvePropVariantForEntity resolves a full variant from propRefId', () => {
    const variant = resolvePropVariantForEntity({ propRefId: 'crate' });
    expect(variant?.name).toBe('SM_Prop_Crate_Wood_02');
  });

  it('resolvePropVariantForEntity returns undefined for an unresolvable refId', () => {
    expect(
      resolvePropVariantForEntity({ propRefId: 'nonexistent-thing' })
    ).toBeUndefined();
  });
});
