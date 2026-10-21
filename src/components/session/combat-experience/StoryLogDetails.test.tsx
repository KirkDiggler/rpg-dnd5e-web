import { create } from '@bufbuild/protobuf';
import {
  EventKind,
  EventSchema,
  StruckSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  ActSchema,
  Family,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatDebugLine,
  type DebugEventEntry,
  type DebugFeedEntry,
} from '../debugLogLine';
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
/** A structured debug row, as the Concepts surface still feeds StoryLog. */
function entryFor(source: ReturnType<typeof event>, id = 0): DebugEventEntry {
  const line = formatDebugLine(source, new Map([['fighter', 'Fighter']]));
  return {
    id,
    summary: `#${source.seq} struck · Fighter · source=live`,
    text: `${line.text} source=live`,
    event: source,
  };
}
function stateFor(source = event()): { debug: readonly DebugFeedEntry[] } {
  return { debug: [entryFor(source)] };
}
const base = {
  story: [],
  mode: 'debug' as const,
  streamState: 'live' as const,
  onModeChange: vi.fn(),
};
afterEach(() => vi.unstubAllGlobals());

describe('inline Debug inspection', () => {
  it('adopts a measured desktop default without overriding an explicit log choice', () => {
    const view = render(
      <StoryLog {...base} debug={[]} initialCollapsed={false} />
    );
    expect(
      screen.queryByRole('button', { name: 'Expand combat log' })
    ).toBeNull();
    view.rerender(<StoryLog {...base} debug={[]} initialCollapsed />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand combat log' }));
    view.rerender(<StoryLog {...base} debug={[]} initialCollapsed={false} />);
    view.rerender(<StoryLog {...base} debug={[]} initialCollapsed />);
    expect(
      screen.queryByRole('button', { name: 'Expand combat log' })
    ).toBeNull();
  });

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
    const next = { debug: [...first.debug, entryFor(event(2n), 1)] };
    rerender(<StoryLog {...base} debug={next.debug} />);
    expect(screen.getAllByLabelText('Formatted event JSON')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));
    expect(
      await screen.findByText('Copy failed — select the JSON to copy it.')
    ).toBeTruthy();
  });

  it('bounds the presentation’s own act debug feed', () => {
    let state = emptyPresentation({
      session: 'session-1',
      viewerMember: 'fighter',
    });
    for (let i = 0; i <= COMBAT_DEBUG_MAX_LINES; i += 1) {
      state = reduceCombatPresentation(state, {
        type: 'stream-act',
        act: create(ActSchema, {
          session: 'session-1',
          id: `id-${String(i).padStart(6, '0')}`,
          family: Family.CLOCK,
        }),
        index: 0,
        seq: BigInt(i + 1),
        metadata: { source: 'live' },
      });
    }
    expect(state.debug).toHaveLength(COMBAT_DEBUG_MAX_LINES);
    expect(String(state.debug[0])).toContain('id-000001');
    expect(String(state.debug.at(-1))).toContain(
      `id-${String(COMBAT_DEBUG_MAX_LINES).padStart(6, '0')}`
    );
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
