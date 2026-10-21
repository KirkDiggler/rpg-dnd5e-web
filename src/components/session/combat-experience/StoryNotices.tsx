import type { CSSProperties } from 'react';
import { ActForm } from './forms/ActForm';
import { FormShell } from './forms/FormShell';
import styles from './StoryNotices.module.css';
import type { StoryNotice } from './useStoryNotices';

/**
 * The toasts: each the toast-size form of its act (#1301), the describer's
 * one line. A held toast (fired in a fight) shows until the viewer's next
 * act and does not fade on a timer.
 */
export function StoryNotices({ entries }: { entries: readonly StoryNotice[] }) {
  return (
    <section
      className={styles.notices}
      aria-label="Recent activity"
      aria-live="polite"
      aria-relevant="additions text"
      data-testid="story-notices"
    >
      {entries.map((entry) => (
        <article
          key={entry.id}
          className={styles.notice}
          data-notice-id={entry.id}
          data-tone={entry.tone}
          data-toast-case={entry.toastRule?.case}
          data-held={entry.notice.held ? 'true' : undefined}
          style={
            {
              '--notice-ttl': `${entry.notice.durationMs}ms`,
            } as CSSProperties
          }
        >
          {entry.act && entry.describeContext ? (
            <ActForm
              act={entry.act}
              size="toast"
              context={entry.describeContext}
            />
          ) : (
            <FormShell
              size="toast"
              kind="story"
              lines={{
                eyebrow: entry.eyebrow,
                headline: entry.headline,
                outcome: entry.detail || undefined,
              }}
            />
          )}
        </article>
      ))}
    </section>
  );
}
