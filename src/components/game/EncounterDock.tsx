/**
 * EncounterDock — the live combat command bar, composed from the ui/combat
 * primitives (rpg-dnd5e-web#525 slice 1: the concept design from /concepts
 * "Combat Panel", composition B, on real stream data).
 *
 * Structure, left to right, per Kirk's action-point-pool model ("I have an
 * action point pool — what uses what point?"): a teaching strip that says
 * what the game is waiting for, then WHO (identity + promoted movement
 * readout), WHAT'S LEFT (economy pips), WHAT CAN I DO AND WHAT DOES EACH
 * COST (verbs with pool-shape cost badges from the server's economy_slot,
 * busy kits grouped by ref.type in the drop-up), End Turn as a calm commit
 * button, then the combat log and settings as summonable overlays.
 *
 * State rules encoded here (all server-given, never computed):
 * - Verbs, pips, and movement render only on YOUR turn in TURN_BASED.
 *   Spectators get the strip's "{name}'s turn — watch the map" instead of
 *   the old "(economy: waiting for the server)" placeholder (#458).
 * - Outside TURN_BASED nothing economy-shaped renders at all, so the
 *   FREE_ROAM interval between combat pockets can't show stale turn
 *   economy (#516).
 * - Reaction readiness is a SETTING, not a bar control (Kirk: "opportunity
 *   attack is just a setting, default always on") — but the SetReactionReady
 *   wire mechanism is real (the server holds per-reaction readiness;
 *   OA defaults on server-side for melee, Shield must be armed), so the
 *   ReactionReadyPanel moved into the settings gear popover rather than
 *   being deleted.
 */

import type {
  ActionEconomy,
  AvailableAction,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { EncounterMode } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useState } from 'react';
import type { CombatLogEntry } from '../../hooks/useCombatLog';
import type { EntityStatus } from '../../hooks/useEncounterState';
import { getActionIconUrl } from '../../utils/actionIcons';
import { actionKey } from '../playtest/actionMenuHelpers';
import { Button } from '../ui/Button';
import {
  DockShell,
  EconomyPips,
  organizeVerbs,
  OverlayPanel,
  OverlayToggle,
  VerbButton,
  verbCost,
} from '../ui/combat';
import { StatusBadgeList } from '../ui/StatusBadgeList';
import { CombatLog } from './CombatLog';
import {
  classLabel,
  hpTier,
  resolveMovementRemaining,
  resolveName,
} from './encounterDockHelpers';
import { ReactionReadyPanel } from './ReactionReadyPanel';

// HP tier = traffic-light semantic, NOT resource color: --health is a
// theme's HP-bar hue (dark-fantasy sets it deep red), so a full bar keyed
// to it rendered red. Dedicated --hp-* tokens (public/themes/base.css)
// default green/amber/red; the fallbacks keep the traffic-light even if the
// stylesheet is absent (Copilot review on #543).
const HP_TIER_COLOR: Record<'high' | 'mid' | 'low', string> = {
  high: 'var(--hp-high, #22c55e)',
  mid: 'var(--hp-mid, #eab308)',
  low: 'var(--hp-low, #ef4444)',
};

/** Which floating panel is open — at most one, so overlays never stack. */
type OpenPanel = 'menu' | 'settings' | 'log' | null;

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
  /** Server mode verbatim — gates every economy-shaped render (#516). */
  mode: EncounterMode;
  /** encounterStatus === 'ended' — suppresses the action surface and tells
   * the strip to stop claiming it's your turn (gate on an encounter that
   * ends ON your turn: mode stays TURN_BASED, activeEntityId stays you). */
  encounterEnded: boolean;
  /** TURN_BASED && activeEntityId === entityId, computed by EncounterView. */
  isMyTurn: boolean;
  /** Display name of the active entity when it isn't you — the spectator
   * strip's "{name}'s turn" (#458). Undefined outside TURN_BASED. */
  activeEntityName: string | undefined;
  actionsEnabled: boolean;
  actionsLoading: boolean;
  onSelectAction: (action: AvailableAction) => void;
  /** rpg-dnd5e-web#511/#514 — actionKey of the currently-armed action. */
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

/** The teaching strip's one job: answer "what is the game waiting for?"
 * in words, from the same server state the bar renders (#533 direction). */
