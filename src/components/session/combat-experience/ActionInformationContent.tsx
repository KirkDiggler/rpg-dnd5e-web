import styles from './ActionInformationContent.module.css';
import {
  informationDescription,
  type ActionEffectLine,
  type ActionTooltipLine,
} from './actionTooltip';
import { EffectRows } from './EffectRows';

/** Shared read-only body: action meaning and base facts, then contextual answers. */
export function ActionInformationContent({
  description,
  lines,
  effects,
  targetEffects = [],
  targetName,
  effectsLabel = 'Effects on this action',
  targetEffectsLabel,
}: {
  description: string;
  lines: readonly ActionTooltipLine[];
  effects: readonly ActionEffectLine[];
  targetEffects?: readonly ActionEffectLine[];
  targetName?: string;
  effectsLabel?: string;
  targetEffectsLabel?: string;
}) {
  const targetLabel =
    targetEffectsLabel ?? `Effects on ${targetName || 'selected target'}`;
  return (
    <div className={styles.content}>
      <p className={description.trim() ? styles.description : styles.missing}>
        {informationDescription(description)}
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
          <h4>{effectsLabel}</h4>
          <EffectRows lines={effects} label={effectsLabel} />
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
