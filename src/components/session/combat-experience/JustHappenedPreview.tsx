import styles from './CombatExperience.module.css';
import { ActForm } from './forms/ActForm';
import { RECENT_DEFAULT, selectRecent } from './recentSelection';
import type { CombatExperienceStoryExchange } from './types';

/** A compact view of already-released story rows, never a record/toast source. */
export function JustHappenedPreview({
  story,
  onSelect,
}: {
  story: readonly CombatExperienceStoryExchange[];
  onSelect: (id: string) => void;
}) {
  const recent = selectRecent(story, RECENT_DEFAULT, 3);
  return (
    <section className={styles.hudRecent} aria-label="Recent outcomes">
      {recent.length === 0 ? (
        <p>No recent events yet.</p>
      ) : (
        recent.map((entry) => (
          <button
            key={entry.id}
            type="button"
            data-recent-id={entry.id}
            data-tone={entry.tone}
            aria-label={`Read event: ${entry.headline}`}
            onClick={() => onSelect(entry.id)}
          >
            {entry.act && entry.describeContext && (
              <ActForm
                act={entry.act}
                context={entry.describeContext}
                size="toast"
              />
            )}
          </button>
        ))
      )}
    </section>
  );
}
