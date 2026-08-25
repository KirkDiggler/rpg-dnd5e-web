import { HEX_SIZE } from '@/components/hex-grid/hexMath';
import { SessionCanvas } from '@/components/session/SessionCanvas';
import { SESSION_COMBAT_MAP_FIXTURE } from './sessionCombatMapFixture';

export interface SessionCombatMapProps {
  attackableTargets?: readonly string[];
  onTargetClick?: (targetId: string) => void;
  onHoverTarget?: (targetId: string | null) => void;
}

/**
 * Fixture state around the production session renderer. This component does
 * not reproduce map geometry, movement, hover, or target rings: all of those
 * remain SessionCanvas responsibilities, exactly as on the live route.
 */
export function SessionCombatMap({
  attackableTargets,
  onTargetClick,
  onHoverTarget,
}: SessionCombatMapProps) {
  return (
    <SessionCanvas
      scene={SESSION_COMBAT_MAP_FIXTURE.scene}
      hexSize={HEX_SIZE}
      characterId="aldric"
      characterName="Aldric Vale"
      character={undefined}
      classRefId="fighter"
      myPosition={SESSION_COMBAT_MAP_FIXTURE.playerPosition}
      otherMembers={[...SESSION_COMBAT_MAP_FIXTURE.members]}
      attackableTargets={attackableTargets ? [...attackableTargets] : undefined}
      pathIndex={SESSION_COMBAT_MAP_FIXTURE.pathIndex}
      onEntityClick={onTargetClick}
      onHoverEntity={onHoverTarget}
    />
  );
}
