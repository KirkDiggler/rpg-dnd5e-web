/**
 * Compositions C and D — the comfortable two-row bar (rounds 4–5).
 *
 * Round 5 (Kirk): the real viewport floor is 1024×768 and typical play is
 * larger — "our current concept feels like 800×600." So:
 *   - Scale is tuned for the floor and breathes upward: D (`skin="hud"`,
 *     THE PICK) takes a full step up in button/gauge/type size over C.
 *   - Verbs render INLINE by default — all core verbs plus class features
 *     as a labeled inline group (divider + group label; the diamond cost
 *     badges carry the cost story). The drop-down exists ONLY as automatic
 *     overflow when the bar genuinely cannot fit the kit (estimated wrap
 *     beyond two lines at the measured width) — width-based, never a fixed
 *     count. At 1024+ a monk's L2 kit sits fully inline.
 *
 * Composition D: same layout with `skin="hud"` — Synty Fantasy Warrior HUD
 * sprites skin the shell/buttons/gauges via `.hud-skin` CSS
 * (public/themes/base.css). Sprites are grayscale art tinted through theme
 * tokens with background-blend, and they are GITIGNORED (Synty license):
 * every skinned class keeps its token fallback.
 *
 * Round 6 (`strip="pill"`, D): the standing teaching-strip ROW is gone —
 * "'your turn — pick an action' is vertical space we do not need to take
 * up" (Kirk). Contextual guidance floats as a zero-layout-height pill
 * above the dock only for non-obvious states; plain your-turn shows
 * nothing and the map gets the freed row. See ContextPill.
 */

import type { AvailableAction } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useEffect, useRef, useState } from 'react';
import { CombatLog } from '../../components/game/CombatLog';
import { Button } from '../../components/ui/Button';
import {
  EconomyPips,
  estimateVerbRowWidth,
  organizeVerbs,
  OverlayPanel,
  OverlayToggle,
  shouldCollapse,
  splitInlineVerbs,
  VerbButton,
  verbCost,
} from '../../components/ui/combat';
import type { CombatLogEntry } from '../../hooks/useCombatLog';
import { getActionIconUrl } from '../../utils/actionIcons';
import { EquipmentPopover } from '../equipment/EquipmentPopover';
import { ContextPill } from './ContextPill';
import { ContextStrip } from './ContextStrip';
import type { CombatPanelFixture } from './fixtures';

/** Chestplate icon for the equipment chip — deliberately NOT another
 * cogwheel; ⚙ is settings and two cogs would confuse. */
const EQUIP_CHIP_ICON =
  '/models/synty/ui/library/icons/inventory/ICON_FantasyWarrior_Inventory_Armor01_Clean.png';

export interface ComfortBarProps {
  fixture: CombatPanelFixture;
  armedKey?: string;
  onVerb: (refId: string) => void;
  onEndTurn: () => void;
  /** 'tokens' = composition C; 'hud' = composition D (sprite-skinned). */
  skin?: 'tokens' | 'hud';
  /**
   * Round 6: 'pill' (composition D) replaces the standing strip row with a
   * zero-height floating pill that appears only for non-obvious states —
   * the map gets the freed row. 'row' keeps the round-4 strip (C ref).
   */
  strip?: 'row' | 'pill';
  /**
   * Round 7 (Kirk: "we always want to see the info there"): when provided,
   * the combat log renders DEFAULT-OPEN as a translucent panel floating
   * over the map, anchored bottom-right above the dock (opposite corner
   * from the centered pill — they can't collide). The 📜 toggle hides it;
   * open is the default. Renders through the REAL CombatLog component, so
   * the live slice is a data-source swap (useCombatLog instead of
   * fixtures). Shown in every state incl. FREE_ROAM (exploration events
   * land there too) and spectator (spectators especially live off the
   * log).
   */
  logEntries?: CombatLogEntry[];
  /**
   * Equipment round 2 (Kirk: "a gear icon on our control bar that can
   * open an animated pop over"): renders the equipment chip (chestplate
   * icon) beside 📜/⚙ and the animated EquipmentPopover. Concept-only
   * until the CONTRACT.md wire lands. One-panel policy: while equipment
   * is open the log yields (its own open state is untouched, so it
   * restores on close).
   */
  equipmentChip?: boolean;
}

