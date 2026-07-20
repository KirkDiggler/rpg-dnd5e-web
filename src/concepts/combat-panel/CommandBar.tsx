/**
 * Composition A: "Command bar" — verb-first single row (rpg-dnd5e-web#525).
 *
 * The hierarchy inversion: primary verbs are ALWAYS the most prominent
 * thing; the economy is shown as state (pips), never as row headers; End
 * Turn is a real commit button at the far edge; secondary verbs live in a
 * summonable overflow so the row never grows past one line of intent.
 *
 * Pure composition of ui/combat primitives + the shared Button — no rules,
 * no layout knowledge beyond "one row"; everything else comes from
 * DockShell.
 */

import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import {
  DockShell,
  EconomyPips,
  OverlayPanel,
  OverlayToggle,
  ReadinessChip,
  VerbButton,
} from '../../components/ui/combat';
import { getActionIconUrl } from '../../utils/actionIcons';
import type { CombatPanelFixture } from './fixtures';

/** How many verbs stay inline before the rest fold into the overflow. */
const INLINE_VERB_LIMIT = 4;

export interface CommandBarProps {
  fixture: CombatPanelFixture;
  armedKey?: string;
  onVerb: (refId: string) => void;
  onEndTurn: () => void;
  onToggleReaction: () => void;
}

export function CommandBar({
  fixture,
  armedKey,
  onVerb,
  onEndTurn,
  onToggleReaction,
}: CommandBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const inline = fixture.actions.slice(0, INLINE_VERB_LIMIT);
  const overflow = fixture.actions.slice(INLINE_VERB_LIMIT);
  const { viewer } = fixture;
  const hpPct =
    viewer.hp.max > 0
      ? Math.max(0, Math.min(100, (viewer.hp.current / viewer.hp.max) * 100))
      : 0;

  return (
    <DockShell
      data-testid="command-bar"
      overlay={
        <OverlayPanel open={moreOpen} data-testid="command-bar-more">
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: 10,
            }}
          >
            {overflow.map((a) => (
              <VerbButton
                key={a.ref?.id ?? a.displayName}
                label={a.displayName}
                iconUrl={a.ref ? getActionIconUrl(a.ref.id) : undefined}
                onClick={() => {
                  setMoreOpen(false);
                  if (a.ref) onVerb(a.ref.id);
                }}
                available={a.available}
                reason={a.unavailableReason}
                armed={armedKey !== undefined && a.ref?.id === armedKey}
              />
            ))}
            {overflow.length === 0 && (
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                No more actions
              </span>
            )}
          </div>
        </OverlayPanel>
      }
    >
      {/* Identity: name + inline HP sliver, quiet, never competes with verbs */}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
        }}
      >
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
            height: 6,
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

      {fixture.economy && <EconomyPips economy={fixture.economy} />}

      {/* The verbs — the loudest thing in the row, always */}
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
        {inline.map((a) => (
          <VerbButton
            key={a.ref?.id ?? a.displayName}
            label={a.displayName}
            iconUrl={a.ref ? getActionIconUrl(a.ref.id) : undefined}
            onClick={() => a.ref && onVerb(a.ref.id)}
            available={a.available}
            reason={a.unavailableReason}
            armed={armedKey !== undefined && a.ref?.id === armedKey}
          />
        ))}
        {overflow.length > 0 && (
          <OverlayToggle
            label={`+${overflow.length}`}
            open={moreOpen}
            onToggle={() => setMoreOpen((o) => !o)}
            aria-label={`${overflow.length} more actions`}
          />
        )}
      </span>

      {fixture.mode === 'TURN_BASED' && (
        <ReadinessChip
          label="Opportunity Attack"
          state={fixture.reaction}
          onClick={onToggleReaction}
        />
      )}

      {fixture.isMyTurn && (
        <Button
          variant="commit"
          size="sm"
          onClick={onEndTurn}
          icon={
            getActionIconUrl('end-turn') && (
              <img
                src={getActionIconUrl('end-turn')}
                alt=""
                aria-hidden="true"
                width={14}
                height={14}
              />
            )
          }
        >
          End Turn
        </Button>
      )}
    </DockShell>
  );
}
