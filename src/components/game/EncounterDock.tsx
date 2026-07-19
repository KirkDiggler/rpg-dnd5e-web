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
import { ReactionReadyPanel } from './ReactionReadyPanel';

/** Capitalizes a class_ref id ("fighter" -> "Fighter") — display formatting
 * only, not a class->label lookup table the toolkit doesn't give us. */
function classLabel(classRefId: string | undefined): string | null {
  if (!classRefId) return null;
  return classRefId.charAt(0).toUpperCase() + classRefId.slice(1);
}

/** HP tier for the bar's color — pure display bucketing off server-given
 * current/max, same category as EconomyBar's spent/unspent tint. */
function hpTier(current: number, max: number): 'high' | 'mid' | 'low' {
  if (max <= 0) return 'low';
  const pct = current / max;
  if (pct > 0.5) return 'high';
  if (pct > 0.25) return 'mid';
  return 'low';
}

const HP_TIER_COLOR: Record<'high' | 'mid' | 'low', string> = {
  high: '#22c55e',
  mid: '#eab308',
  low: '#ef4444',
};

export interface EncounterDockProps {
  name: string;
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
// scroll region's maxHeight:200 (CombatLog.tsx) sum to ~237px, more than
// the ~204px of content height the original DOCK_HEIGHT(224) - padding
// left for it — long logs could spill past the dock into the map. Sized
// up so CombatLog's natural height fits without needing to clip it, plus
// `overflow: hidden` below as a hard guarantee against any future column
// growing taller than its row (e.g. a very long class-name wrap).
const DOCK_HEIGHT = 260;

export function EncounterDock({
  name,
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

  return (
    <div
      data-testid="encounter-dock"
      style={{
        display: 'flex',
        gap: 16,
        height: DOCK_HEIGHT,
        flexShrink: 0,
        padding: '10px 16px',
        background: 'var(--bg-secondary, #1a1a1a)',
        borderTop: '2px solid var(--border-primary, #333)',
        boxShadow: '0 -8px 25px -5px rgba(0, 0, 0, 0.3)',
        overflow: 'hidden',
      }}
    >
      {/* Left: identity / status block */}
      <div
        data-testid="encounter-dock-identity"
        style={{
          width: 220,
          flexShrink: 0,
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

      {/* Center: economy + actions + reactions + end turn */}
      <div
        data-testid="encounter-dock-actions"
        style={{
          flex: 1,
          minWidth: 0,
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

      {/* Right: combat log. height:'100%' + overflow:'hidden' clips
          CombatLog to the row's actual height regardless of its own
          content — it already scrolls internally (CombatLog.tsx's
          overflowY:'auto' region), so this only affects how many lines
          are visible before scrolling, never spill past the dock. */}
      <div
        data-testid="encounter-dock-log"
        style={{
          width: 320,
          flexShrink: 0,
          height: '100%',
          overflow: 'hidden',
        }}
      >
        <CombatLog entries={combatLogEntries} />
      </div>
    </div>
  );
}
