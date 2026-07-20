/**
 * EncounterDock — the live combat command bar on composition D (#525
 * slice 2): the /concepts "Combat Panel" design Kirk signed off after
 * rounds 4–7, on real stream data.
 *
 * Shape (two deliberate rows at the 1024×768 viewport floor, breathing
 * upward — round 5 corrected the old squat-activity assumption):
 *   Row 1 — WHO and WHAT'S LEFT: name, class, HP gauge with numbers,
 *     status badges, economy pips, promoted movement readout; log +
 *     settings toggles right-aligned.
 *   Row 2 — WHAT CAN I DO AND WHAT DOES EACH COST: verbs INLINE by
 *     default with pool-shape cost badges (server economy_slot), class
 *     features as labeled inline groups; the drop-down survives only as
 *     width-measured overflow (never a fixed count). End Turn as the
 *     commit button, right-aligned.
 *
 * Round 6: no standing teaching strip — contextual guidance floats as a
 * zero-layout-height ContextPill above the dock ONLY for non-obvious
 * states (armed / spectator / free-roam / ended / nothing-left /
 * connecting); plain your-turn shows nothing and the map keeps the row.
 * A hidden aria-live region still announces every state.
 *
 * Round 7 (Kirk: "we always want to see the info there"): the combat log
 * renders DEFAULT-OPEN as a translucent panel floating over the map,
 * bottom-right above the dock, in EVERY state (spectators especially live
 * off it; exploration events land there in FREE_ROAM). The 📜 toggle
 * hides it and the choice persists (localStorage 'ui.combatLog.hidden').
 * The three floating surfaces cannot collide by construction: pill
 * centers, log anchors right, settings popover anchors LEFT.
 *
 * The HUD skin (.hud-skin, public/themes/base.css) dresses the dock in
 * the Synty Fantasy Warrior sprites — grayscale art tinted through theme
 * tokens. Sprites are gitignored (Synty license) and synced at build
 * (docker.yml "Sync Synty assets"); every skinned rule keeps a token
 * fallback, so the dock stays correct with sprites absent.
 *
 * State rules (all server-given, never computed):
 * - Verbs, pips, and movement render only on YOUR turn in TURN_BASED,
 *   and never once the encounter has ended (#516/#458/ended-gate).
 * - Reaction readiness is a SETTING (gear popover), not a bar control —
 *   the SetReactionReady wire mechanism is real, so ReactionReadyPanel
 *   relocated instead of being deleted.
 * - HP fill keeps the traffic-light tier tokens (--hp-*), NOT the
 *   concept's --health resource color — tier semantics per the #543
 *   Copilot lesson (deliberate divergence from the concept fixture).
 */

import type {
  ActionEconomy,
  AvailableAction,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { EncounterMode } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CombatLogEntry } from '../../hooks/useCombatLog';
