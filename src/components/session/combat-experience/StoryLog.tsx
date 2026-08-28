import { isScrolledAwayFromBottom } from '@/components/game/combatLogScroll';
import { useEffect, useRef, useState } from 'react';
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

  // Auto-follow. The log is a live narration: a new beat the player cannot
  // see has not been told to them. Pinned to the newest entry by default,
  // and released the moment they scroll up to re-read an earlier beat --
  // otherwise every arriving event yanks them back down mid-read. Scrolling
  // back to the bottom re-pins.
  //
  // One ref serves both feeds: `visibleMode` renders exactly one of them, so
  // the ref only ever holds the mounted container, and the mode itself is a
  // dependency so switching feeds re-pins the newly mounted one.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedToBottom) return;
    el.scrollTop = el.scrollHeight;
  }, [story.length, result, debug.length, visibleMode, pinnedToBottom]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setPinnedToBottom(
      !isScrolledAwayFromBottom(el.scrollTop, el.scrollHeight, el.clientHeight)
    );
  };
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
          ref={scrollRef}
          data-testid="session-combat-log-scroll"
          onScroll={handleScroll}
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
          ref={scrollRef}
          data-testid="session-combat-log-scroll"
          onScroll={handleScroll}
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
