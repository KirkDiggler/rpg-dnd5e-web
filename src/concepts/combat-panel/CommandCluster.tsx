/**
 * Composition E: "Command cluster" (round 4) — a genuinely different shape
 * from the bar family. Three anchored elements float OVER the map instead
 * of reserving a full-width dock row:
 *
 *   bottom-left  — identity card: portrait-style block with name, class,
 *                  a full-width HP gauge with numbers, AC, economy pips,
 *                  and the movement readout.
 *   bottom-center — the verb cluster: a GRID of large buttons (not a
 *                  strip), grouped overflow behind a More tile, with the
 *                  teaching strip floating as a pill above it.
 *   bottom-right — End Turn as its own anchored commit button, gear below.
 *
 * Spends vertical room deliberately (Kirk: "we can have as much room as
 * feels comfortable") while the map keeps the whole frame — nothing here
 * is layout-reserved; it's all overlay. All data server-given.
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
import { pillMessage } from './contextMessage';
import type { CombatPanelFixture } from './fixtures';

export interface CommandClusterProps {
  fixture: CombatPanelFixture;
  armedKey?: string;
  onVerb: (refId: string) => void;
  onEndTurn: () => void;
}

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 10,
  boxShadow: '0 6px 24px rgba(0, 0, 0, 0.35)',
};

export function CommandCluster({
  fixture,
  armedKey,
  onVerb,
  onEndTurn,
}: CommandClusterProps) {
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
  const armedLabel = armedKey
    ? fixture.actions.find((a) => a.ref?.id === armedKey)?.displayName
    : undefined;
  // Round-6 pill contract (Copilot catch): plain your-turn shows NOTHING —
  // route through pillMessage so this reference matches the chosen behavior.
  const ctx = pillMessage(fixture, armedKey, armedLabel);
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
      className={inMenu ? 'menu-row comfort' : 'cluster-tile'}
    />
  );

  return (
    <div
      data-testid="command-cluster"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    >
      {/* bottom-left: identity card */}
      <div
        style={{
          ...CARD_STYLE,
          position: 'absolute',
          left: 12,
          bottom: 12,
          width: 190,
          padding: '10px 12px',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: 15,
            color: 'var(--text-primary)',
            fontFamily: 'Cinzel, serif',
            lineHeight: 1.1,
          }}
        >
          {viewer.displayName}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {classLabel} · AC {viewer.ac}
        </span>
        <span
          title={`HP ${viewer.hp.current}/${viewer.hp.max}`}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span
            className="hud-gauge"
            style={{
              flex: 1,
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
              }}
            />
          </span>
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
            }}
          >
            {viewer.hp.current}/{viewer.hp.max}
          </span>
        </span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minHeight: 18,
          }}
        >
          {fixture.economy && (
            <EconomyPips economy={fixture.economy} className="comfort" />
          )}
          {movement !== undefined && (
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
              }}
              title={`Movement: ${movement} of ${viewer.speed} ft left this turn`}
            >
              {movement} ft
            </span>
          )}
        </span>
      </div>

      {/* bottom-center: teaching pill + verb grid */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 12,
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          pointerEvents: 'auto',
        }}
      >
        {ctx && (
          <span
            data-testid="cluster-strip"
            role="status"
            style={{
              fontSize: 12.5,
              padding: '3px 14px',
              borderRadius: 9999,
              background: 'var(--bg-secondary)',
              border: `1px solid ${
                ctx.tone === 'action'
                  ? 'var(--accent-primary)'
                  : 'var(--border-primary)'
              }`,
              color:
                ctx.tone === 'quiet'
                  ? 'var(--text-muted)'
                  : 'var(--text-primary)',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
            }}
          >
            {ctx.text}
          </span>
        )}
        {(core.length > 0 || menuCount > 0) && (
          <div style={{ position: 'relative' }}>
            <div
              style={{
                ...CARD_STYLE,
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(
                  4,
                  Math.max(2, core.length + (menuCount > 0 ? 1 : 0))
                )}, minmax(96px, auto))`,
                gap: 8,
                padding: 10,
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
                  className="cluster-tile"
                />
              )}
            </div>
            <OverlayPanel open={moreOpen} data-testid="cluster-more">
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
              </div>
            </OverlayPanel>
          </div>
        )}
      </div>

      {/* bottom-right: End Turn + settings */}
      <div
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 8,
          pointerEvents: 'auto',
        }}
      >
        <div style={{ position: 'relative' }}>
          <OverlayPanel
            open={settingsOpen}
            width={260}
            align="right"
            data-testid="cluster-settings"
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
          {fixture.isMyTurn && (
            <Button variant="commit" size="md" onClick={onEndTurn}>
              End Turn
            </Button>
          )}
        </div>
        <OverlayToggle
          label="⚙"
          open={settingsOpen}
          onToggle={() => {
            setMoreOpen(false);
            setSettingsOpen((o) => !o);
          }}
          aria-label="Combat settings"
        />
      </div>
    </div>
  );
}
