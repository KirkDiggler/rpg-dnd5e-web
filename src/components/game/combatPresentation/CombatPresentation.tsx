import type {
  AttackResolved,
  EntityDamaged,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import { useReducedMotion } from 'framer-motion';
import { useLayoutEffect, useMemo, useRef } from 'react';
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
  /** Fires exactly once when this attack reaches its authoritative outcome beat:
   * Verdict for a miss, Impact for a hit. Presentation coordination only. */
  onResultRelease?: (id: number) => void;
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

/** The approved combat-pacing design assigns damage reveal to Impact —
 * never earlier. `EntityDamaged` can stream in from the server well
 * before the roll animation reaches that beat (it rides the same
 * correlation-keyed lookup `EncounterView` feeds this component as soon
 * as the event arrives), so gating strictly on `beat` here is the only
 * thing standing between "server sent it" and "the roll gets spoiled."
 * Also gated on `hit`: a miss has no honest impact, so even a stray
 * damage payload is never shown for one -- misses behave honestly with
 * no damage surface at all.
 * Kept as its own predicate (not inlined) so the render below and any
 * future caller agree on exactly one definition of "visible yet." */
function damageVisibleAtBeat(beat: string, hit: boolean): boolean {
  return hit && (beat === 'impact' || beat === 'release' || beat === 'done');
}

export function CombatPresentation({
  item,
  damage,
  onResultRelease,
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
  const releasedItemRef = useRef<CombatPresentationAttack | undefined>(
    undefined
  );

  useLayoutEffect(() => {
    // Layout phase is deliberate: consumers release visible HP/log/tombstone
    // state before the browser can paint the Impact/Verdict frame. A passive
    // effect would allow one spoiler frame where the theater and surrounding
    // outcome surfaces disagree.
    // A new item first renders with the previous sequencer beat. Wait for its
    // sequence reset before allowing that item to complete.
    if (previousItemRef.current !== item) {
      previousItemRef.current = item;
      return;
    }
    const resultBeat = item.attack.hit ? 'impact' : 'verdict';
    if (seq.beat === resultBeat && releasedItemRef.current !== item) {
      releasedItemRef.current = item;
      onResultRelease?.(item.id);
    }
    if (seq.beat === 'done' && completedItemRef.current !== item) {
      completedItemRef.current = item;
      onComplete(item.id);
    }
  }, [item, onComplete, onResultRelease, seq.beat]);

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
          damageAmount={
            damage && damageVisibleAtBeat(seq.beat, item.attack.hit)
              ? damage.amount
              : undefined
          }
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
