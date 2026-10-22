import styles from './ActForm.module.css';

export type FormSize = 'toast' | 'log';

export interface FormLines {
  /** The family's label above the line (log size only). */
  readonly eyebrow: string;
  /** The describer's line, who and what: `Captain strikes Alice`. */
  readonly headline: string;
  /** The rest of the line, its outcome with no roll: `Longsword: hit`. */
  readonly outcome?: string;
  /** The roll as a formula: `Longsword 20 vs AC 13 — hit`. */
  readonly formula?: string;
  /** The roll's terms and modifiers, each source named once. */
  readonly breakdown?: string;
}

/**
 * The one renderer every form draws through, at two sizes (#1301). A toast is
 * the describer line alone. A log row is that same line under its eyebrow,
 * then the formula line, then the breakdown folded behind a toggle.
 */
/** The describer's one line: the headline and its outcome. */
function Line({ lines }: { lines: FormLines }) {
  return (
    <>
      <span>{lines.headline}</span>
      {lines.outcome && (
        <>
          {' — '}
          <span>{lines.outcome}</span>
        </>
      )}
    </>
  );
}

export function FormShell({
  size,
  lines,
  kind,
}: {
  size: FormSize;
  lines: FormLines;
  /** Which form drew it, for tests and styling: `act:attack`, `clock`. */
  kind: string;
}) {
  if (size === 'toast') {
    return (
      <strong className={styles.toastLine} data-form={kind} data-size="toast">
        <Line lines={lines} />
      </strong>
    );
  }
  return (
    <div className={styles.logForm} data-form={kind} data-size="log">
      {lines.eyebrow && <span>{lines.eyebrow}</span>}
      <strong>
        <Line lines={lines} />
      </strong>
      {lines.formula && (
        <p className={styles.formula} data-testid="act-form-formula">
          {lines.formula}
        </p>
      )}
      {lines.breakdown && (
        <details className={styles.breakdown}>
          <summary>Breakdown</summary>
          <small data-testid="story-roll-breakdown">{lines.breakdown}</small>
        </details>
      )}
    </div>
  );
}
