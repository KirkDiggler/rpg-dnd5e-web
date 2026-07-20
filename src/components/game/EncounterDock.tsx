/**
 * EncounterDock — the thin bottom action bar (rpg-dnd5e-web#491: "map is
 * fixed-size, panels eat the room").
 *
 * rpg-dnd5e-web#519: Discord's activity viewport is short — much shorter
 * than the desktop-sized windows this dock was originally measured against
 * (#493/#496). Kirk's direction: MAX map, THIN action line. This redesigns
 * the dock from 3 columns that each reserved up to COLUMN_MAX_HEIGHT of
 * stacked content (EconomyBar row + ActionMenu's per-slot grouped rows +
 * ReactionReadyPanel's two-line buttons + an End Turn row, all stacked
 * vertically inside the "actions" column alone) down to ONE flex row:
 * a slim identity strip, a compact single-row action strip (ActionMenu/
 * EconomyBar/ReactionReadyPanel all switched into their new `compact` mode
 * — see those components), and a combat-log TOGGLE instead of an
 * always-reserved third column. The log itself renders as a floating
 * overlay (position:absolute, anchored above the dock) only while open, so
 * a closed log costs zero layout height — matching "anything tall becomes
 * collapsible/overlaid instead of reserving layout height."
 *
 * Two nested containers, not one: the OUTER div is the `position: relative`
 * anchor for the overlay and has no overflow rule of its own. The INNER
 * `-row` div carries `maxHeight` + `overflowY: auto` (the wrapping-content
 * safety net). Setting overflow-y non-`visible` on an element forces both
 * axes to clip per the CSS spec — so if the overlay were a child of the
 * SAME element that scrolls, it would clip itself into invisibility (caught
 * live during #519 verification: the overlay rendered in the DOM with
 * correct content but 0 visible pixels, because it lived inside the
 * scrolling row and `bottom: 100%` placed it entirely outside that row's
 * own clipped box). Keeping the overlay as a sibling of the scrolling row,
 * both inside the non-clipping outer anchor, avoids that trap.
 *
 * All data is still server-given and rendered verbatim — this only changes
 * the layout, never what's shown or computed.
 */

import type {
  ActionEconomy,
  AvailableAction,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useState } from 'react';
import type { CombatLogEntry } from '../../hooks/useCombatLog';
import type { EntityStatus } from '../../hooks/useEncounterState';
import { getActionIconUrl } from '../../utils/actionIcons';
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
  /** rpg-dnd5e-web#511 — actionKey of the currently-armed action, or
   * undefined when nothing is armed. Passed straight through to ActionMenu. */
  armedActionKey?: string;
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

