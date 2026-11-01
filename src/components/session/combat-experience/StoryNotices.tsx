import { CircleHelp, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { describeAct } from './describeAct';
import { recentEventIdentity } from './recentEventIdentity';
import { StoryNoticeContent } from './StoryNoticeContent';
import styles from './StoryNotices.module.css';
import type { StoryNotice } from './useStoryNotices';

/** Compact identity shared with Just happened; history owns lasting detail. */
export function StoryNotices({ entries }: { entries: readonly StoryNotice[] }) {
  const root = useRef<HTMLElement>(null);
  const latest = useRef(entries);
  latest.current = entries;
  useEffect(() => {
    const dismissOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target)
      ) {
        latest.current[0]?.notice.dismissAll?.();
      }
    };
    document.addEventListener('pointerdown', dismissOutside, true);
    return () =>
      document.removeEventListener('pointerdown', dismissOutside, true);
  }, []);
  return (
    <section
      ref={root}
      className={styles.notices}
      aria-label="Recent activity"
      aria-live="polite"
      aria-relevant="additions"
      data-testid="story-notices"
    >
      {[...entries].reverse().map((entry) => {
        const identity =
          entry.act && entry.describeContext
            ? recentEventIdentity(entry.act, entry.describeContext)
            : { what: 'Activity', who: entry.eyebrow, icon: CircleHelp };
        const description =
          entry.act && entry.describeContext
            ? describeAct(entry.act, entry.describeContext)
            : undefined;
        const Icon = identity.icon;
        return (
          <article
            key={entry.id}
            className={styles.notice}
            data-notice-id={entry.id}
            data-tone={entry.tone}
            data-priority={
              entry.act?.body.case === 'perception' ? 'secondary' : 'primary'
            }
            data-toast-case={entry.toastRule?.case}
            onPointerEnter={() => entry.notice.setPaused?.('pointer', true)}
            onPointerLeave={() => entry.notice.setPaused?.('pointer', false)}
            onFocus={(event) => {
              // Mouse clicks are covered by hover; don't leave an invisible
              // focus hold behind when the pointer moves away after a click.
              if (event.target.matches(':focus-visible')) {
                entry.notice.setPaused?.('focus', true);
              }
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                entry.notice.setPaused?.('focus', false);
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.identity}>
              <Icon size={18} aria-hidden="true" />
              <strong>{identity.who}</strong>
              <span>{identity.what}</span>
              {entry.notice.dismiss && (
                <button
                  type="button"
                  aria-label={`Dismiss ${identity.what} notification`}
                  onClick={entry.notice.dismiss}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </header>
            <p className={styles.headline}>
              {description?.headline ?? entry.headline}
            </p>
            {(description?.outcome ?? entry.detail) && (
              <p>{description?.outcome ?? entry.detail}</p>
            )}
            <details className={styles.details}>
              <summary>Details</summary>
              <StoryNoticeContent entry={entry} showDescription={false} />
            </details>
          </article>
        );
      })}
    </section>
  );
}
