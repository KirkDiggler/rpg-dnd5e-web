import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AttackDieDevRouteSurface } from './AttackDieDevRouteSurface';
vi.mock('../components/game/GameView', () => ({
  GameView: ({ initialEncounterId }: { initialEncounterId: string }) => (
    <div data-testid="game-view">{initialEncounterId}</div>
  ),
}));
vi.mock('../components/playtest/PlaytestHarness', () => ({
  PlaytestHarness: () => <div data-testid="playtest" />,
}));
vi.mock('./AttackDiePerfHarness', () => ({
  AttackDiePerfHarness: () => <div data-testid="perf" />,
}));
describe('attack die route integration surface', () => {
  it('renders actual GameView plus observational overlay for flagged route', () => {
    render(
      <AttackDieDevRouteSurface
        route={{ kind: 'real-encounter-perf', encounterId: 'real' }}
        playerId="p"
      />
    );
    expect(screen.getByTestId('game-view').textContent).toBe('real');
    expect(screen.getByTestId('perf')).toBeTruthy();
    expect(screen.queryByTestId('playtest')).toBeNull();
  });
  it('preserves ordinary PlaytestHarness route without perf overlay', () => {
    render(
      <AttackDieDevRouteSurface
        route={{ kind: 'playtest', encounterId: 'fixture' }}
        playerId="p"
      />
    );
    expect(screen.getByTestId('playtest')).toBeTruthy();
    expect(screen.queryByTestId('perf')).toBeNull();
    expect(screen.queryByTestId('game-view')).toBeNull();
  });
});
