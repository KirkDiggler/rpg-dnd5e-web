/**
 * Composition C: "Comfortable bar" (round 4 — Kirk: "the panel should be
 * clear and large enough to read; we can have as much room as feels
 * comfortable; we swung to an extreme compensating for the old wasted
 * space"). Height is no longer the scarce resource — CLARITY is.
 *
 * Same verb-first IA as A/B, at a humane scale, as TWO deliberate rows:
 *   row 1 — WHO and WHAT'S LEFT: name, class, a readable HP gauge with
 *           numbers, AC, economy pips at full size, movement readout.
 *   row 2 — WHAT CAN I DO: large verbs with cost badges, grouped overflow,
 *           End Turn as a properly sized commit button.
 * Teaching strip on top at comfortable type size. All data server-given.
 *
 * Composition D: the same layout with `skin="hud"` — the Synty Fantasy
 * Warrior HUD sprites skin the shell/buttons/gauges via the `.hud-skin`
 * CSS classes (public/themes/base.css). Sprites are grayscale art tinted
 * through theme tokens with background-blend, and they are GITIGNORED
 * (Synty license): every skinned class keeps its token fallback, so with
 * sprites absent this renders identically to C plus token chrome.
 */

import type { AvailableAction } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import {
  EconomyPips,
  organizeVerbs,
  OverlayPanel,
  OverlayToggle,
  VerbButton,
  verbCost,
} from '../../components/ui/combat';
import { getActionIconUrl } from '../../utils/actionIcons';
import { ContextStrip } from './ContextStrip';
import type { CombatPanelFixture } from './fixtures';

export interface ComfortBarProps {
  fixture: CombatPanelFixture;
  armedKey?: string;
  onVerb: (refId: string) => void;
  onEndTurn: () => void;
  /** 'tokens' = composition C; 'hud' = composition D (sprite-skinned). */
  skin?: 'tokens' | 'hud';
}

export function ComfortBar({
  fixture,
  armedKey,
  onVerb,
  onEndTurn,
  skin = 'tokens',
}: ComfortBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { core, groups, menuCount, triggerLabel } = organizeVerbs(
    fixture.actions
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

  const showEconomy = fixture.economy !== null;

  return (
    <div className={skin === 'hud' ? 'hud-skin' : undefined}>
      <ContextStrip fixture={fixture} armedKey={armedKey} comfortable />
      {/* Two-container shell (the #519 lesson): outer relative anchor with
          no overflow rule; overlays are siblings of the rows. */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div
          className="hud-dock"
          data-testid="comfort-bar"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '10px 16px 12px',
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
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontWeight: 700,
                fontSize: 16,
                color: 'var(--text-primary)',
                fontFamily: 'Cinzel, serif',
              }}
            >
              {viewer.displayName}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
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
                  width: 120,
                  height: 10,
                  borderRadius: 5,
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
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {viewer.hp.current}/{viewer.hp.max} · AC {viewer.ac}
              </span>
            </span>

            {showEconomy && fixture.economy && (
              <EconomyPips economy={fixture.economy} className="comfort" />
            )}

            {movement !== undefined && (
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                title={`Movement: ${movement} of ${viewer.speed} ft left this turn`}
              >
                <span
                  style={{
                    fontSize: 14.5,
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
                      width: 72,
                      height: 7,
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

            <span style={{ marginLeft: 'auto' }}>
              <OverlayToggle
                label="⚙"
                open={settingsOpen}
                onToggle={() => {
                  setMoreOpen(false);
                  setSettingsOpen((o) => !o);
                }}
                aria-label="Combat settings"
              />
            </span>
          </div>

          {/* Row 2 — the verbs, large enough to read */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
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
            {fixture.isMyTurn && (
              <Button
                variant="commit"
                size="sm"
                onClick={onEndTurn}
                style={{ marginLeft: 'auto', flexShrink: 0 }}
              >
                End Turn
              </Button>
            )}
          </div>
        </div>

        <OverlayPanel open={moreOpen} data-testid="comfort-bar-more">
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