import type { EntityStatus } from '../../hooks/useEncounterState';
import { getActionIconUrl } from '../../utils/actionIcons';
import { actionKey } from '../playtest/actionMenuHelpers';
import { Button } from '../ui/Button';
import {
  contextMessage,
  ContextPill,
  EconomyPips,
  estimateVerbRowWidth,
  organizeVerbs,
  OverlayPanel,
  OverlayToggle,
  pillMessage,
  shouldCollapse,
  splitInlineVerbs,
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

/** The user's log-hidden preference — open is the default (round 7). */
const LOG_HIDDEN_KEY = 'ui.combatLog.hidden';

function readLogHidden(): boolean {
  try {
    return localStorage.getItem(LOG_HIDDEN_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeLogHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(LOG_HIDDEN_KEY, 'true');
    else localStorage.removeItem(LOG_HIDDEN_KEY);
  } catch {
    // Storage unavailable (private mode / iframe policy) — session-only.
  }
}

/** Which popover is open — at most one, so overlays never stack. The log
 * is NOT a popover: it's a persistent surface with its own state. */
type OpenPanel = 'menu' | 'settings' | null;

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
   * the pill to stop claiming it's your turn (gate on an encounter that
   * ends ON your turn: mode stays TURN_BASED, activeEntityId stays you). */
  encounterEnded: boolean;
  /** TURN_BASED && activeEntityId === entityId, computed by EncounterView. */
  isMyTurn: boolean;
  /** Display name of the active entity when it isn't you — the spectator
   * pill's "{name}'s turn" (#458). Undefined outside TURN_BASED. */
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

  // Round 7: OPEN is the default; hiding is a persisted user preference.
  const [logOpen, setLogOpen] = useState(() => !readLogHidden());
  const toggleLog = () => {
    // The localStorage write lives in the event handler, NOT the state
    // updater — updaters must stay pure (StrictMode double-invokes them).
    // Currently open → this toggle hides → persist hidden=true.
    writeLogHidden(logOpen);
    setLogOpen((open) => !open);
  };

  // Width-measured overflow (round 5): the verb row's real width decides
  // when inline would wrap beyond two lines. Guarded for environments
  // without ResizeObserver (jsdom) — unmeasured stays inline, so content
  // is never hidden by a missing measurement.
  //
  // CALLBACK ref, not a ref+effect (#556 gate): Row 2 mounts and unmounts
  // with showActionSurface (spectate-first entry, every turn handover), so
  // an empty-deps effect either never attaches (ref null on mount) or
  // keeps observing a detached node. The callback attaches/detaches the
  // observer exactly when the row node appears/disappears.
  const rowObserver = useRef<ResizeObserver | null>(null);
  const [rowWidth, setRowWidth] = useState<number | null>(null);
  const rowRef = useCallback((el: HTMLDivElement | null) => {
    rowObserver.current?.disconnect();
    rowObserver.current = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver((entries) => {
        setRowWidth(entries[0]?.contentRect.width ?? null);
      });
      ro.observe(el);
      rowObserver.current = ro;
    } else {
      // Row gone (spectating / turn handed over): drop the stale width so
      // the next mount starts unmeasured (inline) until the RO reports.
      setRowWidth(null);
    }
  }, []);

  const tier = hp ? hpTier(hp.current, hp.max) : 'low';
  const hpPct =
    hp && hp.max > 0
      ? Math.max(0, Math.min(100, (hp.current / hp.max) * 100))
      : 0;
  const label = classLabel(classRefId);
  const name = resolveName(displayName, entityId);

  // Everything economy-shaped is gated on YOUR turn in TURN_BASED, and never
  // shown once the encounter has ended (#516/#458/ended-gate — see the
  // header comment).
  const showActionSurface =
    !encounterEnded && mode === EncounterMode.TURN_BASED && isMyTurn;
  const movementRemaining =
    !encounterEnded && isMyTurn
      ? resolveMovementRemaining(mode, economy)
      : undefined;

  const armedLabel = armedActionKey
    ? actions.find((a) => actionKey(a) === armedActionKey)?.displayName
    : undefined;
  // #545 + the #552 gate: usable is the SAME signal the buttons disable
  // on (server `available` alone), so the pill can never contradict a
  // clickable verb. Empty menu = loading window, never "nothing left".
  const noneUsable = actions.length > 0 && !actions.some((a) => a.available);
  const canStillMove = (movementRemaining ?? 0) > 0;
  const ctxInput = {
    mode,
    encounterEnded,
    isMyTurn,
    activeEntityName,
    armedLabel,
    noneUsable,
    canStillMove,
  };
  const pill = pillMessage(ctxInput);
  const announce = contextMessage(ctxInput).text;

  const organized = organizeVerbs(actions);
  const { core, groups, menuCount, triggerLabel } = organized;
  const { inlineCore, featureGroups } = splitInlineVerbs(organized);
  const collapsed = shouldCollapse(
    estimateVerbRowWidth(inlineCore, featureGroups, true),
    rowWidth
  );

  // Copilot on #556: when the layout transitions collapsed→inline the
  // menu's trigger vanishes but openPanel==='menu' would survive in state
  // and surprise-reopen the panel on the next collapse. Clear it.
  useEffect(() => {
    if (!collapsed) setOpenPanel((p) => (p === 'menu' ? null : p));
  }, [collapsed]);

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
      className={inMenu ? 'menu-row comfort' : 'comfort'}
      // Same testid convention ActionMenu used (`action-<module:type:id>`)
      // so interaction tests address verbs stably across the primitive swap.
      data-testid={`action-${actionKey(a)}`}
    />
  );

  return (
    <div
      data-testid="encounter-dock"
      className="hud-skin"
      style={{ flexShrink: 0 }}
    >
      {/* Two-container shell (the #519 lesson): outer relative anchor with
          no overflow rule of its own; every floating surface (pill, log,
          popovers) is a sibling of the dock rows inside it. */}
      <div style={{ position: 'relative' }}>
        <ContextPill pill={pill} announce={announce} large />

        {logOpen && (
          <div
            className="floating-log"
            data-testid="floating-log"
            style={{
              position: 'absolute',
              right: 12,
              bottom: '100%',
              marginBottom: 10,
              width: 360,
              maxWidth: '45%',
              zIndex: 4,
              // #556 gate: the log floats OVER the map — without this, its
              // ~360px footprint pointer-captures the bottom-right map
              // region (move tiles / armed targets unclickable) in every
              // state. Click-through by design: targeting and movement
              // beat scroll-back; the log is informational. Deliberate
              // trade-off: no scroll-back while floating (the 📜 toggle
              // still hides/shows; a hover-reveal scroll affordance is a
              // possible future refinement).
              pointerEvents: 'none',
            }}
          >
            <CombatLog entries={combatLogEntries} translucent />
          </div>
        )}

        <div
          className="hud-dock"
          data-testid="encounter-dock-shell"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '12px 20px 14px',
            background: 'var(--bg-secondary)',
            borderTop: '2px solid var(--border-primary)',
            boxShadow: '0 -8px 25px -5px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* Row 1 — identity + pools, readable at a glance. */}
          <div
            data-testid="encounter-dock-identity"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontWeight: 700,
                fontSize: 18,
                color: 'var(--text-primary)',
                fontFamily: 'Cinzel, serif',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </span>
            {label && (
              <span
                style={{
                  fontSize: 13.5,
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
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                title={`HP ${hp.current}/${hp.max}${ac !== undefined ? ` · AC ${ac}` : ''}`}
              >
                <span
                  className="hud-gauge"
                  style={{
                    display: 'inline-block',
                    width: 160,
                    height: 12,
                    borderRadius: 6,
                    background: 'var(--resource-bg, rgba(255,255,255,0.1))',
                    overflow: 'hidden',
                    border: '1px solid var(--border-primary)',
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
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {hp.current}/{hp.max}
                  {ac !== undefined ? ` · AC ${ac}` : ''}
                </span>
              </span>
            )}
            {statuses.length > 0 && <StatusBadgeList statuses={statuses} />}

            {showActionSurface && economy && (
              <EconomyPips economy={economy} className="comfort" />
            )}

            {movementRemaining !== undefined && (
              /* Number only — a depleting bar needs turn-start speed, which
                 isn't on the wire yet (contract gap recorded during the
                 /concepts rounds; part of the protos#183-class request). */
              <span
                data-testid="encounter-dock-movement"
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                }}
                title={`Movement left this turn: ${movementRemaining} ft`}
              >
                {movementRemaining} ft
              </span>
            )}

            <span
              style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                gap: 6,
                alignItems: 'center',
              }}
            >
              <OverlayToggle
                label={`📜 ${combatLogEntries.length}`}
                open={logOpen}
                onToggle={toggleLog}
                aria-label={
                  logOpen
                    ? `Hide combat log (${combatLogEntries.length} entries)`
                    : `Show combat log (${combatLogEntries.length} entries)`
                }
                className="encounter-dock-log-toggle"
              />
              <OverlayToggle
                label="⚙"
                open={openPanel === 'settings'}
                onToggle={() => toggle('settings')}
                aria-label="Combat settings"
              />
            </span>
          </div>

          {/* Row 2 — the verbs: inline core + labeled inline feature groups
              by default; drop-down only under genuine width pressure. */}
          {showActionSurface && (
            <div
              ref={rowRef}
              data-testid="encounter-dock-verbs"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              {collapsed ? (
                <>
                  {core.map((a) => renderVerb(a))}
                  {menuCount > 0 && (
                    <OverlayToggle
                      label={triggerLabel}
                      open={openPanel === 'menu'}
                      onToggle={() => toggle('menu')}
                      aria-label={`${menuCount} more options: ${groups
                        .map((g) => `${g.label} (${g.actions.length})`)
                        .join(', ')}`}
                      className="comfort"
                    />
                  )}
                </>
              ) : (
                <>
                  {inlineCore.map((a) => renderVerb(a))}
                  {featureGroups.map((g) => (
                    <span
                      key={g.id}
                      data-testid={`inline-group-${g.id}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span className="verb-group-divider" aria-hidden="true" />
                      <span className="verb-group-label">{g.label}</span>
                      {g.actions.map((a) => renderVerb(a))}
                    </span>
                  ))}
                </>
              )}
              <Button
                variant="commit"
                size="md"
                onClick={onEndTurn}
                disabled={endTurnDisabled}
                style={{ marginLeft: 'auto', flexShrink: 0 }}
              >
                {endTurnLoading ? 'Ending…' : 'End Turn'}
              </Button>
            </div>
          )}
        </div>

        <OverlayPanel
          open={openPanel === 'menu' && collapsed}
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
                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
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

        {/* Settings anchors LEFT — the log owns the right corner, the pill
            centers; the three floating surfaces can never collide. */}
        <OverlayPanel
          open={openPanel === 'settings'}
          align="left"
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
      </div>
    </div>
  );
}
