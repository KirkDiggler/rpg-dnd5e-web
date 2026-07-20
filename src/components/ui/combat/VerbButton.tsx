/**
 * VerbButton — one primary verb in the combat bar (Attack, Dash, a rogue's
 * Disengage). Icon + label + a COST BADGE: the pool shape this verb
 * consumes (circle=action, diamond=bonus, triangle=reaction), matching
 * EconomyPips' shapes exactly, so "Attack uses my Action" and "a rogue's
 * Disengage is a Bonus Action" are self-evident (Kirk's round-2 model:
 * "I have an action point pool — what uses what point?").
 *
 * The badge is driven ONLY by the server's economy_slot on the action —
 * the web never infers what anything costs. When that pool is spent the
 * badge hollows out; the words live in the tooltip ("Uses your Action —
 * spent"), which is the escape valve for detail over chrome.
 *
 * `armed` (#514 flow) stays static-legible: solid fill + border, pulse as
 * garnish. Unavailable verbs stay VISIBLE but disabled with the server's
 * reason as the tooltip — a stable set of verbs with clear on/off states
 * answers "what can I do NOW" faster than a reshuffling menu.
 */

import { cn } from '../../../utils/cn';

export type CostShape = 'action' | 'bonus' | 'reaction';

const COST_WORDS: Record<CostShape, string> = {
  action: 'Uses your Action',
  bonus: 'Uses your Bonus Action',
  reaction: 'Uses your Reaction',
};

export interface VerbButtonProps {
  label: string;
  /** Resolved icon URL (getActionIconUrl) — falls back to text-only. */
  iconUrl?: string;
  onClick: () => void;
  /** Which economy pool this verb consumes (mapped 1:1 from the server's
   * economy_slot) and whether that pool is currently spent. Omit for
   * verbs with no pool cost (movement, free actions). */
  cost?: { shape: CostShape; spent: boolean };
  /** Server-driven availability; `reason` becomes the tooltip when false. */
  available?: boolean;
  reason?: string;
  armed?: boolean;
  loading?: boolean;
  className?: string;
  'data-testid'?: string;
}

export function VerbButton({
  label,
  iconUrl,
  onClick,
  cost,
  available = true,
  reason,
  armed = false,
  loading = false,
  className,
  'data-testid': testId,
}: VerbButtonProps) {
  const disabled = !available || loading;

  const costText = cost
    ? `${COST_WORDS[cost.shape]}${cost.spent ? ' — spent' : ''}`
    : undefined;
  const title = armed
    ? `${label} armed — click a target, or click again / Esc to cancel`
    : !available && reason
      ? reason
      : costText
        ? `${label} — ${costText}`
        : label;

  return (
    <button
      type="button"
      className={cn('verb-btn', armed && 'armed', className)}
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-armed={armed || undefined}
      data-testid={testId}
    >
      {cost && (
        <span
          className={cn('economy-pip', 'badge', `shape-${cost.shape}`, {
            filled: !cost.spent,
          })}
          aria-hidden="true"
        />
      )}
      {iconUrl && (
        <img
          src={iconUrl}
          alt=""
          aria-hidden="true"
          width={16}
          height={16}
          style={{ display: 'inline-block', flexShrink: 0 }}
        />
      )}
      {loading ? '…' : label}
    </button>
  );
}