export function ComfortBar({
  fixture,
  armedKey,
  onVerb,
  onEndTurn,
  skin = 'tokens',
  strip = 'row',
  logEntries,
  equipmentChip = false,
}: ComfortBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Round 7: OPEN is the default — the toggle exists to hide it.
  const [logOpen, setLogOpen] = useState(true);
  const [equipOpen, setEquipOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const [rowWidth, setRowWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = rowRef.current;
    // Non-browser runtimes (SSR, minimal test envs) may lack
    // ResizeObserver — rowWidth stays null there, which resolves to the
    // always-inline layout (never a throw, never hidden content).
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      setRowWidth(entries[0]?.contentRect.width ?? null);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { core, groups, menuCount, triggerLabel } = organizeVerbs(
    fixture.actions
  );
  const big = skin === 'hud';

  // Round 5: inline-by-default — the shared ui/combat helpers (promoted in
  // slice 2) reunite the core overflow, expose feature groups as inline
  // segments, and decide collapse from the measured row width.
  const { inlineCore, featureGroups } = splitInlineVerbs({
    core,
    groups,
    menuCount,
    triggerLabel,
  });
  const collapsed = shouldCollapse(
    estimateVerbRowWidth(inlineCore, featureGroups, big),
    rowWidth
  );

  const { viewer } = fixture;
  const hpPct =
    viewer.hp.max > 0
      ? Math.max(0, Math.min(100, (viewer.hp.current / viewer.hp.max) * 100))
      : 0;
  const movement = fixture.economy?.movementRemaining;
  const movementPct =
    movement !== undefined && viewer.speed > 0
      ? Math.max(0, Math.min(100, (movement / viewer.speed) * 100))
      : undefined;
  const classLabel =
    viewer.classRefId.charAt(0).toUpperCase() + viewer.classRefId.slice(1);

  const renderVerb = (a: AvailableAction, inMenu = false) => (
    <VerbButton
      key={a.ref?.id ?? a.displayName}
      label={a.displayName}
      iconUrl={a.ref ? getActionIconUrl(a.ref.id) : undefined}
      onClick={() => {
        if (inMenu) setMoreOpen(false);
        if (a.ref) onVerb(a.ref.id);
      }}
      cost={verbCost(a, fixture.economy)}
      available={a.available}
      reason={a.unavailableReason}
      armed={armedKey !== undefined && a.ref?.id === armedKey}
      className={inMenu ? 'menu-row comfort' : 'comfort'}
    />
  );

  return (
    <div className={skin === 'hud' ? 'hud-skin' : undefined}>
      {strip === 'row' && (
        <ContextStrip
          fixture={fixture}
          armedKey={armedKey}
          comfortable={!big}
          large={big}
        />
      )}
      {/* Two-container shell (the #519 lesson): outer relative anchor with
          no overflow rule; overlays are siblings of the rows. */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {strip === 'pill' && (
          <ContextPill fixture={fixture} armedKey={armedKey} large={big} />
        )}
        {/* Round 7: default-open floating combat log, bottom-RIGHT above
            the dock (the pill centers — no collision by construction; the
            settings popover anchors LEFT, so it can't contest this corner
            either — noted as the chosen overlap strategy). Translucent so
            the map reads through; internal scroll, newest at bottom (the
            real CombatLog handles both). */}
        {equipmentChip && <EquipmentPopover open={equipOpen} />}
        {logEntries && logOpen && !equipOpen && (
          <div
            className="floating-log"
            data-testid="floating-log"
            style={{
              position: 'absolute',
              right: 12,
              bottom: '100%',
              marginBottom: 10,
              width: big ? 360 : 330,
              maxWidth: '45%',
              zIndex: 4,
            }}
          >
            <CombatLog entries={logEntries} translucent />
          </div>
        )}
        <div
          className="hud-dock"
          data-testid="comfort-bar"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: big ? 10 : 8,
            padding: big ? '12px 20px 14px' : '10px 16px 12px',
            background: 'var(--bg-secondary)',
            borderTop: '2px solid var(--border-primary)',
            boxShadow: '0 -8px 25px -5px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* Row 1 — identity + pools, readable at a glance */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: big ? 18 : 14,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontWeight: 700,
                fontSize: big ? 18 : 16,
                color: 'var(--text-primary)',
                fontFamily: 'Cinzel, serif',
              }}
            >
              {viewer.displayName}
            </span>
            <span
              style={{
                fontSize: big ? 13.5 : 12.5,
                color: 'var(--text-muted)',
              }}
            >
              {classLabel}
            </span>
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              title={`HP ${viewer.hp.current}/${viewer.hp.max}`}
            >
              <span
                className="hud-gauge"
                style={{
                  display: 'inline-block',
                  width: big ? 160 : 120,
                  height: big ? 12 : 10,
                  borderRadius: 6,
                  background: 'var(--resource-bg)',
                  overflow: 'hidden',
                  border: '1px solid var(--border-primary)',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${hpPct}%`,
                    background: 'var(--health)',
                    transition: 'width 0.2s ease',
                  }}
                />
              </span>
              <span
                style={{
                  fontSize: big ? 15 : 13.5,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {viewer.hp.current}/{viewer.hp.max} · AC {viewer.ac}
              </span>
            </span>

            {fixture.economy && (
              <EconomyPips economy={fixture.economy} className="comfort" />
            )}

            {movement !== undefined && (
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                title={`Movement: ${movement} of ${viewer.speed} ft left this turn`}
              >
                <span
                  style={{
                    fontSize: big ? 16 : 14.5,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {movement} ft
                </span>
                {movementPct !== undefined && (
                  <span
                    className="hud-gauge"
                    style={{
                      display: 'inline-block',
                      width: big ? 90 : 72,
                      height: big ? 8 : 7,
                      borderRadius: 4,
                      background: 'var(--resource-bg)',
                      overflow: 'hidden',
                      border: '1px solid var(--border-primary)',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        height: '100%',
                        width: `${movementPct}%`,
                        background: 'var(--stamina)',
                        transition: 'width 0.2s ease',
                      }}
                    />
                  </span>
                )}
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
              {logEntries && (
                <OverlayToggle
                  label={`📜 ${logEntries.length}`}
                  open={logOpen}
                  onToggle={() => setLogOpen((o) => !o)}
                  aria-label={
                    logOpen
                      ? `Hide combat log (${logEntries.length} entries)`
                      : `Show combat log (${logEntries.length} entries)`
                  }
                />
              )}
              {equipmentChip && (
                <OverlayToggle
                  label={
                    <img
                      src={EQUIP_CHIP_ICON}
                      alt="Equipment"
                      draggable={false}
                      style={{
                        width: 18,
                        height: 18,
                        objectFit: 'contain',
                        verticalAlign: 'middle',
                      }}
                    />
                  }
                  open={equipOpen}
                  onToggle={() => {
                    setMoreOpen(false);
                    setSettingsOpen(false);
                    setEquipOpen((o) => !o);
                  }}
                  aria-label={equipOpen ? 'Close equipment' : 'Open equipment'}
                />
              )}
              <OverlayToggle
                label="⚙"
                open={settingsOpen}
                onToggle={() => {
                  setMoreOpen(false);
                  setEquipOpen(false);
                  setSettingsOpen((o) => !o);
                }}
                aria-label="Combat settings"
              />
            </span>
          </div>

          {/* Row 2 — the verbs. Inline core + labeled inline feature groups
              by default; drop-down only under genuine width pressure. */}
          <div
            ref={rowRef}
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
                    open={moreOpen}
                    onToggle={() => {
                      setSettingsOpen(false);
                      setMoreOpen((o) => !o);
                    }}
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
            {fixture.isMyTurn && (
              <Button
                variant="commit"
                size={big ? 'md' : 'sm'}
                onClick={onEndTurn}
                style={{ marginLeft: 'auto', flexShrink: 0 }}
              >
                End Turn
              </Button>
            )}
          </div>
        </div>

        <OverlayPanel
          open={moreOpen && collapsed}
          data-testid="comfort-bar-more"
        >
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
                    fontSize: 11,
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
            {groups.length === 0 && (
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                No more actions
              </span>
            )}
          </div>
        </OverlayPanel>
        <OverlayPanel
          open={settingsOpen}
          width={260}
          data-testid="comfort-bar-settings"
        >
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
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                fontSize: 13,
                color: 'var(--text-primary)',
              }}
              title="Reactions fire automatically when triggered. Policy control is a concept placeholder."
            >
              <span>Opportunity attacks</span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 9999,
                  padding: '1px 10px',
                }}
              >
                Auto
              </span>
            </div>
          </div>
        </OverlayPanel>
      </div>
    </div>
  );
}
