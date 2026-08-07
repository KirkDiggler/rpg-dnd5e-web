/**
 * draftStorage — refresh-proof local drafts for the Dungeon Builder
 * (local-drafts unit, Kirk's ask verbatim: "the author never loses a
 * board to a refresh/crash"). Persists the WORKING doc's full-dialect
 * YAML TEXT — the CST source `YamlPane`/`ProposedYamlPane` show, comments
 * and formatting included, never a stripped/parsed projection — to
 * `localStorage`, keyed per mode/tab so edit mode and creation mode
 * ("New Dungeon") each keep their own, independent draft. Same
 * "remembered per mode" precedent `DungeonBuilderConcept.tsx`'s
 * palette/YAML collapse-state pairs already set (state that would
 * otherwise reset on an edit<->create tab switch has to live keyed by
 * mode, not as one shared slot).
 *
 * Deliberately NOT the same thing as a real save: this is a client-only,
 * best-effort safety net against an accidental refresh/tab-close, not a
 * server persistence mechanism (Save & Play / Download own that). Every
 * function here is best-effort — `localStorage` can throw (private
 * browsing quota, disabled storage, a corrupted/foreign value under this
 * key) — and swallows that rather than crashing the author's session
 * over an autosave failure.
 */

export type DraftMode = 'edit' | 'create';

const DRAFT_KEY_PREFIX = 'dungeon-builder:draft:';

export interface StoredDraft {
  /** Full-fidelity YAML text — the CST source, exactly as the pane last
   * showed it, never stripped (Kirk's ruling: "compatibility stripping
   * should happen at load time not save"). */
  yamlText: string;
  /** `Date.now()` at the moment this draft was written — drives the
   * "draft restored from ..." affordance's timestamp. */
  savedAt: number;
}

function draftKey(mode: DraftMode): string {
  return `${DRAFT_KEY_PREFIX}${mode}`;
}

/** Best-effort read — `null` on no stored draft, corrupt/foreign JSON, a
 * value missing either field, or `localStorage` throwing outright. Never
 * throws. */
export function loadDraft(mode: DraftMode): StoredDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(mode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    if (
      typeof parsed.yamlText !== 'string' ||
      typeof parsed.savedAt !== 'number'
    ) {
      return null;
    }
    return { yamlText: parsed.yamlText, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

/** Best-effort write — silently no-ops on a storage failure (quota,
 * private-mode restrictions, `localStorage` unavailable entirely). Never
 * blocks or interrupts authoring; callers debounce their own calls to
 * this (see `DungeonBuilderConcept.tsx`'s autosave `useEffect`s) — this
 * function itself does no debouncing of its own. */
export function saveDraft(mode: DraftMode, yamlText: string): void {
  try {
    const entry: StoredDraft = { yamlText, savedAt: Date.now() };
    localStorage.setItem(draftKey(mode), JSON.stringify(entry));
  } catch {
    // best-effort — see this file's own doc comment.
  }
}

/** Clears the stored draft for `mode` — the "discard draft" control's own
 * action (reload the mode's default seed and stop offering this draft
 * back). Best-effort, same as `saveDraft`/`loadDraft`. */
export function discardDraft(mode: DraftMode): void {
  try {
    localStorage.removeItem(draftKey(mode));
  } catch {
    // best-effort — see this file's own doc comment.
  }
}
