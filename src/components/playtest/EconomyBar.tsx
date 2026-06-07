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

export function EconomyBar({ economy }: EconomyBarProps) {
  if (!economy) {
    return (
      <div
        data-testid="economy-bar-empty"
        style={{ color: '#666', fontSize: 12, marginBottom: 8 }}
      >
        (economy: waiting for the server)
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
        gap: 16,
        flexWrap: 'wrap',
        alignItems: 'baseline',
        marginBottom: 8,
        fontSize: 12,
      }}
    >
      <Slot label="Action" value={economy.actionsRemaining} />
      <Slot label="Bonus" value={economy.bonusActionsRemaining} />
      <Slot label="Reaction" value={economy.reactionsRemaining} />
      <Slot label="Movement" value={economy.movementRemaining} />
      {capacities.map(([key, value]) => (
        <Slot key={key} label={key} value={value} />
      ))}
    </div>
  );
}
