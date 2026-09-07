import { describe, expect, it } from 'vitest';
import { compositionIdFromRef, compositionRef } from './compositionRef';

describe('composition prop references', () => {
  it('round-trips only the opaque Composition.ID in the existing ref field', () => {
    const ref = compositionRef('decorated-table-a1b2');
    expect(ref).toBe('composition:props:decorated-table-a1b2');
    expect(compositionIdFromRef(ref)).toBe('decorated-table-a1b2');
    expect(ref).not.toContain('world');
  });

  it('does not claim other or multi-part prop refs', () => {
    expect(compositionIdFromRef('dnd5e:props:table')).toBeNull();
    expect(compositionIdFromRef('composition:props:a:b')).toBeNull();
    expect(() => compositionRef('not:a-token')).toThrow(/one non-empty/i);
  });
});
