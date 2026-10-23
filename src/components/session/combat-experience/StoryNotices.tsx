import type { CSSProperties } from 'react';
import { StoryNoticeContent } from './StoryNoticeContent';
import styles from './StoryNotices.module.css';
import type { StoryNotice } from './useStoryNotices';

/**
 * Damage-first presentation of the same released acts selected by policy.
 * A held toast (fired in a fight) shows until the viewer's next
 * act and does not fade on a timer.
 */
export function StoryNotices({ entries }: { entries: readonly StoryNotice[] }) {
  return (
    <section
      className={styles.notices}
      aria-label="Recent activity"
      tabIndex={entries.length ? 0 : undefined}
      aria-live="polite"
      aria-relevant="additions text"
      data-testid="story-notices"
    >
      {[...entries].reverse().map((entry) => (
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
          <StoryNoticeContent entry={entry} />
        </article>
      ))}
    </section>
  );
}
