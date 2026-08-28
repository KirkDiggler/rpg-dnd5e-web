/**
 * useDiceSettleGate — holds an attack's revealed outcome back until the die
 * has actually come to rest.
 *
 * # Why the release is not the landing
 *
 * `dice-presentation-released` fires when the player THROWS the die, not when
 * it lands. That is what the presentation reducer settles on, so
 * `selectVisibleResult` goes visible at the throw and everything hanging off
 * it — the damage toast especially — announced the outcome over a still-
 * tumbling die (Kirk, 2026-08-28: "the toast shows up before the dice is
 * resolved").
 *
 * # The signal, and why it survives real physics
 *
 * `AttackDie3D` already emits the right thing: an `AttackDieTelemetry` with
 * `state: 'observed'`. It is not a timer and not an animation callback — it
 * fires only when the die is AT REST holding its exact target and the face
 * actually read off the resting quaternion agrees with the authoritative
 * result (`exactTargetHeld`, angular error <= 0.25 degrees, up-dot and margin
 * both inside tolerance). Anything else takes the `fail(...,
 * 'settlement-observation')` path instead.
 *
 * That is precisely the property a physics roll needs. A die that tumbles off
 * the table never reaches its target, so it never produces an observation —
 * it produces a failure, which is the reroll signal. Gating on the
 * observation means this does not become a timing guess that has to be
 * re-tuned when the choreographed motion is replaced.
 *
 * # The fallback, and why it is a net rather than the mechanism
 *
 * Only the 3D renderer observes a resting die. Without WebGL the tray falls
 * back to a truthful SVG that never emits an observation, and a gate waiting
 * on one would hold the outcome forever. So an attack that has been waiting
 * longer than any real roll takes is released anyway. This is a safety net
 * for a renderer that cannot report, NOT the timing mechanism — when the 3D
 * die reports, it always wins the race by a wide margin.
 */
import type { AttackDieTelemetry } from '@/components/ui/dice/AttackDie3D';
import { ROLL_DURATION_MS } from '@/components/ui/dice/choreographedDiceMotion';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CombatExperienceAttackOutcome } from './types';

/**
 * How long to wait for a settlement observation before revealing anyway.
 * Generously past the choreographed roll so a healthy 3D die is never beaten
 * to the punch by its own safety net.
 */
export const DICE_SETTLE_FALLBACK_MS = ROLL_DURATION_MS + 1500;

export interface UseDiceSettleGateArgs {
  /** The already-revealed outcome, straight from the presentation layer. */
  result?: CombatExperienceAttackOutcome;
  /**
   * Whether a die is actually being animated for this viewer. False for the
   * semantic fallback and for an attack with no dice presentation at all (a
   * monster's swing settles `'auto'` with nothing to watch) — those reveal
   * immediately, because there is no landing to wait for.
   */
  diePresented: boolean;
  fallbackMs?: number;
}

export interface UseDiceSettleGateResult {
  /** The outcome, once its die has landed. `undefined` while still rolling. */
  settledResult?: CombatExperienceAttackOutcome;
  /** Wire to the dice tray's `onTelemetry`. */
  onDiceTelemetry: (telemetry: AttackDieTelemetry) => void;
}

export function useDiceSettleGate({
  result,
  diePresented,
  fallbackMs = DICE_SETTLE_FALLBACK_MS,
}: UseDiceSettleGateArgs): UseDiceSettleGateResult {
  // Which attack has landed. Keyed by attackId rather than a boolean, so a
  // stale settlement can never release the NEXT attack early — a new attack
  // simply does not match, and starts its own wait.
  const [settledAttackId, setSettledAttackId] = useState<string>();

  // The attack a telemetry callback should credit.
  const currentAttackId = useRef<string | undefined>(undefined);

  // A landing that arrived BEFORE this hook knew which attack it belonged to.
  //
  // The outcome only becomes visible on release, so on the very first render
  // after a throw there is a window where the die has reported but `result`
  // has not reached us yet. A real 3D die takes ~1.9s to settle and never hits
  // it — but the window is real, anything that lands in the same tick as its
  // release falls into it, and an observation dropped there would strand the
  // log until the fallback timer. So it is held and credited to the attack
  // that arrives next, which is the presentation it came from.
  const landedEarly = useRef(false);

  useEffect(() => {
    currentAttackId.current = result?.attackId;
    if (result?.attackId && landedEarly.current) {
      landedEarly.current = false;
      setSettledAttackId(result.attackId);
    }
  }, [result?.attackId]);

  const onDiceTelemetry = useCallback((telemetry: AttackDieTelemetry) => {
    // 'observed' is the only state that means "at rest, face read, agrees
    // with the server". Every other state is in-flight or a failure.
    if (telemetry.state !== 'observed') return;
    const attackId = currentAttackId.current;
    if (attackId) setSettledAttackId(attackId);
    else landedEarly.current = true;
  }, []);

  const attackId = result?.attackId;
  const waiting =
    Boolean(attackId) && diePresented && settledAttackId !== attackId;

  // One timer per waiting attack; cleanup on change is correct here, since a
  // new attack supersedes the old wait outright rather than needing its own
  // independent lifetime to run out.
  useEffect(() => {
    if (!waiting || !attackId) return undefined;
    const timer = setTimeout(() => setSettledAttackId(attackId), fallbackMs);
    return () => clearTimeout(timer);
  }, [waiting, attackId, fallbackMs]);

  if (!result) return { settledResult: undefined, onDiceTelemetry };
  return {
    settledResult: waiting ? undefined : result,
    onDiceTelemetry,
  };
}
