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
import { Code, ConnectError } from '@connectrpc/connect';
import type { PutDungeonResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOOLKIT_SANDBOX_YAML } from '../toolkit-contributor-sandbox/constants';
import { DEFAULT_CANVAS, emptyCanvasYaml } from './creation/emptyCanvasDoc';

const hoisted = vi.hoisted(() => ({
  globalPutDungeon: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  authoringClient: { putDungeon: hoisted.globalPutDungeon },
}));

import { DungeonBuilderConcept } from './DungeonBuilderConcept';

/** `DungeonBuilderConcept.tsx`'s own `APPLY_DEBOUNCE_MS` (not exported —
 * this is the pane's debounced-reparse delay the two-way-pane tests below
 * flush past with fake timers). */
const APPLY_DEBOUNCE_MS = 700;

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

    expect(() => render(<DungeonBuilderConcept forceFixtures />)).not.toThrow();

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
    expect(screen.getByLabelText('Dungeon YAML (recovery)')).toBeTruthy();
    unmount();

    // Simulate a second reload against the same (untouched) localStorage.
    expect(() => render(<DungeonBuilderConcept forceFixtures />)).not.toThrow();
    expect(screen.getByLabelText('Dungeon YAML (recovery)')).toBeTruthy();
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

    expect(screen.queryByLabelText('Dungeon YAML (recovery)')).toBeNull();
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

    expect(screen.queryByLabelText('Dungeon YAML (recovery)')).toBeNull();
    expect(screen.getByLabelText('Dungeon YAML')).toBeTruthy();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('a healthy draft still restores normally (no false-positive recovery surface)', () => {
    const healthy = emptyCanvasYaml(
      DEFAULT_CANVAS.width,
      DEFAULT_CANVAS.height
    ).replace('name: "Untitled Dungeon"', 'name: "A Healthy Draft"');
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ yamlText: healthy, savedAt: Date.now() })
    );

    render(<DungeonBuilderConcept forceFixtures />);

    expect(screen.queryByLabelText('Dungeon YAML (recovery)')).toBeNull();
    expect(screen.getByLabelText('Dungeon YAML')).toBeTruthy();
    expect(screen.getByText(/Draft restored/)).toBeTruthy();
  });
});

describe('DungeonBuilderConcept — injected sandbox contract', () => {
  beforeEach(() => {
    localStorage.clear();
    hoisted.globalPutDungeon.mockReset();
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('uses only its injected client and literal template, disables draft persistence and sandbox-hidden controls, and calls back after a real save', async () => {
    const editedDraft = TOOLKIT_SANDBOX_YAML.replace(
      'Toolkit Contributor Sandbox',
      'Local Draft Must Not Restore'
    );
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ yamlText: editedDraft, savedAt: Date.now() })
    );
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    const putDungeon = vi
      .fn()
      .mockRejectedValueOnce(
        new ConnectError('bad key', Code.InvalidArgument) // liveness probe
      )
      .mockResolvedValue({
        success: true,
        fieldErrors: [],
      } as unknown as PutDungeonResponse);
    const onSaveSucceeded = vi.fn();

    const props = {
      initialYaml: TOOLKIT_SANDBOX_YAML,
      authoringClient: { putDungeon },
      persistDraft: false,
      allowNewCanvas: false,
      allowYamlFileIO: false,
      onSaveSucceeded,
      showSaveResultLink: false,
    };
    const { unmount } = render(<DungeonBuilderConcept {...props} />);

    const pane = screen.getByLabelText('Dungeon YAML') as HTMLTextAreaElement;
    expect(pane.value).toBe(TOOLKIT_SANDBOX_YAML);
    expect(screen.queryByRole('button', { name: 'New Canvas' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download .yaml' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Load .yaml' })).toBeNull();
    expect(screen.queryByLabelText('Load dungeon YAML file')).toBeNull();

    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: /^Save/,
          }) as HTMLButtonElement
        ).disabled
      ).toBe(false)
    );
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(onSaveSucceeded).toHaveBeenCalledTimes(1));
    expect(onSaveSucceeded).toHaveBeenCalledWith('toolkit-contributor-sandbox');
    expect(
      putDungeon.mock.calls.some(
        ([request]) =>
          request.key === 'toolkit-contributor-sandbox' &&
          request.validateOnly === false
      )
    ).toBe(true);
    expect(
      screen.getByText(/Saved as "toolkit-contributor-sandbox"/)
    ).toBeTruthy();
    expect(
      screen.queryByRole('link', { name: 'http://localhost:3001/' })
    ).toBeNull();
    expect(hoisted.globalPutDungeon).not.toHaveBeenCalled();

    fireEvent.change(pane, {
      target: { value: editedDraft },
    });
    unmount();
    render(<DungeonBuilderConcept {...props} />);

    expect(
      (screen.getByLabelText('Dungeon YAML') as HTMLTextAreaElement).value
    ).toBe(TOOLKIT_SANDBOX_YAML);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(hoisted.globalPutDungeon).not.toHaveBeenCalled();
  });
});