function contextMessage(
  mode: EncounterMode,
  encounterEnded: boolean,
  isMyTurn: boolean,
  activeEntityName: string | undefined,
  armedLabel: string | undefined,
  noneUsable: boolean,
  canStillMove: boolean
): { text: string; tone: 'action' | 'info' | 'quiet' } {
  // Ended wins over everything: the encounter can end ON your turn (mode
  // stays TURN_BASED, activeEntityId stays you), and the strip must stop
  // saying "your turn." Not a victory/defeat screen (that's web#471) —
  // just an honest neutral line.
  if (encounterEnded) {
    return { text: 'The encounter has ended.', tone: 'quiet' };
  }
  // Armed guidance is turn-gated: on the handover frame armedLabel can
  // still be set for a paint before it clears (#544), so don't flash
  // "click a target" once it's no longer your turn.
  if (armedLabel && mode === EncounterMode.TURN_BASED && isMyTurn) {
    return {
      text: `${armedLabel} armed — click a target on the map. Esc or click again to cancel.`,
      tone: 'action',
    };
  }
  // Exploring copy is FREE_ROAM-specific — mode is UNSPECIFIED during the
  // initial connect/reconnect window, and loading straight into active
  // combat must not briefly read "Exploring."
  if (mode === EncounterMode.FREE_ROAM) {
    return {
      text: 'Exploring — click the map to move. Combat will start when enemies appear.',
      tone: 'quiet',
    };
  }
  if (mode !== EncounterMode.TURN_BASED) {
    // UNSPECIFIED (and any future non-combat mode): neutral, no false claim.
    return { text: 'Connecting…', tone: 'quiet' };
  }
  if (!isMyTurn) {
    return {
      text: activeEntityName
        ? `${activeEntityName}'s turn — watch the map.`
        : 'Waiting for the next turn…',
      tone: 'info',
    };
  }
  // rpg-dnd5e-web#545: when the server's menu offers nothing currently
  // usable (live repro: api#637's all-zero economy disabled every verb
  // while the strip still said "pick an action"), guide the only real
  // moves instead of lying. Affordability is read purely off the wire —
  // never inferred (see noneUsable at the call site).
  if (noneUsable) {
    return canStillMove
      ? { text: 'You can still move — or End Turn.', tone: 'action' }
      : { text: 'Nothing left to do — End Turn.', tone: 'action' };
  }
  return { text: 'Your turn — pick an action.', tone: 'action' };
}

const TONE_COLOR: Record<'action' | 'info' | 'quiet', string> = {
  action: 'var(--text-primary)',
  info: 'var(--text-secondary)',
  quiet: 'var(--text-muted)',
};

