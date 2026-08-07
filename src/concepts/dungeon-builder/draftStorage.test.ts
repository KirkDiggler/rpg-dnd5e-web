import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { discardDraft, loadDraft, saveDraft } from './draftStorage';

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
});
