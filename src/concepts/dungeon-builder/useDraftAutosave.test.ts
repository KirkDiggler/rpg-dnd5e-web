import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { discardDraft, loadDraft } from './draftStorage';
import { useDraftAutosave } from './useDraftAutosave';

// These three tests are the direct regression coverage for the Copilot
// review finding on PR #717: pristine mount must never look like a
// restored draft, and an explicit discard must survive the very next
// autosave tick instead of being silently undone by it.
describe('useDraftAutosave', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does NOT autosave on initial mount, even after the debounce delay elapses (no false "draft restored")', () => {
    renderHook(() => useDraftAutosave('edit', 'version: 1\nkey: pristine\n'));
    vi.advanceTimersByTime(1000);
    expect(loadDraft('edit')).toBeNull();
  });

  it('DOES autosave a real subsequent edit, after the debounce delay', () => {
    const { rerender } = renderHook(
      ({ yamlText }) => useDraftAutosave('edit', yamlText),
      { initialProps: { yamlText: 'version: 1\nkey: pristine\n' } }
    );
    vi.advanceTimersByTime(1000);
    expect(loadDraft('edit')).toBeNull(); // mount tick still skipped

    rerender({ yamlText: 'version: 1\nkey: edited\n' });
    vi.advanceTimersByTime(1000);
    expect(loadDraft('edit')?.yamlText).toBe('version: 1\nkey: edited\n');
  });

  it('skipNextTick() makes a programmatic reset (e.g. Discard draft) stick — the very next tick does not re-save', () => {
    const { result, rerender } = renderHook(
      ({ yamlText }) => useDraftAutosave('edit', yamlText),
      { initialProps: { yamlText: 'version: 1\nkey: edited\n' } }
    );
    // A real edit autosaves normally (establishes there WAS a draft to
    // discard, mirroring the real "user edited, then discarded" flow).
    rerender({ yamlText: 'version: 1\nkey: edited-again\n' });
    vi.advanceTimersByTime(1000);
    expect(loadDraft('edit')?.yamlText).toBe('version: 1\nkey: edited-again\n');

    // Mirrors handleDiscardEditDraft exactly: discardDraft() clears
    // storage, skipNextTick() arms the skip, THEN yamlText resets to the
    // fresh seed — all synchronous, skipNextTick before the state change
    // that follows it, same order the real handler uses.
    discardDraft('edit');
    result.current.skipNextTick();
    rerender({ yamlText: 'version: 1\nkey: fresh-seed\n' });
    vi.advanceTimersByTime(1000);

    // The fresh-seed reset must NOT have been silently re-autosaved —
    // discard stays discarded.
    expect(loadDraft('edit')).toBeNull();
  });

  it('after skipNextTick() consumes its one skip, the tick AFTER that resumes normal autosaving', () => {
    const { result, rerender } = renderHook(
      ({ yamlText }) => useDraftAutosave('edit', yamlText),
      { initialProps: { yamlText: 'version: 1\nkey: a\n' } }
    );
    vi.advanceTimersByTime(1000); // consume the mount skip

    result.current.skipNextTick();
    rerender({ yamlText: 'version: 1\nkey: b\n' }); // this tick is skipped
    vi.advanceTimersByTime(1000);
    expect(loadDraft('edit')).toBeNull();

    rerender({ yamlText: 'version: 1\nkey: c\n' }); // a REAL subsequent edit
    vi.advanceTimersByTime(1000);
    expect(loadDraft('edit')?.yamlText).toBe('version: 1\nkey: c\n');
  });

  it('edit and create modes autosave independently', () => {
    const { rerender: rerenderEdit } = renderHook(
      ({ yamlText }) => useDraftAutosave('edit', yamlText),
      { initialProps: { yamlText: 'edit-v0' } }
    );
    const { rerender: rerenderCreate } = renderHook(
      ({ yamlText }) => useDraftAutosave('create', yamlText),
      { initialProps: { yamlText: 'create-v0' } }
    );
    vi.advanceTimersByTime(1000);

    rerenderEdit({ yamlText: 'edit-v1' });
    vi.advanceTimersByTime(1000);
    expect(loadDraft('edit')?.yamlText).toBe('edit-v1');
    expect(loadDraft('create')).toBeNull();

    rerenderCreate({ yamlText: 'create-v1' });
    vi.advanceTimersByTime(1000);
    expect(loadDraft('create')?.yamlText).toBe('create-v1');
  });
});
