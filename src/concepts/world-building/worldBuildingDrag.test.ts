import { describe, expect, it } from 'vitest';
import {
  WORLD_BUILDING_DRAG_MIME,
  readWorldBuildingDragPayload,
  writeWorldBuildingDragPayload,
} from './worldBuildingDrag';

class TransferStub {
  values = new Map<string, string>();
  effectAllowed = 'uninitialized';
  dropEffect = 'none';
  get types(): readonly string[] {
    return [...this.values.keys()];
  }
  getData(type: string): string {
    return this.values.get(type) ?? '';
  }
  setData(type: string, value: string): void {
    this.values.set(type, value);
  }
}

describe('world-building bounded HTML drag payload', () => {
  it('round trips a catalog reference through the private MIME type', () => {
    const transfer = new TransferStub();
    writeWorldBuildingDragPayload(transfer, {
      kind: 'prop',
      id: 'dnd5e:props:books',
    });

    expect(transfer.effectAllowed).toBe('copy');
    expect(transfer.types).toContain(WORLD_BUILDING_DRAG_MIME);
    expect(readWorldBuildingDragPayload(transfer)).toEqual({
      kind: 'prop',
      id: 'dnd5e:props:books',
    });
  });

  it.each([
    ['', 'missing private payload'],
    ['not json', 'malformed payload'],
    [JSON.stringify({ kind: 'prop', id: '' }), 'empty identity'],
    [
      JSON.stringify({ kind: 'url', id: 'https://invalid.example/a.glb' }),
      'arbitrary kind',
    ],
    [
      JSON.stringify({ kind: 'prop', id: 'x'.repeat(161) }),
      'oversized identity',
    ],
    [
      JSON.stringify({ kind: 'prop', id: 'dnd5e:props:books', extra: true }),
      'extra fields',
    ],
  ])('rejects %s (%s)', (encoded) => {
    const transfer = new TransferStub();
    if (encoded) transfer.setData(WORLD_BUILDING_DRAG_MIME, encoded);

    expect(readWorldBuildingDragPayload(transfer)).toBeNull();
  });
});
