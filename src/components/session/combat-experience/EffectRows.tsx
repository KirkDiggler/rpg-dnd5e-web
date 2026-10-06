import type { ActionEffectLine, EffectTone } from './actionTooltip';
import styles from './CombatExperience.module.css';

/**
 * A glyph per tone, so the state reads without colour: the word is always
 * printed beside it, and each tone also has its own rule style in CSS.
 */
const marker: Record<EffectTone, string> = {
  applies: '✓',
  later: '◷',
  'does-not-apply': '–',
  depends: '?',
  unavailable: '⊘',
  unknown: '!',
};

/**
 * The one renderer for effect rows, shared by every surface that shows action
 * detail. Everything printed is a field the server wrote; this decides only
 * how each tone looks. Spans with list roles so the same markup is valid
 * inside the dock's inline tooltip card and in the block-level panels.
 */
export function EffectRows({
  lines,
  label = 'Effects',
}: {
  lines: readonly ActionEffectLine[];
  label?: string;
}) {
  if (lines.length === 0) return null;
  return (
    <span className={styles.effectRows} role="list" aria-label={label}>
      {lines.map((line) => (
        <span
          key={line.id}
          className={styles.effectRow}
          role="listitem"
          data-effect-tone={line.tone}
        >
          <span className={styles.effectRowHead}>
            <strong className={styles.effectName}>{line.name}</strong>
            <span className={styles.effectState}>
              <span aria-hidden="true">{marker[line.tone]}</span>
              {line.stateWord}
            </span>
          </span>
          {line.reason && (
            <span className={styles.effectReason}>{line.reason}</span>
          )}
          {line.benefit && (
            <span className={styles.effectBenefit}>{line.benefit}</span>
          )}
          {line.description && (
            <span className={styles.effectDescription}>{line.description}</span>
          )}
        </span>
      ))}
    </span>
  );
}
