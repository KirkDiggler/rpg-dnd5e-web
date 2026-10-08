import styles from './ActionInformationContent.module.css';
import type { ActionEffectLine, ActionTooltipLine } from './actionTooltip';
import { EffectRows } from './EffectRows';

/** Shared read-only body: action meaning and base facts, then contextual answers. */
export function ActionInformationContent({
  description,
  lines,
  effects,
  targetEffects = [],
  targetName,
}: {
  description: string;
  lines: readonly ActionTooltipLine[];
  effects: readonly ActionEffectLine[];
  targetEffects?: readonly ActionEffectLine[];
  targetName?: string;
}) {
  const targetLabel = `Effects on ${targetName || 'selected target'}`;
  return (
    <div className={styles.content}>
      <p className={description.trim() ? styles.description : styles.missing}>
        {description.trim() ? description : 'Description not provided.'}
      </p>
      {lines.length > 0 && (
        <dl className={styles.facts}>
          {lines.map((line, index) => (
            <div key={`${index}:${line.label}`}>
              <dt>
                {line.label.trim() ? line.label : 'Detail label not provided'}
              </dt>
              <dd>{line.value.trim() ? line.value : 'Value not provided'}</dd>
            </div>
          ))}
        </dl>
      )}
      {effects.length > 0 && (
        <section className={styles.effects}>
          <h4>Effects on this action</h4>
          <EffectRows lines={effects} label="Effects on this action" />
        </section>
      )}
      {targetEffects.length > 0 && (
        <section className={styles.effects}>
          <h4>{targetLabel}</h4>
          <EffectRows lines={targetEffects} label={targetLabel} />
        </section>
      )}
    </div>
  );
}
