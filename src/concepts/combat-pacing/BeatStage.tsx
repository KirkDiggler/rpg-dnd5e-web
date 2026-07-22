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
 */

import type {
  BeatAttackView,
  BeatDamageView,
  VerdictLabel,
} from './beatStageTypes';
import { verdictLabel } from './beatStageTypes';
import type { BeatName } from './useBeatSequencer';

export type Placement = 'token-anchored' | 'center-stage';

export interface BeatStageProps {
  beat: BeatName;
  placement: Placement;
  attack?: BeatAttackView;
  damage?: BeatDamageView;
  reducedMotion: boolean;
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
}: BeatStageProps) {
  // Token-anchored promotes to center-stage for a crit/nat-1 frame-break
  // (design.md §2) — a pure center-stage placement never moves.
  const isFrameBreak =
    !!attack && (attack.critical || (attack.attackRoll === 1 && !attack.hit));
  const effectivePlacement: Placement =
    placement === 'token-anchored' && isFrameBreak ? 'center-stage' : placement;

  const label = verdictLabel(attack);
  const modifier = verdictModifier(label);
  const isCrit = label === 'CRIT';

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

      {(beat === 'armed' || beat === 'throw') && (
        // SFX slot: die-tumble rattle (throw) / none (armed, silent wait).
        <div
          data-testid="beat-die"
          className={
            beat === 'armed' || reducedMotion
              ? 'beat-die beat-die--settled'
              : 'beat-die beat-die--tumbling'
          }
        >
          🎲
        </div>
      )}

      {(beat === 'verdict' || beat === 'impact' || beat === 'release') &&
        attack && (
          // SFX slot: verdict stamp (gold chime on CRIT, comedic honk on
          // NAT-1, a duller thud on MISS, a clean stamp on HIT).
          <div
            data-testid="beat-verdict"
            className={`beat-verdict beat-verdict--${modifier}`}
          >
            {label} ({attack.attackRoll}+{attack.attackBonus} vs AC{' '}
            {attack.targetAc})
          </div>
        )}

      {beat === 'impact' && damage && (
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
