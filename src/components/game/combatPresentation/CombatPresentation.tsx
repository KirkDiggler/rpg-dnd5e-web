import type {
  AttackResolved,
  EntityDamaged,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import { useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { DiceTray, type DiceTrayPhase } from '../../ui/dice/DiceTray';
import { BeatStage } from './BeatStage';
import { verdictLabel, type BeatSequence } from './beatStageTypes';
import { useBeatSequencer } from './useBeatSequencer';

export interface CombatPresentationAttack {
  id: number;
  correlationId: string;
  attack: AttackResolved;
  isViewerAttack: boolean;
}

export interface CombatPresentationProps {
  item: CombatPresentationAttack;
  damage?: EntityDamaged;
  onComplete: (id: number) => void;
}

function trayPhase(beat: string): DiceTrayPhase {
  if (beat === 'cue') return 'entering';
  if (beat === 'armed') return 'ready';
  if (beat === 'throw') return 'rolling';
  if (beat === 'release') return 'exiting';
  if (beat === 'idle' || beat === 'done') return 'hidden';
  return 'settled';
}

const DAMAGE_ANNOUNCEMENT_STYLE: CSSProperties = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: 1,
  margin: -1,
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  width: 1,
  whiteSpace: 'nowrap',
};

function damageAnnouncementText(damage: EntityDamaged): string {
  return `Damage dealt: ${damage.amount}`;
}

export function CombatPresentation({
  item,
  damage,
  onComplete,
}: CombatPresentationProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const sequence = useMemo<BeatSequence<AttackResolved>>(
    () => ({
      identity: item,
      pace: 'cinematic',
      groups: [
        {
          id: String(item.id),
          attack: item.attack,
          isViewerAttack: item.isViewerAttack,
        },
      ],
    }),
    [item]
  );
  const seq = useBeatSequencer(sequence, { reducedMotion });
  const previousItemRef = useRef(item);
  const completedItemRef = useRef<CombatPresentationAttack | undefined>(
    undefined
  );

  useEffect(() => {
    // A new item first renders with the previous sequencer beat. Wait for its
    // sequence reset before allowing that item to complete.
    if (previousItemRef.current !== item) {
      previousItemRef.current = item;
      return;
    }
    if (seq.beat === 'done' && completedItemRef.current !== item) {
      completedItemRef.current = item;
      onComplete(item.id);
    }
  }, [item, onComplete, seq.beat]);

  const outcome = ['verdict', 'impact', 'release'].includes(seq.beat)
    ? verdictLabel(item.attack)
    : '';

  return (
    <div
      data-testid="combat-presentation"
      data-beat={seq.beat}
      style={{ pointerEvents: 'none' }}
    >
      <DiceTray
        phase={trayPhase(seq.beat)}
        finalFace={item.attack.attackRoll}
        outcome={outcome}
        reducedMotion={reducedMotion}
      >
        <BeatStage
          beat={seq.beat}
          placement="center-stage"
          attack={item.attack}
          reducedMotion={reducedMotion}
        />
      </DiceTray>
      {damage && (
        <>
          <div
            data-testid="combat-presentation-damage"
            aria-hidden="true"
            style={{
              marginTop: 8,
              fontSize: 14,
              fontWeight: 700,
              color: '#fca5a5',
              textAlign: 'center',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.35)',
            }}
          >
            💥 {damage.amount} damage
          </div>
          <div
            data-testid="combat-presentation-damage-announce"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={DAMAGE_ANNOUNCEMENT_STYLE}
          >
            {damageAnnouncementText(damage)}
          </div>
        </>
      )}
      {seq.beat === 'armed' && (
        <button
          type="button"
          aria-label="Roll d20"
          onClick={seq.throwDie}
          style={{ pointerEvents: 'auto' }}
        >
          Roll d20
        </button>
      )}
    </div>
  );
}
