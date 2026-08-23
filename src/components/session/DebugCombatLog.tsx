/**
 * DebugCombatLog — the persistent, scrollable stream-event feed on the
 * 3D route (rpg-dnd5e-web#740, rescoped 2026-08-23). Debug is the
 * default while pre-alpha: one line per stream event, in ARRIVAL order,
 * every raw fact `debugLogLine.ts`'s `formatDebugLine` carries — the
 * primary development lens for verifying the stream is whole (rule 6,
 * #779), not a polish feature.
 *
 * # Two modes, not two components
 *
 * `Story` mode is deliberately NOT a second rendering of the event
 * stream — it's `today's beat line`, i.e. exactly the same
 * `combatBeat.ts`-derived sentence `CombatPanel`'s own beat line already
 * shows (`storyLine` prop, straight from `combatPanel.selection.lastBeat`
 * — see `SessionEncounterView`'s own call site). Kirk's original ruling
 * (rpg-project#202 design §4a, 2026-08-09): "the debug view is the view
 * we focus on... the in-fiction voice... stays; it simply becomes the
 * polish layer that already exists." This component's job in Story mode
 * is narrow on purpose — collapse the verbose feed down to what already
 * existed before this issue, not build a second narration system.
 *
 * # Persisted, bounded, copyable
 *
 * The mode toggle persists across mounts (`localStorage`, lazy-init —
 * same idiom `useTheme.ts` uses), defaulting to `'debug'`. `events` is
 * the CALLER's bounded ring buffer (`SessionEncounterView` caps it at
 * 500 — this component only ever renders what it's given, never trims
 * its own copy, keeping "what's the bound" answerable in exactly one
 * place). The feed itself is monospace and plain `<div>` text (no
 * `user-select: none` anywhere in this tree) so a triple-click or
 * select-all copies the raw lines verbatim — issue #740's "select-all
 * copyable."
 *
 * # Auto-scroll, without fighting a reader who scrolled up
 *
 * Sticks to the bottom on every new line UNLESS the reader has
 * scrolled away from it — the same "don't yank the viewport out from
 * under someone reading history" rule most chat/log UIs follow. Checked
 * BEFORE the new line renders (a `useLayoutEffect` reading
 * `scrollHeight`/`scrollTop`/`clientHeight` pre-paint), not derived from
 * event count, so a reader mid-scroll during a fast burst never gets
 * dragged back down.
 */
import type { Event } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { useLayoutEffect, useRef, useState } from 'react';
import { formatDebugLine } from './debugLogLine';
import type { SessionStreamState } from './useSessionEventStream';

const MODE_STORAGE_KEY = 'rpg-dnd5e-combat-log-mode';

type LogMode = 'debug' | 'story';

function loadStoredMode(): LogMode {
  if (typeof localStorage === 'undefined') return 'debug';
  const stored = localStorage.getItem(MODE_STORAGE_KEY);
  return stored === 'story' ? 'story' : 'debug';
}

const STREAM_STATE_LABEL: Record<SessionStreamState, string> = {
  live: 'live',
  reconnecting: 'reconnecting…',
  resyncing: 'resyncing…',
};

export interface DebugCombatLogProps {
  /** The caller's own bounded buffer, oldest first — see module doc
   * comment on why this component never trims its own copy. */
  events: readonly Event[];
  streamState: SessionStreamState;
  /** `member id -> display name` — the same lookup `combatBeat.ts` and
   * `useCombatPanel.ts` build (`participantNameMap` + sighted-member
   * fallback). */
  names: Map<string, string>;
  /** `combatPanel.selection.lastBeat` when in a turn, `null` in free
   * roam — Story mode's entire content. */
  storyLine: string | null;
}

export function DebugCombatLog({
  events,
  streamState,
  names,
  storyLine,
}: DebugCombatLogProps) {
  const [mode, setMode] = useState<LogMode>(loadStoredMode);

  const setModePersisted = (next: LogMode) => {
    setMode(next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MODE_STORAGE_KEY, next);
    }
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || mode !== 'debug') return;
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events, mode]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // A few pixels of slack — a reader who scrolled to exactly the
    // bottom (or close enough) still counts as "following," not
    // "reading history."
    stickToBottomRef.current = distanceFromBottom < 24;
  };

  return (
    <div
      data-testid="debug-combat-log"
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        bottom: 12,
        width: 420,
        maxWidth: '40vw',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-secondary, rgba(0, 0, 0, 0.72))',
        border: '1px solid var(--border-primary, rgba(255, 255, 255, 0.12))',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 10px',
          borderBottom:
            '1px solid var(--border-primary, rgba(255, 255, 255, 0.12))',
          fontSize: 12,
          color: 'var(--text-secondary, #aaa)',
        }}
      >
        <span data-testid="debug-combat-log-stream-state">
          Combat log —{' '}
          <span
            style={
              streamState !== 'live'
                ? { color: 'var(--color-warning, #fbbf24)' }
                : undefined
            }
          >
            {STREAM_STATE_LABEL[streamState]}
          </span>
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            data-testid="debug-combat-log-mode-debug"
            onClick={() => setModePersisted('debug')}
            aria-pressed={mode === 'debug'}
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              border: '1px solid var(--border-primary, rgba(255,255,255,0.2))',
              background:
                mode === 'debug'
                  ? 'var(--accent-primary, #facc15)'
                  : 'transparent',
              color:
                mode === 'debug'
                  ? 'var(--bg-primary, #0a0a0a)'
                  : 'var(--text-secondary, #aaa)',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            Debug
          </button>
          <button
            type="button"
            data-testid="debug-combat-log-mode-story"
            onClick={() => setModePersisted('story')}
            aria-pressed={mode === 'story'}
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              border: '1px solid var(--border-primary, rgba(255,255,255,0.2))',
              background:
                mode === 'story'
                  ? 'var(--accent-primary, #facc15)'
                  : 'transparent',
              color:
                mode === 'story'
                  ? 'var(--bg-primary, #0a0a0a)'
                  : 'var(--text-secondary, #aaa)',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            Story
          </button>
        </div>
      </div>
      {mode === 'debug' ? (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          data-testid="debug-combat-log-feed"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '8px 10px',
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 11,
            lineHeight: 1.5,
            color: 'var(--text-primary, #e5e7eb)',
            userSelect: 'text',
          }}
        >
          {events.length === 0 ? (
            <div style={{ color: 'var(--text-secondary, #aaa)' }}>
              No events yet.
            </div>
          ) : (
            events.map((event) => {
              const line = formatDebugLine(event, names);
              return (
                <div
                  key={`${line.seq}`}
                  data-testid="debug-combat-log-line"
                  title={line.ids.length > 0 ? line.ids.join(', ') : undefined}
                  style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                >
                  {line.text}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div
          data-testid="debug-combat-log-story"
          style={{
            flex: 1,
            minHeight: 0,
            padding: '8px 10px',
            fontSize: 13,
            color: 'var(--text-primary, #e5e7eb)',
          }}
        >
          {storyLine ?? (
            <span style={{ color: 'var(--text-secondary, #aaa)' }}>
              Nothing has happened yet.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
