import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  discardDraft,
  draftDiffersFromFreshSeed,
  loadDraft,
  saveDraft,
} from './draftStorage';

describe('draftStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a saved draft', () => {
    saveDraft('edit', 'version: 1\nkey: foo\n');
    const loaded = loadDraft('edit');
    expect(loaded).not.toBeNull();
    expect(loaded!.yamlText).toBe('version: 1\nkey: foo\n');
    expect(typeof loaded!.savedAt).toBe('number');
  });

  it('returns null when nothing has been saved for that mode', () => {
    expect(loadDraft('edit')).toBeNull();
  });

  it('keeps edit and create drafts independent', () => {
    saveDraft('edit', 'edit-doc');
    saveDraft('create', 'create-doc');
    expect(loadDraft('edit')!.yamlText).toBe('edit-doc');
    expect(loadDraft('create')!.yamlText).toBe('create-doc');
  });

  it('a later save for the same mode overwrites the earlier one', () => {
    saveDraft('edit', 'first');
    saveDraft('edit', 'second');
    expect(loadDraft('edit')!.yamlText).toBe('second');
  });

  it('discardDraft removes the stored draft', () => {
    saveDraft('edit', 'doomed');
    discardDraft('edit');
    expect(loadDraft('edit')).toBeNull();
  });

  it('discarding one mode does not touch the other', () => {
    saveDraft('edit', 'edit-doc');
    saveDraft('create', 'create-doc');
    discardDraft('edit');
    expect(loadDraft('edit')).toBeNull();
    expect(loadDraft('create')!.yamlText).toBe('create-doc');
  });

  it('treats corrupt JSON under the key as no draft, not a crash', () => {
    localStorage.setItem('dungeon-builder:draft:edit', 'not json{{{');
    expect(loadDraft('edit')).toBeNull();
  });

  it('treats a foreign/malformed value (missing fields) as no draft', () => {
    localStorage.setItem(
      'dungeon-builder:draft:edit',
      JSON.stringify({ somethingElse: true })
    );
    expect(loadDraft('edit')).toBeNull();
  });

  describe('storage failures are best-effort, never thrown', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('saveDraft swallows a setItem failure (quota/private-mode)', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('quota exceeded');
      });
      expect(() => saveDraft('edit', 'anything')).not.toThrow();
    });

    it('loadDraft swallows a getItem failure', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage unavailable');
      });
      expect(() => loadDraft('edit')).not.toThrow();
      expect(loadDraft('edit')).toBeNull();
    });

    it('discardDraft swallows a removeItem failure', () => {
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('storage unavailable');
      });
      expect(() => discardDraft('edit')).not.toThrow();
    });
  });

  describe('draftDiffersFromFreshSeed (honesty guard, Copilot review PR #717)', () => {
    // An identity canonicalizer is enough to test THIS function's own
    // comparison/normalization logic in isolation — the real
    // `dungeonYaml.ts` parse+serialize round trip is exercised instead by
    // `DungeonBuilderConcept.tsx`'s own live-verified call site (see
    // CONTRACT.md).
    const identity = (s: string) => s;

    it('identical text is NOT meaningfully different', () => {
      expect(draftDiffersFromFreshSeed('same', 'same', identity)).toBe(false);
    });

    it('different text IS meaningfully different', () => {
      expect(draftDiffersFromFreshSeed('edited', 'fresh-seed', identity)).toBe(
        true
      );
    });

    it('normalizes flow-sequence bracket padding before comparing — the pre-existing yaml package quirk does not count as a real difference', () => {
      const padded = 'wallLines: [ { from: [ 2, 2 ] } ]';
      const unpadded = 'wallLines: [{ from: [2, 2] }]';
      expect(draftDiffersFromFreshSeed(padded, unpadded, identity)).toBe(false);
    });

    it('falls back to true (meaningful) when canonicalize throws for either input — the safe failure direction', () => {
      const throwing = () => {
        throw new Error('parse failure');
      };
      expect(draftDiffersFromFreshSeed('a', 'b', throwing)).toBe(true);
    });

    it('calls canonicalize on both the draft and the fresh seed, not just one', () => {
      const seen: string[] = [];
      const canonicalize = (s: string) => {
        seen.push(s);
        return s;
      };
      draftDiffersFromFreshSeed('draft-text', 'seed-text', canonicalize);
      expect(seen).toEqual(['draft-text', 'seed-text']);
    });
  });
});
