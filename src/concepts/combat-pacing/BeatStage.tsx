/**
 * BeatStage (rpg-dnd5e-web#561) — the presentational die/verdict/damage
 * surface for one beat. Takes ONLY beat-shaped props via its OWN
 * presentation-owned `BeatAttackView`/`BeatDamageView` types
 * (`beatStageTypes.ts` — kept in its own module because presentation
 * types are owned by the presentation layer, not the data layer, the
 * same separation `equipmentTypes.ts` gives `EquipmentSlots.tsx`; it
 * also avoids this repo's `react-refresh/only-export-components` lint
 * rule, which an exported non-component helper living in a component
 * file can trip). This file does NOT import `AttackResolvedLike`/
 * `EntityDamagedLike` from `./fixtures`.
 * `fixtures.ts`'s real wire-shaped types are a structural SUPERSET of
 * `beatStageTypes.ts`'s (every field there also exists here, same
 * name/type), so `CombatPacingConcept.tsx` can pass a `BeatGroupResult`'s
 * `attack`/`damage` straight through with no adapter function and no
 * cast — TypeScript's structural typing accepts a wider object wherever
 * a narrower shape is declared. This keeps the promotion story true
 * (design.md §7, "reusable presentation components accept only
 * presentation props"): swapping the data source later (fixtures -> a
 * live-stream reassembler) never requires touching this file, because
 * this file was never coupled to the fixture module's types in the
 * first place — only to its own.
 *
 * Styling reuses two already-shipped `public/themes/base.css`
 * conventions rather than inventing new ones:
 *   - `@keyframes dice-roll` / `.animate-dice-roll` (already used by the
 *     live `src/components/DiceRoller.tsx`) for the Throw beat's tumble.
 *   - The crit/hit/miss color palette `src/components/game/CombatLog.tsx`
 *     already renders combat text in (`#facc15` gold / `#f87171` hit /
 *     `#9ca3af` miss, see its `lineStyle()`) — reused verbatim so the log
 *     and this beat stage never disagree about what a color means. This
 *     also fixes an earlier draft's incorrect claim that gold-for-crit
 *     was "future work" — it ships in this task, defined in
 *     `public/themes/base.css` (see Task 3 Step 4).
 *
 * Every SFX-worthy moment is marked with an "SFX slot" comment (design.md
 * §5: "audio hooks only — no actual sound implementation ships round
 * one").
 *
 * Accessibility: the verdict is the single announced signal for a beat —
 * it carries `role=status`/`aria-live=polite`/`aria-atomic=true` when
 * `announce` is true (the default), and the die glyph is always
 * `aria-hidden` so its tumble never competes with the verdict as a
 * screen-reader signal. `announce` exists as a prop (not hardcoded true)
 * because Task 4's side-by-side token-anchored/center-stage comparison
 * renders two `BeatStage`s off the same beat data — exactly one of that
 * pair should announce (`announce={true}`/omitted), the other should
 * pass `announce={false}`, so a screen reader hears each verdict once.
 */

import type {
  BeatAttackView,
  BeatDamageView,
  VerdictLabel,
} from './beatStageTypes';
import { verdictLabel } from './beatStageTypes';
import { D20Die } from './D20Die';
import type { BeatName } from './useBeatSequencer';

export type Placement = 'token-anchored' | 'center-stage';

export interface BeatStageProps {
  beat: BeatName;
  placement: Placement;
  attack?: BeatAttackView;
  damage?: BeatDamageView;
  reducedMotion: boolean;
  /**
   * Whether the verdict announces itself to assistive tech (`role=status`,
   * `aria-live=polite`, `aria-atomic=true`). Defaults to `true`. Task 4's
   * side-by-side token-anchored/center-stage comparison renders two
   * `BeatStage`s off the same beat — exactly ONE should announce
   * (`announce={true}`, or omitted for the default), and the other should
   * pass `announce={false}` so a screen reader hears the verdict once,
   * not twice for the same moment.
   */
  announce?: boolean;
  /**
   * Skips the Cue/Throw/animation theater and shows the authoritative
   * verdict (and, for a hit, its damage) as soon as `beat` reaches
   * `done` — design.md §8: "the authoritative outcome is always shown,
   * even in Instant mode." Presentation-owned: the sequencer still runs
   * `pace: 'instant'` straight to `done` (unchanged, see
   * `useBeatSequencer.ts`); this prop only controls what `BeatStage`
   * renders for that terminal beat. Defaults to `false` so every other
   * caller's existing "done renders nothing" behavior is unaffected.
   */
  persistResult?: boolean;
}

/** Frame-break verdicts (design.md §2) promote a token-anchored stage to
 * center-stage. Derived from the single computed `VerdictLabel` rather
 * than re-deriving from `attack.critical`/`attackRoll`/`hit` separately,
 * so the verdict shown and the promotion decision can never drift apart. */
function isFrameBreakVerdict(label: VerdictLabel): boolean {
  return label === 'CRIT' || label === 'NAT-1';
}

