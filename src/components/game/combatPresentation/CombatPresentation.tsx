import type { AttackResolved } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import { useReducedMotion } from 'framer-motion';
import { useEffect, useMemo } from 'react';
import { DiceTray, type DiceTrayPhase } from '../../ui/dice/DiceTray';
import { BeatStage } from './BeatStage';
import { type BeatSequence, verdictLabel } from './beatStageTypes';
import { useBeatSequencer } from './useBeatSequencer';

export interface CombatPresentationAttack {
  id: number;
  attack: AttackResolved;
  isViewerAttack: boolean;
}

function trayPhase(beat: string): DiceTrayPhase {
  if (beat === 'cue') return 'entering';
  if (beat === 'armed') return 'ready';
  if (beat === 'throw') return 'rolling';
  if (beat === 'release') return 'exiting';
  return 'settled';
}

export function CombatPresentation({
  item,
  onComplete,
}: {
  item: CombatPresentationAttack;
  onComplete: (id: number) => void;
}) {
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

  useEffect(() => {
    if (seq.beat === 'done') onComplete(item.id);
  }, [item.id, onComplete, seq.beat]);

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
