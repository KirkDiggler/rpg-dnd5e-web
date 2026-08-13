import { GameView } from '../components/game/GameView';
import { PlaytestHarness } from '../components/playtest/PlaytestHarness';
import { AttackDiePerfHarness } from './AttackDiePerfHarness';
import type { AttackDieDevRoute } from './attackDiePerfRoute';
export function AttackDieDevRouteSurface({
  route,
  playerId,
}: {
  route: Exclude<AttackDieDevRoute, { kind: 'normal' }>;
  playerId: string;
}) {
  if (route.kind === 'playtest')
    return (
      <div className="min-h-screen">
        <PlaytestHarness />
      </div>
    );
  return (
    <div className="min-h-screen">
      <GameView
        playerId={playerId}
        onBack={() => undefined}
        initialEncounterId={route.encounterId}
      />
      <AttackDiePerfHarness />
    </div>
  );
}
