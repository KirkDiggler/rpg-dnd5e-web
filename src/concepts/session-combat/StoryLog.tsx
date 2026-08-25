import styles from './SessionCombatConcept.module.css';
import type {
  SessionCombatAttackOutcome,
  SessionCombatStoryExchange,
} from './sessionCombatTypes';

export type SessionCombatLogMode = 'story' | 'debug';

export interface StoryLogProps {
  story: SessionCombatStoryExchange[];
  debug: string[];
  mode: SessionCombatLogMode;
  streamState: 'live' | 'caught-up';
  onModeChange: (mode: SessionCombatLogMode) => void;
  result?: SessionCombatAttackOutcome;
}

function StoryEntry({ entry }: { entry: SessionCombatStoryExchange }) {
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

function ResultEntry({ result }: { result: SessionCombatAttackOutcome }) {
  const verdict = result.critical
    ? 'Critical hit'
    : result.hit
      ? 'Hit'
      : 'Miss';
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
      <p>
        <b>{result.d20}</b> + {result.bonus} = <b>{result.total}</b> against AC{' '}
        {result.against} · {verdict}
      </p>
      {result.hit && (
        <div className={styles.damageSummary}>
          <span>−{result.damage}</span>
          <div>
            <strong>{result.damageType} damage</strong>
            <small>
              {result.target} · {result.hpAfter.current}/{result.hpAfter.max} HP
            </small>
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
}: StoryLogProps) {
  return (
    <aside
      data-testid="session-combat-log"
      className={styles.storyLog}
      aria-label="Story log"
    >
      <header>
        <div>
          <span className={styles.panelEyebrow}>
            {mode === 'story' ? 'Encounter story' : 'Developer stream'}
          </span>
          <strong>
            {mode === 'story' ? 'What happened' : 'Every wire fact'}
          </strong>
        </div>
        <span
          className={`${styles.liveBadge} ${streamState === 'caught-up' ? styles.caughtUpBadge : ''}`}
        >
          {streamState === 'caught-up' ? 'Caught up' : 'Live'}
        </span>
      </header>

      {mode === 'story' ? (
        <div className={styles.storyEntries}>
          {story.map((entry) => (
            <StoryEntry key={entry.id} entry={entry} />
          ))}
          {result && <ResultEntry result={result} />}
        </div>
      ) : (
        <div className={styles.debugFeed} aria-label="Raw debug feed">
          {debug.map((line, index) => (
            <div key={`${index}-${line}`}>{line}</div>
          ))}
        </div>
      )}

      <footer>
        <button
          type="button"
          className={mode === 'story' ? '' : styles.quietButton}
          aria-pressed={mode === 'story'}
          onClick={() => onModeChange('story')}
        >
          Story
        </button>
        <button
          type="button"
          className={mode === 'debug' ? '' : styles.quietButton}
          aria-pressed={mode === 'debug'}
          onClick={() => onModeChange('debug')}
        >
          Debug
        </button>
      </footer>
    </aside>
  );
}
