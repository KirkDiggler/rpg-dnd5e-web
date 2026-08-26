import styles from './CombatExperience.module.css';
import { isCombatDebugEnabled } from './diagnostics';
import type {
  CombatExperienceAttackOutcome,
  CombatExperienceLogMode,
  CombatExperienceStoryExchange,
  CombatExperienceStreamState,
} from './types';

export interface StoryLogProps {
  story: readonly CombatExperienceStoryExchange[];
  debug: readonly string[];
  mode: CombatExperienceLogMode;
  streamState: CombatExperienceStreamState;
  onModeChange: (mode: CombatExperienceLogMode) => void;
  result?: CombatExperienceAttackOutcome;
  /** Explicit diagnostic surface (for example the Concepts contract view). */
  diagnosticsEnabled?: boolean;
}

function StoryEntry({ entry }: { entry: CombatExperienceStoryExchange }) {
  return (
    <article
      className={`${styles.storyEntry} ${styles[`story_${entry.tone}`]}`}
    >
      <span>{entry.eyebrow}</span>
      <strong>{entry.headline}</strong>
      <p>{entry.detail}</p>
    </article>
  );
}

function ResultEntry({ result }: { result: CombatExperienceAttackOutcome }) {
  const verdict = result.critical
    ? 'Critical hit'
    : result.hit
      ? 'Hit'
      : 'Miss';
  const rollDetail = `d20 ${result.d20} · total ${result.total} against AC ${result.against} · ${verdict}`;
  return (
    <article className={`${styles.storyEntry} ${styles.storyResult}`}>
      <span>
        {result.actor} · {result.action}
      </span>
      <strong>
        {result.hit
          ? `${result.actor} strikes ${result.target}`
          : `${result.target} evades ${result.actor}`}
      </strong>
      <p>{rollDetail}</p>
      {result.hit && result.damage !== undefined && (
        <div className={styles.damageSummary}>
          <span>−{result.damage}</span>
          <div>
            <strong>
              {result.damageType ? `${result.damageType} damage` : 'Damage'}
            </strong>
          </div>
        </div>
      )}
    </article>
  );
}

export function StoryLog({
  story,
  debug,
  mode,
  streamState,
  onModeChange,
  result,
  diagnosticsEnabled = false,
}: StoryLogProps) {
  const debugEnabled = isCombatDebugEnabled(
    diagnosticsEnabled,
    import.meta.env.DEV
  );
  // A stale/persisted Debug preference cannot turn raw wire facts into the
  // production Story surface when diagnostics are unavailable.
  const visibleMode = debugEnabled && mode === 'debug' ? 'debug' : 'story';
  const streamLabel =
    streamState === 'live'
      ? 'Live'
      : streamState === 'caught-up'
        ? 'Caught up'
        : streamState === 'reconnecting'
          ? 'Reconnecting…'
          : 'Resyncing…';

  return (
    <aside
      data-testid="session-combat-log"
      className={styles.storyLog}
      aria-label="Story log"
    >
      <header>
        <div>
          <span className={styles.panelEyebrow}>
            {visibleMode === 'story' ? 'Encounter story' : 'Developer stream'}
          </span>
          <strong>
            {visibleMode === 'story' ? 'What happened' : 'Every wire fact'}
          </strong>
        </div>
        <span
          className={`${styles.liveBadge} ${streamState !== 'live' ? styles.caughtUpBadge : ''}`}
        >
          {streamLabel}
        </span>
      </header>

      {visibleMode === 'story' ? (
        <div
          className={styles.storyEntries}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {story.map((entry) =>
            result?.attackId === entry.id ? (
              <ResultEntry key={entry.id} result={result} />
            ) : (
              <StoryEntry key={entry.id} entry={entry} />
            )
          )}
          {result && !story.some((entry) => entry.id === result.attackId) && (
            <ResultEntry result={result} />
          )}
        </div>
      ) : (
        <div
          className={styles.debugFeed}
          aria-label="Raw debug feed"
          aria-live="off"
        >
          {debug.map((line, index) => (
            <div key={`${index}-${line}`}>{line}</div>
          ))}
        </div>
      )}

      {debugEnabled && (
        <footer>
          <button
            type="button"
            className={visibleMode === 'story' ? '' : styles.quietButton}
            aria-pressed={visibleMode === 'story'}
            onClick={() => onModeChange('story')}
          >
            Story
          </button>
          <button
            type="button"
            className={visibleMode === 'debug' ? '' : styles.quietButton}
            aria-pressed={visibleMode === 'debug'}
            onClick={() => onModeChange('debug')}
          >
            Debug
          </button>
        </footer>
      )}
    </aside>
  );
}