function verdictModifier(label: VerdictLabel): string {
  switch (label) {
    case 'CRIT':
      return 'crit';
    case 'NAT-1':
      return 'nat1';
    case 'HIT':
      return 'hit';
    case 'MISS':
      return 'miss';
    default:
      return '';
  }
}

export function BeatStage({
  beat,
  placement,
  attack,
  damage,
  reducedMotion,
  announce = true,
  persistResult = false,
}: BeatStageProps) {
  const label = verdictLabel(attack);
  const modifier = verdictModifier(label);
  const isCrit = label === 'CRIT';

  // Instant mode (design.md §8): the sequencer jumps straight to `done`
  // with no Cue/Throw/Impact/Release beats to carry the verdict/damage —
  // `persistResult` tells this terminal beat to show the same
  // authoritative outcome those beats would have, instead of nothing.
  const showPersistedResult = persistResult && beat === 'done';

  // Kirk's first interactive-review iteration (PR #579): the d20 is now
  // visible across the ENTIRE die-through-outcome span, not just
  // armed/throw — it stays on screen at verdict/impact/release (and a
  // persisted Instant `done`), always settled on the authoritative
  // landed face there. Cue/idle/a non-persisted `done` still render no
  // die at all (unchanged from round one).
  const showDie =
    beat === 'armed' ||
    beat === 'throw' ||
    beat === 'verdict' ||
    beat === 'impact' ||
    beat === 'release' ||
    showPersistedResult;
  // Hidden (a `?` face, never the server's real roll) only while armed
  // or mid-throw; revealed (the real, already-resolved `attackRoll`)
  // everywhere else the die shows at all — including immediately for a
  // persisted Instant `done`, per design.md §8's "the authoritative
  // outcome is always shown."
  const dieRevealed = beat !== 'armed' && beat !== 'throw';
  // Tumbles ONLY during `throw` — never during `armed`'s silent wait,
  // and `D20Die` itself additionally suppresses this under
  // `reducedMotion` (settled instead), so no separate check is needed
  // here for that.
  const dieTumbling = beat === 'throw';

  // Token-anchored promotes to center-stage for a crit/nat-1 frame-break
  // (design.md §2) — a pure center-stage placement never moves.
  const effectivePlacement: Placement =
    placement === 'token-anchored' && isFrameBreakVerdict(label)
      ? 'center-stage'
      : placement;

  const announceProps = announce
    ? { role: 'status', 'aria-live': 'polite' as const, 'aria-atomic': true }
    : {};

  const stageClassName = [
    'beat-stage',
    `beat-stage--${effectivePlacement}`,
    reducedMotion ? 'beat-stage--reduced-motion' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      data-testid="beat-stage"
      data-beat={beat}
      data-placement={effectivePlacement}
      className={stageClassName}
    >
      {beat === 'cue' && (
        // SFX slot: a soft "readying" cue sting.
        <div data-testid="beat-cue" className="beat-cue">
          {attack?.attackerEntityId ?? '…'} readies…
        </div>
      )}

      {showDie && (
        // SFX slot: die-tumble rattle (throw) / none (armed, silent wait;
        // verdict/impact/release, already landed). Decorative
        // (aria-hidden) — the verdict beat remains the single announced
        // signal, never the die itself (`D20Die` is independently
        // `aria-hidden` too, belt-and-suspenders for the same contract).
        // `dieRevealed` hides the authoritative `attackRoll` behind a
        // `?` face until verdict — this component never leaks the
        // server's already-resolved roll a beat early, and tap timing
        // on "Roll d20" can never change what number eventually shows.
        <div
          data-testid="beat-die"
          aria-hidden="true"
          className={
            dieTumbling && !reducedMotion
              ? 'beat-die beat-die--tumbling'
              : 'beat-die beat-die--settled'
          }
        >
          <D20Die
            face={attack?.attackRoll}
            revealed={dieRevealed}
            tumbling={dieTumbling}
            reducedMotion={reducedMotion}
          />
        </div>
      )}

      {(beat === 'verdict' ||
        beat === 'impact' ||
        beat === 'release' ||
        showPersistedResult) &&
        attack && (
          // SFX slot: verdict stamp (gold chime on CRIT, comedic honk on
          // NAT-1, a duller thud on MISS, a clean stamp on HIT).
          <div
            data-testid="beat-verdict"
            className={`beat-verdict beat-verdict--${modifier}`}
            {...announceProps}
          >
            {label} ({attack.attackRoll}+{attack.attackBonus} vs AC{' '}
            {attack.targetAc})
          </div>
        )}

      {(beat === 'impact' || showPersistedResult) && damage && (
        // SFX slot: impact thud, oversized/gold-tinted on a crit.
        <div
          data-testid="beat-damage"
          className={`beat-damage${isCrit ? ' beat-damage--crit' : ''}`}
        >
          -{damage.amount}
        </div>
      )}
    </div>
  );
}
