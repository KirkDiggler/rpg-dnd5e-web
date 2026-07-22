/**
 * useBeatSequencer (rpg-dnd5e-web#561) — the pure timing state machine for
 * the attack-loop beat model (design.md §1). Drives one scenario's
 * correlation groups through Cue -> [Armed] -> Throw -> Verdict ->
 * [Impact] -> Release -> Done, with pace-derived durations, crit
 * stretch, a short auto-throw timeout, tap-to-skip, and repeat-roll
 * compression (every group after the first runs at Brisk regardless of
 * the scenario's declared pace, and auto-plays without an armed wait).
 *
 * Internal decisions (skip/throwDie/finishGroup) read from `beatRef`/
 * `groupIndexRef`, NOT the `beat`/`groupIndex` React state variables —
 * `useState` here exists only to trigger a re-render; the refs are the
 * single source of truth for "what beat are we actually in right now",
 * updated synchronously in the same tick a transition happens. This
 * matters because `skip()` can be called twice back-to-back in the same
 * event-handler tick (a fast double-click, or a single `act()` block in
 * a test) — reading React state there would see the PRE-update value
 * both times (state only commits on the next render), so two skips in
 * one tick would both take the same branch instead of advancing twice.
 *
 * This hook renders nothing and knows nothing about fixtures beyond the
 * `CombatPacingScenario` shape — `BeatStage.tsx` (Task 3) is the only
 * consumer that turns `beat`/`group` into pixels, and it does so through
 * its OWN presentation-owned types, not this module's fixture-shaped
 * ones (see `BeatStage.tsx`'s header).
 */

import { useEffect, useRef, useState } from 'react';
import type { CombatPacingScenario } from './fixtures';
import { groupByCorrelation, type BeatGroupResult } from './fixtures';

export type BeatName =
  | 'idle'
  | 'cue'
  | 'armed'
  | 'throw'
  | 'verdict'
  | 'impact'
  | 'release'
  | 'done';

export interface BeatDurations {
  cue: number;
  throw: number;
  verdict: number;
  impact: number;
  release: number;
}

/** Cinematic-mode defaults (design.md §1) — the LOW end of each stated
 * range, chosen so the routine-hit/miss budgets land inside design.md's
 * stated bands: hit = 150+600+200+300+200 = 1450ms (design: "≈1.2-1.6s");
 * miss = 150+600+200+200 = 1150ms, skipping Impact (design: "≈1.0s" —
 * close; every value here is tunable, none is a placeholder). */
export const CINEMATIC: BeatDurations = {
  cue: 150,
  throw: 600,
  verdict: 200,
  impact: 300,
  release: 200,
};

/** Repeat-roll / grunt-tier compression (design.md §4): exactly half of
 * every CINEMATIC duration ("shorter tumble, faster stamp"). */
export const BRISK: BeatDurations = {
  cue: 75,
  throw: 300,
  verdict: 100,
  impact: 150,
  release: 100,
};

/** Crit stretches Verdict (the frame-breaker) and slightly oversizes
 * Impact, applied ONLY at Cinematic pace so a Cinematic-tier crit's total
 * budget lands at exactly 150+600+(200+1000)+(300+50)+200 = 2500ms —
 * design.md §1's "crit ≈ 2.5s (earned)". A Brisk-pace crit (a grunt's
 * lucky roll) does NOT stretch — grunts stay Brisk even on a crit; only
 * Cinematic actors (players, elites/bosses) get the frame-break, matching
 * design.md §4's "the boss's crit should land like a player's" (the boss
 * scenario is itself tiered Cinematic, not Brisk-with-an-exception). */
export const CRIT_VERDICT_EXTRA_MS = 1000;
export const CRIT_IMPACT_EXTRA_MS = 50;

/** A player must never be able to stall the table sitting on an
 * un-thrown die (design.md §2, "a short auto-timeout"). No number is
 * given in the design doc — 3000ms is this round's concrete, tunable
 * choice. */
export const AUTO_THROW_TIMEOUT_MS = 3000;

/** Reduced motion drops the tumble itself but keeps every beat's
 * semantics (design.md §4) — collapse Throw to a brief settle instead of
 * removing the beat outright. */
export const REDUCED_MOTION_THROW_MS = 80;

export interface UseBeatSequencerOptions {
  reducedMotion?: boolean;
}

export interface BeatSequencerState {
  beat: BeatName;
  groupIndex: number;
  groupCount: number;
  group?: BeatGroupResult;
  /** Throws the player's own die during `armed`; a no-op in any other beat. */
  throwDie: () => void;
  /** Jumps straight to `verdict` from `cue`/`armed`/`throw` (design.md §1:
   * "tap-to-skip jumps to the verdict"); from `verdict`/`impact`/`release`,
   * finishes the current group instead (advances to the next group, or
   * `done` if none remains) — round-one's extension of the same "never
   * trap a player in an animation" principle (design.md §8). Synchronous
   * and safe to call twice in the same tick — see file header. */
  skip: () => void;
}

