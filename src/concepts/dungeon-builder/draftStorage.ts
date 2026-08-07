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
 *
 * **Honesty guard (Copilot review, PR #717)**: the autosave effect in
 * `DungeonBuilderConcept.tsx` fires on every `yamlText` change, INCLUDING
 * the one React runs after initial mount — so without a guard, the
 * pristine default seed itself gets autosaved 500ms after every fresh
 * load, and the very next refresh would show a "draft restored" banner
 * for a document nobody actually touched. Two independent layers fix
 * this: `DungeonBuilderConcept.tsx` skips the mount-triggered and
 * discard-triggered autosave ticks explicitly (a ref flag, not this
 * module's concern), and — as a second, independent safety net this
 * module DOES own — `draftDiffersFromFreshSeed` below lets the restore
 * path refuse to announce a "draft" that's indistinguishable from the
 * mode's own fresh seed, regardless of how it got saved.
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

/** True when `draftYamlText` is MEANINGFULLY different from
 * `freshSeedYamlText` — the restore path's honesty guard (see this
 * file's own doc comment). Both sides are canonicalized through the same
 * `dungeonYaml.ts` parse+serialize round trip before comparing, which
 * already washes out the `yaml` package's own pre-existing flow-sequence
 * bracket-padding quirk (`dungeonYaml.ts`'s top-of-file doc comment) —
 * BOTH strings pass through the identical serializer, so any padding it
 * introduces applies symmetrically. An explicit bracket-padding
 * normalization pass runs on top as a second, independent safety net
 * against any other asymmetry between the two round trips.
 *
 * Falls back to `true` (treat as meaningful — the safe direction) if
 * EITHER text fails to parse: a genuinely corrupt stored draft is the
 * caller's job to detect and discard separately (`parseDungeon` throwing
 * on `draftYamlText` there is a real, different failure mode, not this
 * function's concern); showing an honest "restored" banner for content
 * this function can't confidently prove is a no-op is the safer failure
 * mode than silently hiding something real.
 *
 * Takes plain YAML strings, not a `DungeonDoc`/CST — deliberately not
 * async, deliberately synchronous and pure, so `DungeonBuilderConcept.tsx`
 * can call it straight from a `useState` lazy initializer. */
export function draftDiffersFromFreshSeed(
  draftYamlText: string,
  freshSeedYamlText: string,
  canonicalize: (yamlText: string) => string
): boolean {
  const normalizeFlowPadding = (s: string) =>
    s.replace(/\[\s+/g, '[').replace(/\s+\]/g, ']');
  try {
    const draftCanonical = normalizeFlowPadding(canonicalize(draftYamlText));
    const freshCanonical = normalizeFlowPadding(
      canonicalize(freshSeedYamlText)
    );
    return draftCanonical !== freshCanonical;
  } catch {
    return true;
  }
}