describe('DungeonBuilderConcept — the live YAML pane is genuinely two-way (tooth 3)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('typing a malformed change rejects inline, without losing what was typed or crashing the board', async () => {
    render(<DungeonBuilderConcept forceFixtures />);

    const pane = screen.getByLabelText('Dungeon YAML') as HTMLTextAreaElement;
    const malformed = pane.value.replace(
      'walls: []',
      'walls:\n  - { from: { cell: [1, 1], corner: 0 }, to: [2, 2] }'
    );
    fireEvent.change(pane, { target: { value: malformed } });

    // Debounced reparse (`APPLY_DEBOUNCE_MS`) — nothing has applied yet,
    // but the textarea already reflects every keystroke.
    expect(
      (screen.getByLabelText('Dungeon YAML') as HTMLTextAreaElement).value
    ).toBe(malformed);

    await act(async () => {
      vi.advanceTimersByTime(APPLY_DEBOUNCE_MS + 50);
    });

    // Rejected inline — the SAME shape error dungeonYaml.ts now throws at
    // parse time — and the typed text is still exactly what was typed,
    // never silently reverted to the last-good doc.
    expect(screen.getByText(/walls\[0\]\.from/)).toBeTruthy();
    expect(
      (screen.getByLabelText('Dungeon YAML') as HTMLTextAreaElement).value
    ).toBe(malformed);
    // No crash: the pane and board are both still mounted normally, not
    // swapped for the crash-recovery surface — parse rejection is not a
    // render crash.
    expect(screen.queryByLabelText('Dungeon YAML (recovery)')).toBeNull();
  });

  it('typing a valid change applies and clears any prior error', async () => {
    render(<DungeonBuilderConcept forceFixtures />);
    const pane = screen.getByLabelText('Dungeon YAML') as HTMLTextAreaElement;
    const original = pane.value;

    // First, a malformed edit to produce an inline error…
    const malformed = original.replace(
      'walls: []',
      'walls:\n  - { from: { cell: [1, 1], corner: 0 }, to: [2, 2] }'
    );
    fireEvent.change(pane, { target: { value: malformed } });
    await act(async () => {
      vi.advanceTimersByTime(APPLY_DEBOUNCE_MS + 50);
    });
    expect(screen.getByText(/walls\[0\]\.from/)).toBeTruthy();

    // …then a genuinely valid edit (a real, well-shaped wall this time),
    // which should apply cleanly and clear the error.
    const valid = original
      .replace('walls: []', 'walls:\n  - { from: [1, 1], to: [2, 2] }')
      .replace('name: "Untitled Dungeon"', 'name: "Fixed Dungeon"');
    fireEvent.change(
      screen.getByLabelText('Dungeon YAML') as HTMLTextAreaElement,
      { target: { value: valid } }
    );
    await act(async () => {
      vi.advanceTimersByTime(APPLY_DEBOUNCE_MS + 50);
    });

    const finalPane = screen.getByLabelText(
      'Dungeon YAML'
    ) as HTMLTextAreaElement;
    expect(finalPane.value).toBe(valid);
    expect(screen.queryByText(/walls\[0\]\.from/)).toBeNull();
    expect(screen.queryByLabelText('Dungeon YAML (recovery)')).toBeNull();
  });
});
