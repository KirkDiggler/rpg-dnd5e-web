/**
 * EncounterDock — the thin bottom action bar that replaces the vertical
 * CombatLog/EconomyBar/ActionMenu/ReactionReadyPanel/EndTurn stack that used
 * to compete with EncounterMap for vertical space (rpg-dnd5e-web#491: "map
 * is fixed-size, panels eat the room").
 *
 * 3-column shape adapted from the pre-clean-slate ActionPanelV2 (deleted at
 * 466d831/#448) — identity/status (left) | actions (center) | combat log
 * (right) — rebuilt on today's v1alpha2 stream data and existing components
 * (StatusBadgeList, EconomyBar, ActionMenu, ReactionReadyPanel, CombatLog),
 * not resurrecting the old component's code.
 *
 * All data is server-given and rendered verbatim: HP/AC/economy/actions all
 * flow from useEncounterState exactly as EncounterView already read them for
 * the old stacked layout — this only changes WHERE they render, not what.
 */

import type {
  ActionEconomy,
  AvailableAction,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import type { CombatLogEntry } from '../../hooks/useCombatLog';
import type { EntityStatus } from '../../hooks/useEncounterState';
import { ActionMenu } from '../playtest/ActionMenu';
import { EconomyBar } from '../playtest/EconomyBar';
import { StatusBadgeList } from '../ui/StatusBadgeList';
import { CombatLog } from './CombatLog';
import { classLabel, hpTier, resolveName } from './encounterDockHelpers';
import { ReactionReadyPanel } from './ReactionReadyPanel';

const HP_TIER_COLOR: Record<'high' | 'mid' | 'low', string> = {
  high: '#22c55e',
  mid: '#eab308',
  low: '#ef4444',
};

export interface EncounterDockProps {
  /** The local player's entity id — the resolveName fallback when displayName is absent. */
  entityId: string;
  displayName: string | undefined;
  classRefId: string | undefined;
  hp: { current: number; max: number } | undefined;
  ac: number | undefined;
  statuses: EntityStatus[];
  economy: ActionEconomy | null | undefined;
  actions: AvailableAction[];
  actionsEnabled: boolean;
  actionsLoading: boolean;
  onSelectAction: (action: AvailableAction) => void;
  reactionReadiness: Map<string, boolean> | undefined;
  reactionLoading: boolean;
  reactionDisabled: boolean;
  onToggleReaction: (
    reactionRef: { module: string; type: string; id: string },
    ready: boolean
  ) => void;
  onEndTurn: () => void;
  endTurnDisabled: boolean;
  endTurnLoading: boolean;
  combatLogEntries: CombatLogEntry[];
}

// Copilot review #493: CombatLog's own header (~25px) plus its internal
// scroll region's maxHeight:200 (CombatLog.tsx) sum to ~237px — sized so
// CombatLog's natural height fits without needing to clip it.
//
// rpg-dnd5e-web#494: at desktop width this is a per-column height cap
// (each column scrolls internally past this, never spills past its own
// box). Below ~604px (identity 220 + log 320 + 2×16 gaps + 32 padding),
// the columns wrap via flexWrap below instead of overflowing horizontally
// — COLUMN_MAX_HEIGHT then caps each wrapped row too, so a fully-stacked
// narrow layout is still bounded (3 rows × ~230px, scrollable per column)
// rather than growing unbounded and pushing the map off-screen.
const COLUMN_MAX_HEIGHT = 230;

export function EncounterDock({
  entityId,
  displayName,
  classRefId,
  hp,
  ac,
  statuses,
  economy,
  actions,
  actionsEnabled,
  actionsLoading,
  onSelectAction,
  reactionReadiness,
  reactionLoading,
  reactionDisabled,
  onToggleReaction,
  onEndTurn,
  endTurnDisabled,
  endTurnLoading,
  combatLogEntries,
}: EncounterDockProps) {
  const tier = hp ? hpTier(hp.current, hp.max) : 'low';
  const hpPct =
    hp && hp.max > 0
      ? Math.max(0, Math.min(100, (hp.current / hp.max) * 100))
      : 0;
  const label = classLabel(classRefId);
  const name = resolveName(displayName, entityId);

  return (
    <div
      data-testid="encounter-dock"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        // Desktop-width floor (matches the old fixed height exactly when
        // all 3 columns fit on one row); grows via flexWrap below when
        // columns stack on narrow viewports instead of clipping them.
        minHeight: COLUMN_MAX_HEIGHT + 30,
        flexShrink: 0,
        padding: '10px 16px',
        background: 'var(--bg-secondary, #1a1a1a)',
        borderTop: '2px solid var(--border-primary, #333)',
        boxShadow: '0 -8px 25px -5px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Left: identity / status block. flex:'0 1 220px' keeps the exact
          220px desktop width (grow:0 — never wider than that even with
          spare row space) while allowing it to shrink down to minWidth
          before wrapping to its own row on narrow viewports (#494). */}
      <div
        data-testid="encounter-dock-identity"
        style={{
          flex: '0 1 220px',
          minWidth: 160,
          maxHeight: COLUMN_MAX_HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: 15,
              color: 'var(--text-primary, #fff)',
            }}
          >
            {name}
          </span>
          {label && (
            <span style={{ fontSize: 12, color: 'var(--text-muted, #888)' }}>
              {label}
            </span>
          )}
        </div>

        {hp && (
          <div>
            <div
              style={{
                height: 8,
                borderRadius: 4,
                background: 'rgba(255,255,255,0.1)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${hpPct}%`,
                  background: HP_TIER_COLOR[tier],
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-muted, #888)',
                marginTop: 2,
              }}
            >
              HP {hp.current}/{hp.max}
              {ac !== undefined ? ` · AC ${ac}` : ''}
            </div>
          </div>
        )}
        {!hp && ac !== undefined && (
          <div style={{ fontSize: 11, color: 'var(--text-muted, #888)' }}>
            AC {ac}
          </div>
        )}

        {statuses.length > 0 && <StatusBadgeList statuses={statuses} />}
      </div>

      {/* Center: economy + actions + reactions + end turn. #494: minWidth
          was 0 — the literal cause of this column collapsing to nothing
          below ~604px while identity/log (flexShrink:0) held their full
          width and overflowed. A real floor (220) means IT wraps to its
          own row instead of vanishing once the row can't fit everyone. */}
      <div
        data-testid="encounter-dock-actions"
        style={{
          flex: '1 1 300px',
          minWidth: 220,
          maxHeight: COLUMN_MAX_HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          overflowY: 'auto',
        }}
      >
        <EconomyBar economy={economy} />
        <ActionMenu
          actions={actions}
          enabled={actionsEnabled}
          loading={actionsLoading}
          onSelectAction={onSelectAction}
        />
        <ReactionReadyPanel
          readiness={reactionReadiness}
          loading={reactionLoading}
          disabled={reactionDisabled}
          onToggle={onToggleReaction}
        />
        <div>
          <button onClick={onEndTurn} disabled={endTurnDisabled}>
            {endTurnLoading ? 'Ending…' : 'End turn'}
          </button>
        </div>
      </div>

      {/* Right: combat log. maxHeight + overflow:'hidden' clips CombatLog
          to this column's own budget regardless of its natural content
          height — it already scrolls internally (CombatLog.tsx's
          overflowY:'auto' region), so this only affects how many lines
          are visible before scrolling, never spill past the dock.
          flex:'0 1 320px' matches identity's shrink-then-wrap behavior
          (#494) instead of the old flexShrink:0 that held its full width
          and pushed the row past the viewport on narrow screens. */}
      <div
        data-testid="encounter-dock-log"
        style={{
          flex: '0 1 320px',
          minWidth: 220,
          maxHeight: COLUMN_MAX_HEIGHT,
          overflow: 'hidden',
        }}
      >
        <CombatLog entries={combatLogEntries} />
      </div>
    </div>
  );
}
