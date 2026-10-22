import { isScrolledAwayFromBottom } from '@/components/game/combatLogScroll';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { RecordFeedSnapshot } from '../recordFeed';
import {
  formatAttackModifierSource,
  formatAttackRollArithmetic,
} from './attackArithmetic';
import styles from './CombatExperience.module.css';
import { partyName } from './describeAct';
import { isCombatDebugEnabled } from './diagnostics';
import { foldLogRows, type LogRow } from './foldLogRows';
import { ActForm } from './forms/ActForm';
import { FormShell } from './forms/FormShell';
import { JustHappenedPreview } from './JustHappenedPreview';
import { RecentActs } from './RecentActs';
import { RecordPanel } from './RecordPanel';
import { StoryLogModeSwitch } from './StoryLogModeSwitch';
import type {
  CombatExperienceAttackOutcome,
  CombatExperienceLogMode,
  CombatExperienceStoryExchange,
  CombatExperienceStreamState,
} from './types';

export interface StoryLogProps {
  story: readonly CombatExperienceStoryExchange[];
  /**
   * The session record (rpg-project#628): what debug mode shows (event-stream
   * R14). A log with no record, such as a Concept's, says so in debug mode.
   */
  record?: RecordFeedSnapshot;
  /** Told whether the record panel is showing: Debug mode, log expanded. */
  onRecordShownChange?: (shown: boolean) => void;
  mode: CombatExperienceLogMode;
  streamState: CombatExperienceStreamState;
  onModeChange: (mode: CombatExperienceLogMode) => void;
  result?: CombatExperienceAttackOutcome;
  /** Explicit diagnostic surface (for example the Concepts contract view). */
  diagnosticsEnabled?: boolean;
  /** Responsive default until the player's first explicit expand/collapse choice. */
  initialCollapsed?: boolean;
  /** Avoid duplicate speech when the same released rows have a live notice surface. */
  announceUpdates?: boolean;
  /** Desktop HUD: recent released outcomes open the same history/debug reader. */
  compactPreview?: boolean;
}

function StoryEntry({ entry }: { entry: CombatExperienceStoryExchange }) {
  return (
    <article
      className={`${styles.storyEntry} ${styles[`story_${entry.tone}`]}${entry.nested ? ` ${styles.storyNested}` : ''}`}
      data-act={entry.group}
      data-nested={entry.nested ? 'true' : undefined}
      data-story-id={entry.id}
    >
      {entry.act && entry.describeContext ? (
        <ActForm act={entry.act} size="log" context={entry.describeContext} />
      ) : (
        // A row built without an act (a Concept fixture): the same shell.
        <FormShell
          size="log"
          kind="story"
          lines={{
            eyebrow: entry.eyebrow,
            headline: entry.headline,
            outcome: entry.detail || undefined,
            breakdown: entry.rollBreakdown,
          }}
        />
      )}
    </article>
  );
}

/**
 * One creature's out-of-combat walks, folded (R35): "Gate Guard walked 14
 * cells", expanding to the walks themselves.
 */