export function EncounterDock({
  entityId,
  displayName,
  classRefId,
  hp,
  ac,
  statuses,
  economy,
  actions,
  mode,
  encounterEnded,
  isMyTurn,
  activeEntityName,
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
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const toggle = (panel: Exclude<OpenPanel, null>) =>
    setOpenPanel((open) => (open === panel ? null : panel));

  const tier = hp ? hpTier(hp.current, hp.max) : 'low';
  const hpPct =
    hp && hp.max > 0
      ? Math.max(0, Math.min(100, (hp.current / hp.max) * 100))
      : 0;
  const label = classLabel(classRefId);
  const name = resolveName(displayName, entityId);

  // Everything economy-shaped is gated on YOUR turn in TURN_BASED, and never
  // shown once the encounter has ended: outside TURN_BASED turnState may be
  // stale (#516), during someone else's turn the menu/economy aren't yours
  // (#458 — the strip carries whose turn it is), and an encounter that ends
  // on your turn leaves mode=TURN_BASED + activeEntityId=you, so `ended`
  // must independently suppress the surface (gate #1).
  const showActionSurface =
    !encounterEnded && mode === EncounterMode.TURN_BASED && isMyTurn;
  const movementRemaining =
    !encounterEnded && isMyTurn
      ? resolveMovementRemaining(mode, economy)
      : undefined;

  const armedLabel = armedActionKey
    ? actions.find((a) => actionKey(a) === armedActionKey)?.displayName
    : undefined;
  // rpg-dnd5e-web#545: "usable" comes only from server data — the action's
  // own `available` flag AND its mapped pool not being exhausted (verbCost;
  // unmapped slots like movement/free count as usable when available). An
  // EMPTY menu is the pre-turnState loading window, not "nothing left" —
  // hence the length guard.
  const noneUsable =
    actions.length > 0 &&
    !actions.some((a) => {
      if (!a.available) return false;
      const cost = verbCost(a, economy);
      return !cost || !cost.spent;
    });
  const canStillMove = (movementRemaining ?? 0) > 0;
  const ctx = contextMessage(
    mode,
    encounterEnded,
    isMyTurn,
    activeEntityName,
    armedLabel,
    noneUsable,
    canStillMove
  );

  const { core, groups, menuCount, triggerLabel } = organizeVerbs(actions);

  const renderVerb = (a: AvailableAction, inMenu = false) => (
    <VerbButton
      key={actionKey(a)}
      label={a.displayName}
      iconUrl={a.ref ? getActionIconUrl(a.ref.id) : undefined}
      onClick={() => {
        if (inMenu) setOpenPanel(null);
        onSelectAction(a);
      }}
      cost={verbCost(a, economy)}
      available={a.available && actionsEnabled}
      reason={a.unavailableReason}
      armed={armedActionKey !== undefined && actionKey(a) === armedActionKey}
      loading={actionsLoading}
      className={inMenu ? 'menu-row' : undefined}
      // Same testid convention ActionMenu used (`action-<module:type:id>`)
      // so interaction tests address verbs stably across the primitive swap.
      data-testid={`action-${actionKey(a)}`}
    />
  );

  return (
    <div data-testid="encounter-dock" style={{ flexShrink: 0 }}>
      {/* Teaching strip — one line, ~22px, never grows. role=status so
          turn changes and armed guidance are announced to assistive tech. */}
      <div
        data-testid="encounter-dock-context"
        role="status"
        style={{
          fontSize: 12,
          lineHeight: '22px',
          height: 22,
          padding: '0 12px',
          background: 'var(--bg-secondary)',
          borderTop: '1px solid',
          borderColor:
            ctx.tone === 'action'
              ? 'var(--accent-primary)'
              : 'var(--border-primary)',
          color: TONE_COLOR[ctx.tone],
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {ctx.text}
      </div>

      <DockShell
        data-testid="encounter-dock-shell"
        overlay={
          <>
            <OverlayPanel
              open={openPanel === 'menu'}
              data-testid="encounter-dock-menu"
            >
              {/* Grouped by provenance (ref.type): "where does this option
                  come from" answered by structure; cost badges ride along. */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: 10,
                }}
              >
                {groups.map((g) => (
                  <div
                    key={g.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                        padding: '2px 2px 0',
                      }}
                    >
                      {g.label}
                    </div>
                    {g.actions.map((a) => renderVerb(a, true))}
                  </div>
                ))}
              </div>
            </OverlayPanel>

            <OverlayPanel
              open={openPanel === 'settings'}
              width={280}
              data-testid="encounter-dock-settings"
            >
              {/* Reaction policies live here, not in the bar. The panel's
                  SetReactionReady mechanism is real wire state (OA defaults
                  ready server-side for melee; Shield must be armed), so it
                  relocated instead of being deleted. */}
              <div style={{ padding: 12 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    marginBottom: 8,
                  }}
                >
                  Combat settings
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    marginBottom: 8,
                  }}
                >
                  Reactions fire automatically while readied:
                </div>
                <ReactionReadyPanel
                  readiness={reactionReadiness}
                  loading={reactionLoading}
                  disabled={reactionDisabled}
                  onToggle={onToggleReaction}
                  compact
                />
              </div>
            </OverlayPanel>

            <OverlayPanel
              open={openPanel === 'log'}
              data-testid="encounter-dock-log-overlay"
            >
              <CombatLog entries={combatLogEntries} />
            </OverlayPanel>
          </>
        }
      >
        {/* Identity + promoted movement: name, HP sliver, then movement —
            "how much movement do I have left" is the #1 user question. */}
        <span
          data-testid="encounter-dock-identity"
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            gap: 2,
            flexShrink: 0,
            minWidth: 0,
          }}
        >
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span
              style={{
                fontWeight: 700,
                fontSize: 13,
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </span>
            {label && (
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </span>
            )}
            {hp && (
              <span
                style={{
                  display: 'inline-block',
                  width: 40,
                  height: 5,
                  borderRadius: 3,
                  background: 'var(--resource-bg, rgba(255,255,255,0.1))',
                  overflow: 'hidden',
                }}
                title={`HP ${hp.current}/${hp.max}${ac !== undefined ? ` · AC ${ac}` : ''}`}
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
            )}
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}
            >
              {hp ? `${hp.current}/${hp.max}` : ''}
              {ac !== undefined ? `${hp ? ' · ' : ''}AC ${ac}` : ''}
            </span>
            {statuses.length > 0 && <StatusBadgeList statuses={statuses} />}
          </span>
          {movementRemaining !== undefined && (
            /* Number only — a depleting bar needs turn-start speed, which
               isn't on the wire yet (contract gap recorded during the
               /concepts rounds; part of the protos#183-class request). */
            <span
              data-testid="encounter-dock-movement"
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
              }}
              title={`Movement left this turn: ${movementRemaining} ft`}
            >
              {movementRemaining} ft
            </span>
          )}
        </span>

        {showActionSurface && economy && <EconomyPips economy={economy} />}

        {showActionSurface && (
          <span
            data-testid="encounter-dock-verbs"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
              flex: '1 1 auto',
              minWidth: 0,
            }}
          >
            {core.map((a) => renderVerb(a))}
            {menuCount > 0 && (
              <OverlayToggle
                label={triggerLabel}
                open={openPanel === 'menu'}
                onToggle={() => toggle('menu')}
                aria-label={`${menuCount} more options: ${groups
                  .map((g) => `${g.label} (${g.actions.length})`)
                  .join(', ')}`}
              />
            )}
          </span>
        )}

        {showActionSurface && (
          <Button
            variant="commit"
            size="xs"
            onClick={onEndTurn}
            disabled={endTurnDisabled}
            style={{ marginLeft: 'auto', flexShrink: 0 }}
          >
            {endTurnLoading ? 'Ending…' : 'End Turn'}
          </Button>
        )}

        <OverlayToggle
          label={`📜 ${combatLogEntries.length}`}
          open={openPanel === 'log'}
          onToggle={() => toggle('log')}
          aria-label={`Combat log, ${combatLogEntries.length} entries — ${openPanel === 'log' ? 'hide' : 'show'}`}
          className="encounter-dock-log-toggle"
        />
        <OverlayToggle
          label="⚙"
          open={openPanel === 'settings'}
          onToggle={() => toggle('settings')}
          aria-label="Combat settings"
        />
      </DockShell>
    </div>
  );
}
