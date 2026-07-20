/**
 * EconomyBar — live action-economy display (TakeAction wave #426).
 *
 * Renders the server-authored ActionEconomy from the pushed TurnState
 * (TurnStateChanged event, Invariant 12 — no polling). Every value is the
 * server's count; the web subtracts nothing and computes nothing.
 */

import type { ActionEconomy } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';

export interface EconomyBarProps {
  /** The server-authored economy from TurnState.economy (null until pushed). */
  economy: ActionEconomy | null | undefined;
  /** rpg-dnd5e-web#519 — EncounterDock's "thin action line" mode: drops the
   * bottom margin and tightens the gap so this sits inline with the action
   * row instead of reserving its own line's worth of space. Default false
   * so PlaytestHarness's existing dev-panel spacing is unchanged. */
  compact?: boolean;
}

function Slot({ label, value }: { label: string; value: number }) {
  const spent = value <= 0;
  return (
    <span
      style={{
        display: 'inline-flex',
        gap: 4,
        alignItems: 'baseline',
        color: spent ? '#666' : '#9c9',
      }}
    >
      <span style={{ fontSize: 11, color: '#888' }}>{label}:</span>
      <strong>{value}</strong>
    </span>
  );
}

export function EconomyBar({ economy, compact = false }: EconomyBarProps) {
  if (!economy) {
    return (
      <div
        data-testid="economy-bar-empty"
        style={{ color: '#666', fontSize: 12, marginBottom: compact ? 0 : 8 }}
      >
        {compact ? '(economy…)' : '(economy: waiting for the server)'}
      </div>
    );
  }

  // Surface any granted-capacity counts (e.g. "attacks", "martial_arts_bonus")
  // the toolkit's two-level economy carries — rendered verbatim.
  const capacities = Object.entries(economy.capacities ?? {});

  return (
    <div
      data-testid="economy-bar"
      style={{
        display: 'flex',
        gap: compact ? 8 : 16,
        flexWrap: 'wrap',
        alignItems: 'baseline',
        marginBottom: compact ? 0 : 8,
        fontSize: compact ? 11 : 12,
      }}
    >
      <Slot label={compact ? 'A' : 'Action'} value={economy.actionsRemaining} />
      <Slot
        label={compact ? 'B' : 'Bonus'}
        value={economy.bonusActionsRemaining}
      />
      <Slot
        label={compact ? 'R' : 'Reaction'}
        value={economy.reactionsRemaining}
      />
      <Slot
        label={compact ? 'Mv' : 'Movement'}
        value={economy.movementRemaining}
      />
      {capacities.map(([key, value]) => (
        <Slot key={key} label={key} value={value} />
      ))}
    </div>
  );
}
