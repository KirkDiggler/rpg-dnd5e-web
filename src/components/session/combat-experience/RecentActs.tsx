/**
 * RecentActs — the newest acts as toast-size forms, behind a family filter
 * (rpg-dnd5e-web#1301). The same form the toast and the log draw; clicking
 * one scrolls the story log to its row.
 */
import { useState } from 'react';
import styles from './CombatExperience.module.css';
import { ActForm } from './forms/ActForm';
import {
  RECENT_CATEGORIES,
  RECENT_DEFAULT,
  selectRecent,
  type RecentCategory,
} from './recentSelection';
import type { CombatExperienceStoryExchange } from './types';

export function RecentActs({
  story,
  onSelect,
}: {
  story: readonly CombatExperienceStoryExchange[];
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] =
    useState<ReadonlySet<RecentCategory>>(RECENT_DEFAULT);
  const recent = selectRecent(story, filter);
  return (
    <section
      className={styles.recentActs}
      aria-label="Recent acts"
      data-testid="recent-acts"
    >
      <div className={styles.recentFilter} role="group" aria-label="Show">
        {RECENT_CATEGORIES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter.has(key)}
            onClick={() =>
              setFilter((current) => {
                const next = new Set(current);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              })
            }
          >
            {label}
          </button>
        ))}
      </div>
      <ol>
        {recent.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              data-recent-id={entry.id}
              onClick={() => onSelect(entry.id)}
            >
              {entry.act && entry.describeContext && (
                <ActForm
                  act={entry.act}
                  size="toast"
                  context={entry.describeContext}
                />
              )}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
