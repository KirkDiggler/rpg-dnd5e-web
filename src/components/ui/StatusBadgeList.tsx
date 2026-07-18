/**
 * Visual condition/status badges (#467). Shows a Synty HUD icon PNG when
 * `getConditionDisplay` maps one, falling back to the plain emoji otherwise
 * so unknown/unmapped conditions never render a broken image.
 *
 * This is for *visual* surfaces only (entity tables, header status strips).
 * Text-only surfaces like the combat log stay emoji — see
 * `src/utils/combatFormat.ts`'s `formatStatusBadges` for that path.
 */

import { getConditionDisplay } from '@/utils/conditionIcons';
import type { ReactNode } from 'react';

export interface ConditionBadgeProps {
  /** A single status entry, as pushed over the encounter stream. */
  status: { source: { id: string } };
  className?: string;
}

/** One condition badge: Synty icon (preferred) or emoji, plus its label. */
export function ConditionBadge({ status, className }: ConditionBadgeProps) {
  const display = getConditionDisplay(status.source.id);
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        whiteSpace: 'nowrap',
      }}
    >
      {display.iconUrl ? (
        <img
          src={display.iconUrl}
          alt={display.label}
          title={display.description || display.label}
          width={18}
          height={18}
          style={{ display: 'inline-block', verticalAlign: 'middle' }}
        />
      ) : (
        <span role="img" aria-label={display.label}>
          {display.icon}
        </span>
      )}
      <span>{display.label}</span>
    </span>
  );
}

export interface StatusBadgeListProps {
  statuses: Array<{ source: { id: string } }>;
  className?: string;
  /** Rendered when `statuses` is empty. Defaults to nothing. */
  emptyFallback?: ReactNode;
}

/**
 * Row of condition badges, replacing the plain-text
 * `formatStatusBadges(...)` string in visual badge surfaces (the encounter
 * header, the playtest harness entity table and status summary).
 */
export function StatusBadgeList({
  statuses,
  className,
  emptyFallback = null,
}: StatusBadgeListProps) {
  if (statuses.length === 0) {
    return <>{emptyFallback}</>;
  }
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8 }}
    >
      {statuses.map((s, i) => (
        <ConditionBadge key={`${s.source.id}-${i}`} status={s} />
      ))}
    </span>
  );
}
