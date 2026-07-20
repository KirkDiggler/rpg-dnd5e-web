/**
 * EconomyPips — the turn economy pools as at-a-glance STATE, not a row of
 * labeled numbers (rpg-dnd5e-web#525: "Action:1 Bonus:1 Reaction" as a
 * header row made the economy read like navigation). One pip per remaining
 * use, hollow once spent. Slots differ by SHAPE (action=circle,
 * bonus=diamond, reaction=triangle); VerbButton's cost badges reuse the
 * exact same shapes, which is what makes "this verb costs that point"
 * readable. Movement is NOT here — it's the #1 user question, promoted to
 * its own readout in the composition. The reaction pip's tooltip explains
 * that reactions fire automatically (opportunity attacks are a setting,
 * not a bar control — Kirk's round-2 direction).
 *
 * Renders the server's ActionEconomy verbatim — no client-side rule math.
 */

import type { ActionEconomy } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { cn } from '../../../utils/cn';

type PipShape = 'action' | 'bonus' | 'reaction';

function PipGroup({
  shape,
  label,
  remaining,
  capacity,
}: {
  shape: PipShape;
  label: string;
  remaining: number;
  capacity: number;
}) {
  // The wire carries only `remaining`; show at least one pip slot so a
  // fully-spent slot renders as a hollow pip, not as nothing.
  const total = Math.max(capacity, remaining, 1);
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
      title={`${label}: ${remaining} remaining`}
      aria-label={`${label}: ${remaining} remaining`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn('economy-pip', `shape-${shape}`, {
            filled: i < remaining,
          })}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export interface EconomyPipsProps {
  economy: ActionEconomy | null | undefined;
  className?: string;
}

export function EconomyPips({ economy, className }: EconomyPipsProps) {
  if (!economy) return null;

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        fontSize: '0.8125rem',
        fontWeight: 600,
        color: 'var(--text-secondary)',
      }}
    >
      <PipGroup
        shape="action"
        label="Action"
        remaining={economy.actionsRemaining}
        capacity={1}
      />
      <PipGroup
        shape="bonus"
        label="Bonus action"
        remaining={economy.bonusActionsRemaining}
        capacity={1}
      />
      <PipGroup
        shape="reaction"
        label="Reaction — used automatically, e.g. opportunity attacks"
        remaining={economy.reactionsRemaining}
        capacity={1}
      />
    </span>
  );
}