function WalkFoldEntry({ row }: { row: Extract<LogRow, { kind: 'walks' }> }) {
  const [open, setOpen] = useState(false);
  const first = row.walks[0]!;
  const act = first.act;
  const mover =
    act?.body.case === 'walk' && first.describeContext
      ? partyName(act.body.value.mover, first.describeContext)
      : row.mover;
  const regionId = useId();
  return (
    <article
      className={`${styles.storyEntry} ${styles.story_neutral} ${styles.walkFold}`}
      data-story-id={row.id}
      data-fold-ids={row.walks.map((walk) => walk.id).join(' ')}
      data-testid="story-walk-fold"
    >
      <span>Move</span>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((value) => !value)}
      >
        <strong>
          {mover} walked {row.cells} {row.cells === 1 ? 'cell' : 'cells'}
        </strong>
      </button>
      {open && (
        <ol id={regionId}>
          {row.walks.map((walk) => (
            <li key={walk.id}>
              <StoryEntry entry={walk} />
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function ResultEntry({ result }: { result: CombatExperienceAttackOutcome }) {
  const verdict = result.critical
    ? 'Critical hit'
    : result.hit
      ? 'Hit'
      : 'Miss';
  const rollDetail = `${result.rollArithmetic ?? formatAttackRollArithmetic(result.d20, result.total)} · ${verdict}`;
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
  record,
  onRecordShownChange,
  mode,
  streamState,
  onModeChange,
  result,
  diagnosticsEnabled = false,
  initialCollapsed = false,
  announceUpdates = true,
  compactPreview = false,
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
  const rows = useMemo(() => foldLogRows(story), [story]);
  const [recentShown, setRecentShown] = useState(false);
  // The recent panel's click: scroll the log to that act's row, or to the
  // folded walk row that holds it.
  const scrollToRow = useCallback((id: string): void => {
    const el = scrollRef.current;
    if (!el) return;
    const target = Array.from(
      el.querySelectorAll<HTMLElement>('[data-story-id]')
    ).find(
      (row) =>
        row.dataset.storyId === id ||
        (row.dataset.foldIds ?? '').split(' ').includes(id)
    );
    if (!target) return;
    setPinnedToBottom(false);
    target.scrollIntoView?.({ block: 'nearest' });
  }, []);
  const [collapsedChoice, setCollapsed] = useState<boolean | null>(null);
  // Container measurement may enable desktop after mount. Follow its default
  // until the player chooses; subsequent resize never overrides that choice.
  const collapsed = collapsedChoice ?? initialCollapsed;
  const [jsonWide, setJsonWide] = useState(false);
  const wideDebug = visibleMode === 'debug' && jsonWide && !collapsed;
  const savedScrollTop = useRef<number | undefined>(undefined);
  const feedId = useId();
  const expandButton = useRef<HTMLButtonElement>(null);
  const collapseButton = useRef<HTMLButtonElement>(null);
  const focusAfterToggle = useRef(false);
  const pendingStoryId = useRef<string | null>(null);
  const openHistory = (id?: string): void => {
    if (compactPreview) {
      onModeChange('story');
      savedScrollTop.current = undefined;
      setPinnedToBottom(true);
    }
    pendingStoryId.current = id ?? null;
    focusAfterToggle.current = true;
    setCollapsed(false);
  };
  const closeHistory = (): void => {
    savedScrollTop.current = scrollRef.current?.scrollTop;
    focusAfterToggle.current = true;
    setCollapsed(true);
  };

  useLayoutEffect(() => {
    if (focusAfterToggle.current) {
      (collapsed ? expandButton : collapseButton).current?.focus();
      focusAfterToggle.current = false;
    }
    const el = scrollRef.current;
    if (!el || collapsed) return;
    if (pendingStoryId.current && visibleMode === 'story') {
      scrollToRow(pendingStoryId.current);
      pendingStoryId.current = null;
      return;
    }
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
    record?.rows.length,
    visibleMode,
    pinnedToBottom,
    collapsed,
    scrollToRow,
  ]);

  // THE RECORD STREAMS ONLY WHILE IT IS SHOWN: Debug visible and the log
  // expanded. A collapsed log on Debug shows nothing, so it holds no stream;
  // expanding resumes after the last id held.
  const recordShown = visibleMode === 'debug' && !collapsed;
  useEffect(() => {
    onRecordShownChange?.(recordShown);
    // An unmounted log shows nothing: say so, or the stream outlives it.
    return () => onRecordShownChange?.(false);
  }, [recordShown, onRecordShownChange]);

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
      className={`${styles.storyLog} ${collapsed ? styles.storyLogCollapsed : ''} ${wideDebug ? styles.storyLogWide : ''} ${compactPreview ? styles.hudStoryLog : ''}`}
      aria-label="Story log"
      onKeyDown={(event) => {
        if (compactPreview && !collapsed && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeHistory();
        }
      }}
    >
      <button
        type="button"
        className={styles.logTab}
        hidden={!collapsed}
        aria-label={compactPreview ? 'Just happened' : 'Expand combat log'}
        ref={expandButton}
        aria-expanded={false}
        aria-controls={feedId}
        onClick={() => openHistory()}
      >
        {compactPreview ? 'Just happened ›' : '◀ Log'}
      </button>
      {compactPreview && collapsed && (
        <JustHappenedPreview story={story} onSelect={openHistory} />
      )}
      <header hidden={collapsed}>
        <div>
          <span className={styles.panelEyebrow}>
            {compactPreview
              ? 'Encounter history'
              : visibleMode === 'story'
                ? 'Encounter story'
                : 'Developer stream'}
          </span>
          <strong>
            {visibleMode === 'story' ? 'What happened' : 'The record'}
          </strong>
        </div>
        <div className={styles.logHeaderActions}>
          {visibleMode === 'story' && (
            <button
              type="button"
              aria-label={recentShown ? 'Hide recent acts' : 'Show recent acts'}
              aria-pressed={recentShown}
              onClick={() => setRecentShown((shown) => !shown)}
            >
              Recent
            </button>
          )}
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
            onClick={closeHistory}
          >
            {compactPreview ? '×' : '▶'}
          </button>
        </div>
      </header>

      {compactPreview && (
        <StoryLogModeSwitch
          hud
          debugEnabled={debugEnabled}
          mode={visibleMode}
          onModeChange={onModeChange}
          panelId={feedId}
          hidden={collapsed}
        />
      )}
      {visibleMode === 'story' && recentShown && !collapsed && (
        <RecentActs story={story} onSelect={scrollToRow} />
      )}
      {visibleMode === 'story' ? (
        <div
          ref={scrollRef}
          data-testid="session-combat-log-scroll"
          onScroll={handleScroll}
          className={styles.storyEntries}
          id={feedId}
          hidden={collapsed}
          role={compactPreview ? 'tabpanel' : 'log'}
          aria-labelledby={compactPreview ? `${feedId}-story-tab` : undefined}
          aria-live={announceUpdates ? 'polite' : 'off'}
          aria-relevant="additions"
        >
          {rows.map((row) =>
            row.kind === 'walks' ? (
              <WalkFoldEntry key={row.id} row={row} />
            ) : result?.attackId === row.entry.id ? (
              <ResultEntry key={row.entry.id} result={result} />
            ) : (
              <StoryEntry key={row.entry.id} entry={row.entry} />
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
          aria-label={compactPreview ? undefined : 'Raw debug feed'}
          role={compactPreview ? 'tabpanel' : undefined}
          aria-labelledby={compactPreview ? `${feedId}-debug-tab` : undefined}
          aria-live="off"
        >
          {record ? (
            <RecordPanel feed={record} />
          ) : (
            <div className={styles.debugDiagnostic}>
              No session record for this view.
            </div>
          )}
        </div>
      )}

      {!compactPreview && (
        <StoryLogModeSwitch
          hud={false}
          debugEnabled={debugEnabled}
          mode={visibleMode}
          onModeChange={onModeChange}
          panelId={feedId}
          hidden={collapsed}
        />
      )}
    </aside>
  );
}
