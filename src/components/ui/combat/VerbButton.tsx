/**
 * VerbButton — one primary verb in the combat bar (Attack, Dash, End Turn's
 * sibling actions). Icon + label, with the armed-action state built in
 * (rpg-dnd5e-web#514's arming flow made visible as a first-class state):
 * `armed` pulses and stays lit until the action resolves or is cancelled.
 *
 * Unavailable verbs stay VISIBLE but disabled with the server's reason as
 * the tooltip — hiding them would make the menu feel random as economy
 * drains (rpg-dnd5e-web#525's hierarchy critique: players think "what can
 * I do NOW", and a stable set of verbs with clear on/off states answers
 * that faster than a menu that reshuffles).
 */

import { cn } from '../../../utils/cn';

export interface VerbButtonProps {
  label: string;
  /** Resolved icon URL (getActionIconUrl) — falls back to text-only. */
  iconUrl?: string;
  onClick: () => void;
  /** Server-driven availability; `reason` becomes the tooltip when false. */
  available?: boolean;
  reason?: string;
  armed?: boolean;
  loading?: boolean;
  className?: string;
}

export function VerbButton({
  label,
  iconUrl,
  onClick,
  available = true,
  reason,
  armed = false,
  loading = false,
  className,
}: VerbButtonProps) {
  const disabled = !available || loading;

  return (
    <button
      type="button"
      className={cn('verb-btn', armed && 'armed', className)}
      onClick={onClick}
      disabled={disabled}
      title={
        armed
          ? `${label} armed — click a target, or click again / Esc to cancel`
          : !available && reason
            ? reason
            : label
      }
      data-armed={armed || undefined}
    >
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