export function useBeatSequencer(
  scenario: CombatPacingScenario,
  options: UseBeatSequencerOptions = {}
): BeatSequencerState {
  const { reducedMotion = false } = options;
  const [beat, setBeatState] = useState<BeatName>('idle');
  const [groupIndex, setGroupIndexState] = useState(0);
  const beatRef = useRef<BeatName>('idle');
  const groupIndexRef = useRef(0);
  const groupsRef = useRef<BeatGroupResult[]>(
    groupByCorrelation(scenario.events)
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setBeat = (b: BeatName) => {
    beatRef.current = b;
    setBeatState(b);
  };
  const setGroupIndex = (i: number) => {
    groupIndexRef.current = i;
    setGroupIndexState(i);
  };

  const clearTimer = () => {
    if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    timerRef.current = undefined;
  };

  const after = (ms: number, run: () => void) => {
    clearTimer();
    timerRef.current = setTimeout(run, ms);
  };

  /** Reference-equality against the module-level CINEMATIC/BRISK singleton
   * (not a duration-value heuristic) — every group after the first
   * compresses to BRISK regardless of the scenario's own pace. */
  const durationsFor = (index: number): BeatDurations =>
    scenario.pace === 'brisk' || index > 0 ? BRISK : CINEMATIC;

  const finishGroup = (index: number) => {
    const next = index + 1;
    if (groupsRef.current[next]) {
      setGroupIndex(next);
      startGroup(next);
    } else {
      setBeat('done');
    }
  };

  const startGroup = (index: number) => {
    const group = groupsRef.current[index];
    if (!group || scenario.pace === 'instant') {
      setBeat('done');
      return;
    }
    const d = durationsFor(index);
    setBeat('cue');
    after(d.cue, () => {
      // Only the FIRST roll of a turn waits for the player's own throw —
      // repeat-roll compression (design.md §4) auto-plays every
      // subsequent group in the same turn, matching the speed the
      // compressed Brisk durations already imply.
      if (scenario.role === 'self' && index === 0) {
        setBeat('armed');
        after(AUTO_THROW_TIMEOUT_MS, () => runThrow(index));
      } else {
        runThrow(index);
      }
    });
  };

  const runThrow = (index: number) => {
    clearTimer();
    setBeat('throw');
    const d = durationsFor(index);
    const throwMs = reducedMotion ? REDUCED_MOTION_THROW_MS : d.throw;
    after(throwMs, () => runVerdict(index));
  };

  const runVerdict = (index: number) => {
    const group = groupsRef.current[index];
    const d = durationsFor(index);
    const cinematic = d === CINEMATIC;
    const critical = group?.attack?.critical ?? false;
    const hit = group?.attack?.hit ?? false;
    setBeat('verdict');
    const verdictMs =
      critical && cinematic ? d.verdict + CRIT_VERDICT_EXTRA_MS : d.verdict;
    after(verdictMs, () => {
      if (hit) runImpact(index);
      else runRelease(index);
    });
  };

  const runImpact = (index: number) => {
    const group = groupsRef.current[index];
    const d = durationsFor(index);
    const cinematic = d === CINEMATIC;
    const critical = group?.attack?.critical ?? false;
    setBeat('impact');
    const impactMs =
      critical && cinematic ? d.impact + CRIT_IMPACT_EXTRA_MS : d.impact;
    after(impactMs, () => runRelease(index));
  };

  const runRelease = (index: number) => {
    const d = durationsFor(index);
    setBeat('release');
    after(d.release, () => finishGroup(index));
  };

  useEffect(() => {
    groupsRef.current = groupByCorrelation(scenario.events);
    setGroupIndex(0);
    startGroup(0);
    return clearTimer;
    // `reducedMotion` is a live control (round-one concept toggle), not a
    // one-time mount option — including it here means an in-flight chain
    // never runs on a stale `reducedMotion` closure; toggling it restarts
    // the current scenario from cue under the new timing semantics
    // instead of finishing the old one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, reducedMotion]);

  const throwDie = () => {
    if (beatRef.current === 'armed') runThrow(groupIndexRef.current);
  };

  const skip = () => {
    const current = beatRef.current;
    if (current === 'idle' || current === 'done') return;
    if (current === 'cue' || current === 'armed' || current === 'throw') {
      runVerdict(groupIndexRef.current);
    } else {
      clearTimer();
      finishGroup(groupIndexRef.current);
    }
  };

  return {
    beat,
    groupIndex,
    groupCount: groupsRef.current.length,
    group: groupsRef.current[groupIndex],
    throwDie,
    skip,
  };
}
