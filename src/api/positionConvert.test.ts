import { describe, expect, it } from 'vitest';
import { v2PositionToV1 } from './positionConvert';

describe('v2PositionToV1', () => {
  it('converts field values from v2 to v1', () => {
    const v2 = { x: 3, y: -2, z: -1 } as Parameters<typeof v2PositionToV1>[0];
    const v1 = v2PositionToV1(v2);
    expect(v1.x).toBe(3);
    expect(v1.y).toBe(-2);
    expect(v1.z).toBe(-1);
  });

  it('output has the v1 $typeName brand', () => {
    const v1 = v2PositionToV1({ x: 1, y: -1, z: 0 } as Parameters<
      typeof v2PositionToV1
    >[0]);
    // The bufbuild protobuf runtime sets $typeName on schema-constructed messages.
    expect((v1 as unknown as { $typeName: string }).$typeName).toBe(
      'api.v1alpha1.Position'
    );
  });

  it('handles zero coordinates', () => {
    const v1 = v2PositionToV1({ x: 0, y: 0, z: 0 } as Parameters<
      typeof v2PositionToV1
    >[0]);
    expect(v1.x).toBe(0);
    expect(v1.y).toBe(0);
    expect(v1.z).toBe(0);
  });
});
