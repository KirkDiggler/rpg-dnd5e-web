import {
  AttackOutcome,
  type Roll,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import {
  describeAct,
  formatRollBreakdown,
  formatRollFormula,
  formatRollShort,
} from './describeAct';
import styles from './RecentEventSummary.module.css';
import type { CombatExperienceStoryExchange } from './types';

/** A literal/modifier-only payload is flat; missing dice detail alone is not proof. */
function isFlatContribution(roll: Roll | undefined): boolean {
  if (!roll || roll.dice.length || roll.terms.length || roll.of) return false;
  const expression = roll.expression.trim();
  return (
    /^[+-]?\d+$/.test(expression) || (!expression && roll.modifiers.length > 0)
  );
}

function RollCard({
  label,
  roll,
  kind,
  tone,
  source,
  multiplier,
}: {
  label: string;
  roll?: Roll;
  kind: 'attack' | 'damage' | 'save' | 'bonus';
  tone: CombatExperienceStoryExchange['tone'];
  source?: string;
  multiplier?: number;
}) {
  const formula = roll
    ? roll.expression
      ? formatRollShort(roll)
      : formatRollBreakdown(roll)
    : undefined;
  return (
    <section
      className={styles.roll}
      data-kind={kind}
      data-tone={tone}
      role="group"
      aria-label={source ? `${label} · ${source}` : label}
    >
      <header>
        <span>
          {label}
          {source && <small>{source}</small>}
        </span>
        {roll ? (
          <strong className={styles.total}>
            {kind === 'bonus' && roll.total > 0 ? `+${roll.total}` : roll.total}
          </strong>
        ) : (
          <span className={styles.missing}>Not supplied</span>
        )}
      </header>
      {kind !== 'bonus' && formula && <code>{formula}</code>}
      {multiplier !== undefined && (
        <small className={styles.multiplier}>
          Applied multiplier ×{multiplier}
        </small>
      )}
    </section>
  );
}
/** Read resolved values, never recreate a roll from a weapon or applied damage. */
export function RecentEventSummary({
  entry,
  showDescription = true,
}: {
  entry: CombatExperienceStoryExchange;
  showDescription?: boolean;
}) {
  const context = entry.describeContext;
  const act = entry.act;
  const description = act && context ? describeAct(act, context) : undefined;
  const attack =
    act && !act.refused && act.body.case === 'attack'
      ? act.body.value
      : undefined;
  const otherRolls =
    act && context && !act.refused && !attack
      ? formatRollFormula(act, context)
      : '';
  return (
    <div className={styles.summary}>
      {showDescription && <h3>{description?.headline ?? entry.headline}</h3>}
      {showDescription && (description?.outcome ?? entry.detail) && (
        <p className={styles.outcome} data-tone={entry.tone}>
          {description?.outcome ?? entry.detail}
        </p>
      )}
      {attack && (
        <div className={styles.rolls}>
          {attack.outcome === AttackOutcome.WARDED ? (
            <RollCard
              label={
                attack.ward?.ability
                  ? `${attack.ward.ability} save`
                  : 'Ward save'
              }
              roll={attack.ward?.roll}
              kind="save"
              tone={entry.tone}
            />
          ) : (
            <RollCard
              label="Attack roll"
              roll={attack.roll}
              kind="attack"
              tone={entry.tone}
            />
          )}
          {attack.damageComponents.map((part, index) => {
            const flat = isFlatContribution(part.roll);
            return (
              <RollCard
                key={index}
                label={
                  flat
                    ? part.roll!.total < 0
                      ? 'Damage modifier'
                      : 'Damage bonus'
                    : 'Damage roll'
                }
                roll={part.roll}
                kind={flat ? 'bonus' : 'damage'}
                tone={entry.tone}
                source={
                  attack.damageComponents.length > 1
                    ? part.source || `Component ${index + 1}`
                    : undefined
                }
                multiplier={part.multiplier}
              />
            );
          })}
          {attack.outcome === AttackOutcome.HIT &&
            attack.damageComponents.length === 0 && (
              <RollCard label="Damage roll" kind="damage" tone={entry.tone} />
            )}
        </div>
      )}
      {otherRolls && (
        <section
          className={styles.roll}
          data-kind="save"
          role="group"
          aria-label="Rolls"
        >
          <header>
            <span>Rolls</span>
          </header>
          <code>{otherRolls}</code>
        </section>
      )}
    </div>
  );
}
