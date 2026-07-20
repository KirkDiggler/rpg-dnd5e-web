/**
 * Composition A: "Command bar" — verb-first single row (rpg-dnd5e-web#525,
 * round 2 shaped by Kirk's review: "I have an action point pool — what
 * uses what point?").
 *
 * The answer structure, left to right: WHO (identity + promoted movement
 * readout — the #1 user question), WHAT'S LEFT (economy pips), WHAT CAN I
 * DO AND WHAT DOES EACH COST (verbs with pool-shape cost badges mapped 1:1
 * from the server's economy_slot), then End Turn as a calm-but-real commit
 * button right-aligned. Reactions are not a bar control — they fire
 * automatically; the gear popover shows where reaction policies live, and
 * the triangle pip carries the pool state. Tooltips carry the words;
 * chrome stays quiet.
 */

import type { AvailableAction } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import {
  DockShell,
  EconomyPips,
  organizeVerbs,
  OverlayPanel,
  OverlayToggle,
  VerbButton,
  verbCost,
} from '../../components/ui/combat';
import { getActionIconUrl } from '../../utils/actionIcons';
import type { CombatPanelFixture } from './fixtures';

// Grouping/cost logic promoted to ui/combat/organizeVerbs (slice 1) — the
// live EncounterDock and this concept organize verbs identically.

export interface CommandBarProps {
  fixture: CombatPanelFixture;
  armedKey?: string;
  onVerb: (refId: string) => void;
  onEndTurn: () => void;
}

export function CommandBar({
  fixture,
  armedKey,
  onVerb,
  onEndTurn,
}: CommandBarProps) {
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
      className={inMenu ? 'menu-row' : undefined}
    />
  );

  return (
    <DockShell
      data-testid="command-bar"
      overlay={
        <>
          <OverlayPanel open={moreOpen} data-testid="command-bar-more">
            {/* Grouped by provenance: section per ref.type — "where does
                this option come from" answered by structure. Cost badges
                ride along; the pool language follows the actions wherever
                they render. */}
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
            data-testid="command-bar-settings"
          >
            {/* Concept-only settings surface: shows WHERE reaction policies
                live now that they're not bar controls. Kirk: "opportunity
                attack is just a setting, default always on." */}
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
        </>
      }
    >
      {/* Identity + promoted movement: name, HP sliver, then movement as
          the readout under them — "how much movement do I have left" is
          the #1 user question, so it gets words + a depleting bar. */}
      <span
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          gap: 2,
          flexShrink: 0,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: 13,
              color: 'var(--text-primary)',
            }}
          >
            {viewer.displayName}
          </span>
          <span
            style={{
              display: 'inline-block',
              width: 40,
              height: 5,
              borderRadius: 3,
              background: 'var(--resource-bg)',
              overflow: 'hidden',
            }}
            title={`HP ${viewer.hp.current}/${viewer.hp.max} · AC ${viewer.ac}`}
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
        </span>
        {movement !== undefined && (
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            title={`Movement: ${movement} of ${viewer.speed} ft left this turn`}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
              }}
            >
              {movement} ft
            </span>
            {movementPct !== undefined && (
              <span
                style={{
                  display: 'inline-block',
                  width: 48,
                  height: 4,
                  borderRadius: 2,
                  background: 'var(--resource-bg)',
                  overflow: 'hidden',
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
      </span>

      {fixture.economy && <EconomyPips economy={fixture.economy} />}

      {/* The verbs — each carrying its pool-shape cost badge */}
      <span
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
            open={moreOpen}
            onToggle={() => {
              setSettingsOpen(false);
              setMoreOpen((o) => !o);
            }}
            aria-label={`${menuCount} more options: ${groups
              .map((g) => `${g.label} (${g.actions.length})`)
              .join(', ')}`}
          />
        )}
      </span>

      {fixture.isMyTurn && (
        <Button
          variant="commit"
          size="xs"
          onClick={onEndTurn}
          style={{ marginLeft: 'auto', flexShrink: 0 }}
        >
          End Turn
        </Button>
      )}

      <OverlayToggle
        label="⚙"
        open={settingsOpen}
        onToggle={() => {
          setMoreOpen(false);
          setSettingsOpen((o) => !o);
        }}
        aria-label="Combat settings"
      />
    </DockShell>
  );
}
