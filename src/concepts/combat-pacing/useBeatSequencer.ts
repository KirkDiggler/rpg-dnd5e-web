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
 *
 * `reducedMotion` is a live control in the round-one concept (a user can
 * flip it mid-scenario), not a one-time mount option, so the bootstrapping
 * effect below distinguishes two cases by reference-comparing the
 * incoming `scenario` against the previous one: a genuine scenario-
 * identity change rebuilds groups and restarts at group 0's cue, while a
 * `reducedMotion`-only change (same scenario) clears the pending timer
 * and restarts the CURRENT group at cue under the new timing — it never
 * rebuilds groups or rewinds to group 0, so an already-completed earlier
 * correlation group is never replayed.
 *
 * `groups` (the scenario's events split into correlation groups) is
 * real `useState`, not a bare ref, unlike the internal-only concern
 * `beat`/`groupIndex` describe above — it is rebuilt wholesale exactly
 * once per genuine scenario change, on a completely independent axis
 * from `beat`/`groupIndex`'s own transitions. A ref-only mutation here
 * would only be VISIBLE to a re-render by accident, riding along on
 * `beat`/`groupIndex` also happening to change value in the same pass;
 * when a new scenario happens to land on the exact same `beat`
 * (`'done'`) and `groupIndex` (`0`) as the previous one — e.g. two
 * different `pace: 'instant'` scenarios back to back — React bails
 * those same-value state updates via `Object.is`, no render is
 * scheduled at all, and the ref mutation is never read again (a real,
 * previously-shipped bug this hook's tests below guard against). A
 * freshly built groups array is never `Object.is`-equal to the old one,
 * so routing it through `useState` (via `setGroups`, the same
 * dual ref+state pattern as `setBeat`/`setGroupIndex`) guarantees a
 * render on every genuine scenario change regardless of what
 * `beat`/`groupIndex` do. `groupsRef` still exists alongside it, kept
 * in lockstep, because the engine functions below run synchronously
 * from timer callbacks and need the CURRENT groups at call time — a
 * ref mutation is visible immediately; a `useState` setter's new value
 * is only visible on the NEXT render, too late for those callers.
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

/** Cinematic-mode defaults — revised in Kirk's first interactive-review
 * iteration (rpg-dnd5e-web#561, PR #579): round one's low-end-of-range
 * values (150/600/200/300/200) read as instant/flat once a real faceted
 * d20 was on screen — a suspenseful reveal needs a genuinely held tumble
 * and a genuinely held verdict, not a blink. This iteration's exact
 * targets land a routine Cinematic hit at 300+2000+1600+900+200... see
 * below for the exact per-beat accounting: hit =
 * 300+2000+1600+900+300 = 5100ms (≈5s, Kirk's approved target); miss =
 * 300+2000+1600+300 = 4200ms (≈4s), skipping Impact. */
export const CINEMATIC: BeatDurations = {
  cue: 300,
  throw: 2000,
  verdict: 1600,
  impact: 900,
  release: 300,
};

/** Repeat-roll / grunt-tier compression (design.md §4): exactly half of
 * every CINEMATIC duration ("shorter tumble, faster stamp") — Kirk's
 * iteration-1 feedback ("Brisk should remain shorter") is satisfied by
 * this ratio staying fixed at exactly 1/2 as CINEMATIC's own values grew:
 * hit = 150+1000+800+450+150 = 2550ms; miss = 150+1000+800+150 = 2100ms,
 * skipping Impact. */
export const BRISK: BeatDurations = {
  cue: 150,
  throw: 1000,
  verdict: 800,
  impact: 450,
  release: 150,
};

/** Crit stretches Verdict (the frame-breaker) and oversizes Impact,
 * applied ONLY at Cinematic pace so a Cinematic-tier crit's total budget
 * lands at exactly 300+2000+(1600+1000)+(900+500)+300 = 6600ms — Kirk's
 * iteration-1 approved "crit 6-7s" target (design.md §1's original "crit
 * ≈ 2.5s (earned)" is superseded by this iteration's review). A
 * Brisk-pace crit (a grunt's lucky roll) does NOT stretch — grunts stay
 * Brisk even on a crit; only Cinematic actors (players, elites/bosses)
 * get the frame-break, matching design.md §4's "the boss's crit should
 * land like a player's" (the boss scenario is itself tiered Cinematic,
 * not Brisk-with-an-exception). */
export const CRIT_VERDICT_EXTRA_MS = 1000;
export const CRIT_IMPACT_EXTRA_MS = 500;

/** A player must never be able to stall the table sitting on an
 * un-thrown die (design.md §2, "a short auto-timeout"). No number is
 * given in the design doc — 3000ms is this round's concrete, tunable
 * choice. Deliberately UNCHANGED in Kirk's first interactive-review
 * iteration (rpg-dnd5e-web#561, PR #579): this is the `armed` *agency
 * pause* before a throw begins/commits — a separate axis from the
 * Cue->Release *reveal* duration the CINEMATIC/BRISK tables above tune.
 * Kirk asked to tune this one separately in a later pass. */
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
  // `groups` is real state, not a bare ref — see the file header for why
  // (same-value `beat`/`groupIndex` updates can otherwise leave a
  // ref-only mutation unread). `groupsRef` mirrors it for the engine
  // functions below, which need synchronous access at call time.
  const [groups, setGroupsState] = useState<BeatGroupResult[]>(() =>
    groupByCorrelation(scenario.events)
  );
  const groupsRef = useRef<BeatGroupResult[]>(groups);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setBeat = (b: BeatName) => {
    beatRef.current = b;
    setBeatState(b);
  };
  const setGroupIndex = (i: number) => {
    groupIndexRef.current = i;
    setGroupIndexState(i);
  };
  const setGroups = (g: BeatGroupResult[]) => {
    groupsRef.current = g;
    setGroupsState(g);
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

  /** Distinguishes "the scenario itself changed" from "only reducedMotion
   * changed" inside one effect, by reference-comparing against the
   * PREVIOUS scenario each run — `undefined` on the very first run makes
   * mount take the same "scenario changed" branch as a real scenario
   * swap, so mount initializes group 0 exactly once with no separate
   * effect and no duplicate start. */
  const prevScenarioRef = useRef<CombatPacingScenario | undefined>(undefined);

  useEffect(() => {
    const scenarioChanged = prevScenarioRef.current !== scenario;
    prevScenarioRef.current = scenario;
    if (scenarioChanged) {
      // New scenario identity (including the initial mount) — rebuild
      // groups from scratch and restart at group 0's cue. Goes through
      // `setGroups` (not a bare `groupsRef.current =` mutation) so this
      // always triggers a render — see `groups` state's own comment
      // above for why a ref-only mutation is not sufficient here.
      setGroups(groupByCorrelation(scenario.events));
      setGroupIndex(0);
      startGroup(0);
    } else {
      // Same scenario, only `reducedMotion` (a live control) changed —
      // clear whatever timer is pending and restart the CURRENT group at
      // cue under the new timing semantics. Never rebuild groups or
      // rewind to group 0 here: earlier correlation groups already
      // finished and must never be replayed.
      clearTimer();
      startGroup(groupIndexRef.current);
    }
    return clearTimer;
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
    groupCount: groups.length,
    group: groups[groupIndex],
    throwDie,
    skip,
  };
}
