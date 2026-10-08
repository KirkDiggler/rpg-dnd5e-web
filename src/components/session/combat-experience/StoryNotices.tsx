import type { CSSProperties } from 'react';
import styles from './StoryNotices.module.css';
import type { CombatExperienceStoryExchange } from './types';
import { STORY_NOTICE_TTL_MS } from './useStoryNotices';

export function StoryNotices({
  entries,
}: {
  entries: readonly CombatExperienceStoryExchange[];
}) {
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
          style={
            { '--notice-ttl': `${STORY_NOTICE_TTL_MS}ms` } as CSSProperties
          }
        >
          {entry.eyebrow && (
            <span className={styles.context}>{entry.eyebrow}</span>
          )}
          <strong>{entry.headline}</strong>
          {entry.detail && <p>{entry.detail}</p>}
        </article>
      ))}
    </section>
  );
}
