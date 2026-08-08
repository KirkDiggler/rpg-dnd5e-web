/**
 * DungeonBuilderConcept.test.tsx — end-to-end regression coverage for
 * Kirk's own incident (rpg-project#194 authoring-robustness unit, "the
 * YAML is always fixable"): he hand-pasted `wallLines:`-shaped objects
 * into `walls:` (entries with no real `[col, row]` `from`/`to`), the
 * parser accepted it, the board crashed reading the missing coords —
 * white screen, no UI — and because autosave had already captured the
 * broken text, EVERY reload restored it and re-crashed. The only way
 * back in was manually clearing `localStorage` in DevTools.
 *
 * `dungeonYaml.test.ts`'s new "shape validation at parse" suite already
 * proves the fix at the unit level (a malformed `walls:` entry now
 * throws `DungeonParseError` at parse time, not render time). This file
 * proves the OTHER half: that the composition root actually wires that
 * fix up correctly end to end — a broken draft sitting in `localStorage`
 * at mount time must produce the crash-recovery surface, with the
 * broken text intact and editable, never a thrown render exception and
 * never a silently-discarded draft.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CANVAS, emptyCanvasYaml } from './creation/emptyCanvasDoc';
import { DungeonBuilderConcept } from './DungeonBuilderConcept';

const DRAFT_KEY = 'dungeon-builder:draft:create';

/** Kirk's exact repro: a `walls:` entry shaped like `wallLines:` instead
 * — `{cell, corner}` where a real `[col, row]` `from` belongs. Genuinely
 * different from the fresh seed (so the restore path's own
 * `draftDiffersFromFreshSeed` honesty guard doesn't just discard it as a
 * no-op) and — before this unit's parse-time validation — accepted by
 * `parseDungeon`, only crashing later when `CreationBoard.tsx` tried
 * `wall.from.join(',')`. */
const BROKEN_WALLS_YAML = emptyCanvasYaml(
  DEFAULT_CANVAS.width,
  DEFAULT_CANVAS.height
).replace(
  'walls: []',
  'walls:\n  - { from: { cell: [1, 1], corner: 0 }, to: [2, 2] }'
);

function seedBrokenDraft() {
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({ yamlText: BROKEN_WALLS_YAML, savedAt: Date.now() })
  );
}

describe('DungeonBuilderConcept — crash-proof draft restore (Kirk incident regression)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('does not throw mounting on a broken-walls draft, and shows the recovery surface with the text intact', () => {
    seedBrokenDraft();

    expect(() =>
      render(<DungeonBuilderConcept forceFixtures />)
    ).not.toThrow();

    // The crash-recovery surface, not the normal board/pane.
    const recoveryBox = screen.getByLabelText(
      'Dungeon YAML (recovery)'
    ) as HTMLTextAreaElement;
    expect(recoveryBox.value).toBe(BROKEN_WALLS_YAML);
    expect(recoveryBox.value).toContain('cell: [1, 1]');

    // A real, specific error — not a generic "something went wrong".
    expect(screen.getByText(/walls\[0\]\.from/)).toBeTruthy();

    // The normal (non-crashed) pane never mounted.
    expect(screen.queryByLabelText('Dungeon YAML')).toBeNull();

    // The draft is still in storage — nothing was silently discarded.
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });

  it('every reload restores the SAME recovery surface, never a crash (the incident\'s "every reload re-crashed" symptom, made safe)', () => {
    seedBrokenDraft();
    const { unmount } = render(<DungeonBuilderConcept forceFixtures />);
    expect(
      screen.getByLabelText('Dungeon YAML (recovery)')
    ).toBeTruthy();
    unmount();

    // Simulate a second reload against the same (untouched) localStorage.
    expect(() =>
      render(<DungeonBuilderConcept forceFixtures />)
    ).not.toThrow();
    expect(
      screen.getByLabelText('Dungeon YAML (recovery)')
    ).toBeTruthy();
  });

  it('Apply & retry: fixing the text in place returns the real board', () => {
    seedBrokenDraft();
    render(<DungeonBuilderConcept forceFixtures />);

    const recoveryBox = screen.getByLabelText('Dungeon YAML (recovery)');
    const fixed = BROKEN_WALLS_YAML.replace(
      'walls:\n  - { from: { cell: [1, 1], corner: 0 }, to: [2, 2] }',
      'walls:\n  - { from: [1, 1], to: [2, 2] }'
    );
    fireEvent.change(recoveryBox, { target: { value: fixed } });
    fireEvent.click(screen.getByText('Apply & retry'));

    expect(
      screen.queryByLabelText('Dungeon YAML (recovery)')
    ).toBeNull();
    expect(screen.getByLabelText('Dungeon YAML')).toBeTruthy();
  });

  it('Apply & retry with STILL-broken text keeps the recovery surface up and preserves what was typed', () => {
    seedBrokenDraft();
    render(<DungeonBuilderConcept forceFixtures />);

    const recoveryBox = screen.getByLabelText('Dungeon YAML (recovery)');
    // Fix `from` (so validation actually reaches `to`) but break `to` in
    // the SAME wallLines-shaped way `from` originally was — still broken,
    // just on the other field now.
    const stillBroken = BROKEN_WALLS_YAML.replace(
      'from: { cell: [1, 1], corner: 0 }, to: [2, 2]',
      'from: [1, 1], to: { cell: [2, 2], corner: 0 }'
    );
    fireEvent.change(recoveryBox, { target: { value: stillBroken } });
    fireEvent.click(screen.getByText('Apply & retry'));

    const box = screen.getByLabelText(
      'Dungeon YAML (recovery)'
    ) as HTMLTextAreaElement;
    expect(box.value).toBe(stillBroken);
    expect(screen.getByText(/walls\[0\]\.to/)).toBeTruthy();
  });

  it('Discard draft: clears storage and returns a fresh canvas', () => {
    seedBrokenDraft();
    render(<DungeonBuilderConcept forceFixtures />);

    fireEvent.click(screen.getByText('Discard draft & start fresh'));

    expect(
      screen.queryByLabelText('Dungeon YAML (recovery)')
    ).toBeNull();
    expect(screen.getByLabelText('Dungeon YAML')).toBeTruthy();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('a healthy draft still restores normally (no false-positive recovery surface)', () => {
    const healthy = emptyCanvasYaml(DEFAULT_CANVAS.width, DEFAULT_CANVAS.height).replace(
      'name: "Untitled Dungeon"',
      'name: "A Healthy Draft"'
    );
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ yamlText: healthy, savedAt: Date.now() })
    );

    render(<DungeonBuilderConcept forceFixtures />);

    expect(
      screen.queryByLabelText('Dungeon YAML (recovery)')
    ).toBeNull();
    expect(screen.getByLabelText('Dungeon YAML')).toBeTruthy();
    expect(screen.getByText(/Draft restored/)).toBeTruthy();
  });
});