// rpg-dnd5e-web#519: safety-net cap, not the primary height control anymore
// — the single-row compact layout below is sized by its content (typically
// one ~32-40px row), this just bounds the worst case (many wrapped rows on
// an extremely narrow AND short viewport) so the dock can never eat more
// than a small slice of a short Discord activity viewport. Down from #496's
// 42vh (measured against a tall desktop window, not Discord's actual
// embedded height) now that the combat log no longer reserves a column.
const DOCK_MAX_HEIGHT_VH = '16vh';

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
  armedActionKey,
  reactionReadiness,
  reactionLoading,
  reactionDisabled,
  onToggleReaction,
  onEndTurn,
  endTurnDisabled,
  endTurnLoading,
  combatLogEntries,
}: EncounterDockProps) {
  const [logOpen, setLogOpen] = useState(false);
  const tier = hp ? hpTier(hp.current, hp.max) : 'low';
  const hpPct =
    hp && hp.max > 0
      ? Math.max(0, Math.min(100, (hp.current / hp.max) * 100))
      : 0;
  const label = classLabel(classRefId);
  const name = resolveName(displayName, entityId);
  const endTurnIconUrl = getActionIconUrl('end-turn');

  return (
    <div
      data-testid="encounter-dock"
      style={{ position: 'relative', flexShrink: 0 }}
    >
      <div
        data-testid="encounter-dock-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          maxHeight: DOCK_MAX_HEIGHT_VH,
          overflowY: 'auto',
          padding: '6px 12px',
          background: 'var(--bg-secondary, #1a1a1a)',
          borderTop: '2px solid var(--border-primary, #333)',
          boxShadow: '0 -8px 25px -5px rgba(0, 0, 0, 0.3)',
        }}
      >
        {/* Identity strip — name, class, inline HP bar + text, AC, status
          badges, all on one line. No separate progress-bar row. */}
        <div
          data-testid="encounter-dock-identity"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontWeight: 700,
              fontSize: 13,
              color: 'var(--text-primary, #fff)',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </span>
          {label && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-muted, #888)',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </span>
          )}

          {hp && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 40,
                  height: 6,
                  borderRadius: 3,
                  background: 'rgba(255,255,255,0.1)',
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${hpPct}%`,
                    background: HP_TIER_COLOR[tier],
                    transition: 'width 0.2s ease',
                  }}
                />
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted, #888)',
                  whiteSpace: 'nowrap',
                }}
              >
                {hp.current}/{hp.max}
                {ac !== undefined ? ` · AC ${ac}` : ''}
              </span>
            </span>
          )}
          {!hp && ac !== undefined && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-muted, #888)',
                whiteSpace: 'nowrap',
              }}
            >
              AC {ac}
            </span>
          )}

          {statuses.length > 0 && <StatusBadgeList statuses={statuses} />}
        </div>

        {/* Actions strip — economy numbers, action buttons, reaction toggles,
          and End Turn all in ONE wrapping row via their new compact modes
          (falls back to wrapping only under real width pressure, never
          stacks vertically by design the way the old 3-column layout did). */}
        <div
          data-testid="encounter-dock-actions"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            flex: '1 1 240px',
            minWidth: 0,
          }}
        >
          <EconomyBar economy={economy} compact />
          <ActionMenu
            actions={actions}
            enabled={actionsEnabled}
            loading={actionsLoading}
            onSelectAction={onSelectAction}
            armedActionKey={armedActionKey}
            compact
          />
          <ReactionReadyPanel
            readiness={reactionReadiness}
            loading={reactionLoading}
            disabled={reactionDisabled}
            onToggle={onToggleReaction}
            compact
          />
          <button
            type="button"
            onClick={onEndTurn}
            disabled={endTurnDisabled}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              fontSize: 12,
            }}
          >
            {/* #497: static icon (this button isn't server-driven like
              ActionMenu's entries) — same getActionIconUrl lookup, so a
              missing/renamed asset falls back to text-only here too. */}
            {endTurnIconUrl && (
              <img
                src={endTurnIconUrl}
                alt=""
                aria-hidden="true"
                width={14}
                height={14}
                style={{ display: 'inline-block', flexShrink: 0 }}
              />
            )}
            {endTurnLoading ? 'Ending…' : 'End turn'}
          </button>
        </div>

        {/* Combat log toggle — replaces the always-reserved third column.
            Closed by default; costs zero layout height until opened, then
            floats above the dock instead of pushing the map up. */}
        <button
          type="button"
          data-testid="encounter-dock-log-toggle"
          onClick={() => setLogOpen((open) => !open)}
          aria-expanded={logOpen}
          aria-label={`Combat log, ${combatLogEntries.length} entries — ${logOpen ? 'hide' : 'show'}`}
          style={{
            flexShrink: 0,
            padding: '3px 10px',
            fontSize: 12,
            fontFamily: 'monospace',
            background: logOpen ? '#2a3a4a' : 'transparent',
            color: logOpen ? '#9cf' : 'var(--text-muted, #888)',
            border: '1px solid var(--border-primary, #333)',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          📜 {combatLogEntries.length}
        </button>
      </div>

      {/* Sibling of the scrolling row above, not a child of it — see the
          file-header comment on why the overlay can't live inside the
          overflow-clipped row. */}
      {logOpen && (
        <div
          data-testid="encounter-dock-log-overlay"
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 12,
            marginBottom: 8,
            width: 320,
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: 280,
            zIndex: 50,
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 -4px 20px -2px rgba(0, 0, 0, 0.5)',
          }}
        >
          <CombatLog entries={combatLogEntries} />
        </div>
      )}
    </div>
  );
}
