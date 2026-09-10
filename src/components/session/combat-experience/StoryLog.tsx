import { isScrolledAwayFromBottom } from '@/components/game/combatLogScroll';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { DebugFeedEntry } from '../debugLogLine';
import styles from './CombatExperience.module.css';
import { DebugEventRow } from './DebugEventRow';
import { isCombatDebugEnabled } from './diagnostics';
import {
  formatAttackModifierSource,
  formatAttackRollArithmetic,
} from './story';
import type {
  CombatExperienceAttackOutcome,
  CombatExperienceLogMode,
  CombatExperienceStoryExchange,
  CombatExperienceStreamState,
} from './types';

export interface StoryLogProps {
  story: readonly CombatExperienceStoryExchange[];
  debug: readonly DebugFeedEntry[];
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
  const rollDetail = `${formatAttackRollArithmetic(result.d20, result.total)} · ${verdict}`;
  return (
    <article className={`${styles.storyEntry} ${styles.storyResult}`}>
      <span>
        {result.reaction ? `${result.reaction} · ` : ''}
        {result.actor} · {result.action}
      </span>
      <strong>
        {result.hit
          ? `${result.actor} strikes ${result.target}`
          : `${result.target} evades ${result.actor}`}
      </strong>
      <p>{rollDetail}</p>
      {result.modifierSources && result.modifierSources.length > 0 && (
        <ul
          className={styles.attackModifierSources}
          aria-label="Attack roll influences"
        >
          {result.modifierSources.map((source, index) => (
            <li
              key={`${source.kind}:${source.sourceRef}:${source.sourceMemberId ?? ''}:${index}`}
              data-source-ref={source.sourceRef}
              data-influence={source.kind}
            >
              <span>
                {source.kind === 'advantage' ? 'Advantage' : 'Disadvantage'}
              </span>
              <strong>{formatAttackModifierSource(source)}</strong>
            </li>
          ))}
        </ul>
      )}
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
  const [collapsed, setCollapsed] = useState(false);
  const [jsonWide, setJsonWide] = useState(false);
  const wideDebug = visibleMode === 'debug' && jsonWide && !collapsed;
  const savedScrollTop = useRef<number | undefined>(undefined);
  const feedId = useId();
  const expandButton = useRef<HTMLButtonElement>(null);
  const collapseButton = useRef<HTMLButtonElement>(null);
  const focusAfterToggle = useRef(false);

  useLayoutEffect(() => {
    if (focusAfterToggle.current) {
      (collapsed ? expandButton : collapseButton).current?.focus();
      focusAfterToggle.current = false;
    }
    const el = scrollRef.current;
    if (!el || collapsed) return;
    if (savedScrollTop.current !== undefined) {
      el.scrollTop = savedScrollTop.current;
      savedScrollTop.current = undefined;
      setPinnedToBottom(
        !isScrolledAwayFromBottom(
          el.scrollTop,
          el.scrollHeight,
          el.clientHeight
        )
      );
      return;
    }
    if (pinnedToBottom) el.scrollTop = el.scrollHeight;
  }, [
    story.length,
    result,
    debug.length,
    visibleMode,
    pinnedToBottom,
    collapsed,
  ]);

  const handleScroll = () => {
    if (collapsed) return;
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
      className={`${styles.storyLog} ${collapsed ? styles.storyLogCollapsed : ''} ${wideDebug ? styles.storyLogWide : ''}`}
      aria-label="Story log"
    >
      <button
        type="button"
        className={styles.logTab}
        hidden={!collapsed}
        aria-label="Expand combat log"
        ref={expandButton}
        aria-expanded={false}
        aria-controls={feedId}
        onClick={() => {
          focusAfterToggle.current = true;
          setCollapsed(false);
        }}
      >
        ◀ Log
      </button>
      <header hidden={collapsed}>
        <div>
          <span className={styles.panelEyebrow}>
            {visibleMode === 'story' ? 'Encounter story' : 'Developer stream'}
          </span>
          <strong>
            {visibleMode === 'story' ? 'What happened' : 'Every wire fact'}
          </strong>
        </div>
        <div className={styles.logHeaderActions}>
          {visibleMode === 'debug' && (
            <button
              type="button"
              aria-label={jsonWide ? 'Narrow debug panel' : 'Widen debug panel'}
              aria-pressed={jsonWide}
              onClick={() => setJsonWide((wide) => !wide)}
            >
              {jsonWide ? 'Narrow' : 'Widen'}
            </button>
          )}
          <span
            className={`${styles.liveBadge} ${streamState !== 'live' ? styles.caughtUpBadge : ''}`}
          >
            {streamLabel}
          </span>
          <button
            type="button"
            aria-label="Collapse combat log"
            ref={collapseButton}
            aria-expanded={true}
            aria-controls={feedId}
            onClick={() => {
              savedScrollTop.current = scrollRef.current?.scrollTop;
              focusAfterToggle.current = true;
              setCollapsed(true);
            }}
          >
            ▶
          </button>
        </div>
      </header>

      {visibleMode === 'story' ? (
        <div
          ref={scrollRef}
          data-testid="session-combat-log-scroll"
          onScroll={handleScroll}
          className={styles.storyEntries}
          id={feedId}
          hidden={collapsed}
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
          id={feedId}
          hidden={collapsed}
          aria-label="Raw debug feed"
          aria-live="off"
        >
          {debug.map((entry, index) =>
            typeof entry === 'string' ? (
              <div
                className={styles.debugDiagnostic}
                key={`diagnostic-${index}-${entry}`}
              >
                {entry}
              </div>
            ) : (
              <DebugEventRow
                key={entry.id}
                entry={entry}
                onInspect={() => setPinnedToBottom(false)}
                onWiden={() => setJsonWide(true)}
              />
            )
          )}
        </div>
      )}

      {debugEnabled && (
        <footer hidden={collapsed}>
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
