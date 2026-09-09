import { create } from '@bufbuild/protobuf';
import {
  EventKind,
  EventSchema,
  StruckSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import styles from './CombatExperience.module.css';
import {
  COMBAT_DEBUG_MAX_LINES,
  emptyPresentation,
  reduceCombatPresentation,
} from './presentation';
import { StoryLog } from './StoryLog';

function event(seq = 9007199254740993n) {
  return create(EventSchema, {
    session: 'session-1',
    recipient: 'fighter',
    seq,
    at: 0n,
    kind: EventKind.STRUCK,
    payload: new Uint8Array([123, 125]),
    body: {
      case: 'struck',
      value: create(StruckSchema, {
        attacker: 'fighter',
        target: '<img src=x onerror=alert(1)>',
        roll: 12,
        total: 17,
        against: 13,
        damage: 8,
        presentationId: `roll-${seq}`,
      }),
    },
  });
}
function stateFor(source = event()) {
  return reduceCombatPresentation(
    emptyPresentation({
      session: 'session-1',
      viewerMember: 'fighter',
      memberNames: { fighter: 'Fighter' },
      rollerRoles: { fighter: 'player' },
    }),
    { type: 'stream-event', event: source, metadata: { source: 'live' } }
  );
}
const base = {
  story: [],
  mode: 'debug' as const,
  streamState: 'live' as const,
  onModeChange: vi.fn(),
};
afterEach(() => vi.unstubAllGlobals());

describe('inline Debug inspection', () => {
  it.each(['click', 'focus'])(
    'widens only Debug on JSON %s and can return to compact width',
    async (action) => {
      const state = stateFor();
      const { rerender } = render(<StoryLog {...base} debug={state.debug} />);
      fireEvent.click(
        screen.getByRole('button', { name: /Inspect event.*struck/i })
      );
      await screen.findByRole('button', { name: 'Copy JSON' });
      const log = screen.getByTestId('session-combat-log');
      const json = screen.getByLabelText('Formatted event JSON');
      expect(log.classList.contains(styles.storyLogWide)).toBe(false);
      if (action === 'click') fireEvent.click(json);
      else fireEvent.focus(json);
      expect(log.classList.contains(styles.storyLogWide)).toBe(true);
      expect(
        screen.getByRole('button', { name: 'Narrow debug panel' })
      ).toBeTruthy();
      expect(fireEvent.click(json)).toBe(true);
      expect(log.classList.contains(styles.storyLogWide)).toBe(true);
      fireEvent.click(
        screen.getByRole('button', { name: 'Collapse combat log' })
      );
      expect(log.classList.contains(styles.storyLogWide)).toBe(false);
      fireEvent.click(
        screen.getByRole('button', { name: 'Expand combat log' })
      );
      expect(log.classList.contains(styles.storyLogWide)).toBe(true);
      rerender(<StoryLog {...base} mode="story" debug={state.debug} />);
      expect(log.classList.contains(styles.storyLogWide)).toBe(false);
      rerender(<StoryLog {...base} debug={state.debug} />);
      fireEvent.click(
        screen.getByRole('button', { name: 'Narrow debug panel' })
      );
      expect(log.classList.contains(styles.storyLogWide)).toBe(false);
      expect(
        screen.getByRole('button', { name: 'Widen debug panel' })
      ).toBeTruthy();
    }
  );

  it('expands the original event with precise IDs, safe highlighted JSON and copy', async () => {
    const source = event();
    const state = stateFor(source);
    source.body = { case: undefined }; // A later caller mutation must not rewrite the recorded entry.
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { container } = render(<StoryLog {...base} debug={state.debug} />);
    expect(screen.queryByRole('button', { name: 'Copy JSON' })).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: /Inspect event.*struck/i })
    );
    const copy = await screen.findByRole('button', { name: 'Copy JSON' });
    const block = screen.getByLabelText('Formatted event JSON');
    const parsed = JSON.parse(block.textContent!);
    expect(parsed.seq).toBe('9007199254740993');
    expect(parsed.at).toBe('0');
    expect(parsed.struck.critical).toBe(false);
    expect(parsed.struck.roll).toBe(12);
    expect(parsed.struck.target).toBe('<img src=x onerror=alert(1)>');
    expect(parsed.payload).toBe('e30=');
    expect(container.querySelector('img')).toBeNull();
    expect(block.querySelector('[data-json-token="key"]')).not.toBeNull();
    expect(block.querySelector('[data-json-token="number"]')).not.toBeNull();
    fireEvent.click(copy);
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(block.textContent)
    );
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('keeps an inspected row open as new events arrive and reports clipboard failures', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const first = stateFor(event(1n));
    const { rerender } = render(<StoryLog {...base} debug={first.debug} />);
    fireEvent.click(
      screen.getByRole('button', { name: /Inspect event.*struck/i })
    );
    await screen.findByRole('button', { name: 'Copy JSON' });
    const next = reduceCombatPresentation(first, {
      type: 'stream-event',
      event: event(2n),
      metadata: { source: 'live' },
    });
    rerender(<StoryLog {...base} debug={next.debug} />);
    expect(screen.getAllByLabelText('Formatted event JSON')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));
    expect(
      await screen.findByText('Copy failed — select the JSON to copy it.')
    ).toBeTruthy();
  });

  it('retains the existing feed bound and unique stable keys for duplicate receipts', () => {
    const source = event(1n);
    let state = stateFor(source);
    const original = state.debug[0];
    for (let i = 0; i < COMBAT_DEBUG_MAX_LINES; i += 1) {
      state = reduceCombatPresentation(state, {
        type: 'stream-event',
        event: source,
        metadata: { source: 'live' },
      });
    }
    expect(state.debug).toHaveLength(COMBAT_DEBUG_MAX_LINES);
    expect(state.debug).not.toContain(original);
    const ids = state.debug.map((entry) =>
      typeof entry === 'string' ? undefined : entry.id
    );
    expect(ids[0]).toBe(1);
    expect(ids.at(-1)).toBe(COMBAT_DEBUG_MAX_LINES);
    expect(new Set(ids).size).toBe(COMBAT_DEBUG_MAX_LINES);
  });

  it('keeps non-event warnings readable rather than inventing JSON', () => {
    render(
      <StoryLog
        {...base}
        debug={['combat-presentation: typed event kind/body mismatch ignored']}
      />
    );
    expect(
      screen.getByText(
        'combat-presentation: typed event kind/body mismatch ignored'
      )
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Inspect event/i })).toBeNull();
  });
});
