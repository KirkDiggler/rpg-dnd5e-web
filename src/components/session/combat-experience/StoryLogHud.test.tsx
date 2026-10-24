import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  Family,
  PartyKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildActStory } from './actStory';
import { StoryLog } from './StoryLog';
import type { CombatExperienceLogMode } from './types';
afterEach(cleanup);
const acts = Array.from({ length: 4 }, (_, index) =>
  create(ActSchema, {
    session: 's',
    id: `loot-${index}`,
    family: Family.ACT,
    verb: 'loot',
    body: {
      case: 'loot',
      value: {
        by: { kind: PartyKind.MEMBER, id: `actor-${index}` },
        from: { kind: PartyKind.MEMBER, id: 'chest' },
      },
    },
  })
);
const story = buildActStory(
  acts.map((act) => ({
    act,
    index: 0,
    seq: 1n,
    source: 'live' as const,
    visible: true,
  })),
  { viewerMember: 'viewer' }
);
const record = {
  rows: [
    {
      id: 'record-1',
      at: 1n,
      act: 'private-act',
      beat: 'record-only-beat',
      fields: { secret: 'not narration' },
    },
  ],
  notice: undefined,
};
function HudLog({
  onRecordShownChange = () => {},
}: {
  onRecordShownChange?: (shown: boolean) => void;
}) {
  const [mode, setMode] = useState<CombatExperienceLogMode>('debug');
  return (
    <StoryLog
      story={story}
      record={record}
      mode={mode}
      onModeChange={setMode}
      streamState="live"
      diagnosticsEnabled
      initialCollapsed
      compactPreview
      onRecordShownChange={onRecordShownChange}
    />
  );
}
describe('live HUD history', () => {
  it('shows the newest three released story outcomes, never diagnostic records', () => {
    const shown = vi.fn();
    render(<HudLog onRecordShownChange={shown} />);
    const recent = screen.getByRole('region', { name: 'Recent outcomes' });
    expect(
      within(recent)
        .getAllByRole('button')
        .map((button) => button.getAttribute('data-recent-id'))
    ).toEqual([story[3]!.id, story[2]!.id, story[1]!.id]);
    expect(recent).toHaveTextContent('actor-3');
    expect(recent).not.toHaveTextContent('record-only-beat');
    expect(screen.queryByRole('list', { name: 'Record' })).toBeNull();
    expect(shown).not.toHaveBeenCalledWith(true);
  });
  it('opens History, enables the record only on Debug, and restores focus on Escape', () => {
    const shown = vi.fn();
    render(<HudLog onRecordShownChange={shown} />);
    fireEvent.click(screen.getByRole('button', { name: 'Just happened' }));
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(shown).not.toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('tab', { name: 'Debug' }));
    expect(screen.getByRole('tabpanel', { name: 'Debug' })).toHaveTextContent(
      'record-only-beat'
    );
    expect(shown).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(screen.getByLabelText('Filter by beat'), {
      key: 'Escape',
    });
    expect(shown).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: 'Just happened' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Just happened' }));
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
  it('closes on an outside pointer press without stealing focus or swallowing the clicked action', () => {
    const shown = vi.fn(),
      clicked = vi.fn();
    render(
      <>
        <HudLog onRecordShownChange={shown} />
        <button onClick={clicked}>Outside action</button>
      </>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Just happened' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Debug' }));
    fireEvent.pointerDown(screen.getByLabelText('Filter by beat'));
    expect(screen.getByRole('tabpanel', { name: 'Debug' })).toBeVisible();
    const outside = screen.getByRole('button', { name: 'Outside action' });
    act(() => outside.focus());
    fireEvent.pointerDown(outside);
    fireEvent.click(outside);
    expect(screen.queryByRole('tabpanel', { name: 'Debug' })).toBeNull();
    expect(outside).toHaveFocus();
    expect(clicked).toHaveBeenCalledOnce();
    expect(shown).toHaveBeenLastCalledWith(false);
  });
  it('supports keyboard navigation between History and Debug tabs', () => {
    render(<HudLog />);
    fireEvent.click(screen.getByRole('button', { name: 'Just happened' }));
    fireEvent.keyDown(screen.getByRole('tab', { name: 'History' }), {
      key: 'ArrowRight',
    });
    expect(screen.getByRole('tab', { name: 'Debug' })).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Debug' })).toBeVisible();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Debug' }), {
      key: 'Home',
    });
    expect(screen.getByRole('tab', { name: 'History' })).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'History' })).toBeVisible();
  });
  it('a recent outcome opens the readable history rather than a debug view', () => {
    render(<HudLog />);
    fireEvent.click(
      within(
        screen.getByRole('region', { name: 'Recent outcomes' })
      ).getAllByRole('button')[1]
    );
    expect(screen.getByRole('tabpanel', { name: 'History' })).toHaveTextContent(
      'actor-2'
    );
    expect(
      screen.queryByRole('region', { name: 'Recent outcomes' })
    ).toBeNull();
  });
  it('renders an honest empty preview when no released outcomes exist', () => {
    render(
      <StoryLog
        story={[]}
        mode="story"
        onModeChange={vi.fn()}
        streamState="reconnecting"
        initialCollapsed
        compactPreview
      />
    );
    expect(screen.getByText('No recent events yet.')).toBeVisible();
  });
});
