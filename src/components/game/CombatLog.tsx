/**
 * CombatLog — GameView's game-grade combat narrative panel (#445). Renders
 * the v1alpha2 stream events `useCombatLog` collects (attack rolls, damage,
 * status changes, turn cycle, death, encounter end) as a scrolling log — the
 * old combat-v2 CombatHistorySidebar's "📜 Combat Log" rebuilt on the push
 * model, matching its spirit (scrolling, newest visible, round-tagged), not
 * its code.
 *
 * Server text verbatim: every line reads straight off the proto event fields
 * `useCombatLog` already stored (entity ids, rolls, refs) — nothing here
 * recomputes a roll, total, or hit/miss verdict.
 */

import { useEffect, useRef } from 'react';
import type { CombatLogEntry } from '../../hooks/useCombatLog';
import { formatSourceRefs } from '../../utils/combatFormat';
import { getConditionDisplay } from '../../utils/conditionIcons';

export interface CombatLogProps {
  entries: CombatLogEntry[];
}

export function CombatLog({ entries }: CombatLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest entry, mirroring the old sidebar's behavior.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  return (
    <div
      data-testid="combat-log"
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-secondary, #1a1a1a)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          opacity: 0.8,
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        📜 Combat Log
      </div>
      <div
        ref={scrollRef}
        data-testid="combat-log-scroll"
        style={{
          overflowY: 'auto',
          maxHeight: 200,
          padding: '6px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          fontSize: 12,
          fontFamily: 'monospace',
        }}
      >
        {entries.length === 0 ? (
          <div style={{ opacity: 0.5, padding: '8px 0' }}>
            The fight hasn&apos;t started yet…
          </div>
        ) : (
          entries.map((entry) => <CombatLogLine key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}

function CombatLogLine({ entry }: { entry: CombatLogEntry }) {
  return (
    <div
      data-testid={`combat-log-entry-${entry.kind}-${entry.id}`}
      style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}
    >
      <span style={{ opacity: 0.4, fontSize: 10, flexShrink: 0 }}>
        R{entry.round}
      </span>
      <span style={lineStyle(entry)}>{lineText(entry)}</span>
    </div>
  );
}

function lineStyle(entry: CombatLogEntry): React.CSSProperties {
  switch (entry.kind) {
    case 'attack':
      return {
        color: entry.event.critical
          ? '#facc15'
          : entry.event.hit
            ? '#f87171'
            : '#9ca3af',
      };
    case 'damage':
      return { color: '#f87171' };
    case 'statusApplied':
      return { color: '#f59e0b' };
    case 'statusRemoved':
      return { color: '#9ca3af' };
    case 'turnStarted':
      return { color: '#60a5fa' };
    case 'turnEnded':
      return { opacity: 0.6 };
    case 'died':
      return { color: '#ef4444', fontWeight: 700 };
    case 'removed':
      return { opacity: 0.6 };
    case 'encounterEnded':
      return { color: '#facc15', fontWeight: 700 };
  }
}

function lineText(entry: CombatLogEntry): string {
  switch (entry.kind) {
    case 'attack': {
      const e = entry.event;
      const outcome = e.critical ? 'CRIT' : e.hit ? 'HIT' : 'MISS';
      const advPart = e.hasAdvantage
        ? ` [adv: ${formatSourceRefs(e.advantageSources) || '?'}]`
        : '';
      const disadvPart = e.hasDisadvantage
        ? ` [disadv: ${formatSourceRefs(e.disadvantageSources) || '?'}]`
        : '';
      return (
        `⚔️ ${e.attackerEntityId} → ${e.targetEntityId}: ${outcome} ` +
        `(${e.attackRoll}+${e.attackBonus} vs AC ${e.targetAc})${advPart}${disadvPart}`
      );
    }
    case 'damage': {
      const e = entry.event;
      const hp = e.hpAfter ? ` (hp ${e.hpAfter.current}/${e.hpAfter.max})` : '';
      const breakdown =
        e.damageBreakdown.length > 0
          ? ' [' +
            e.damageBreakdown
              .map((c) => `${c.source}:${c.amount}${c.isCritical ? '‡' : ''}`)
              .join(', ') +
            ']'
          : '';
      const dmgType = e.damageType?.id ? ` ${e.damageType.id}` : '';
      return `💥 ${e.entityId} takes ${e.amount}${dmgType} damage${breakdown}${hp}`;
    }
    case 'statusApplied': {
      const e = entry.event;
      const id = e.status?.source?.id ?? '?';
      const display = getConditionDisplay(id);
      const from = e.sourceEntityId ? ` (from ${e.sourceEntityId})` : '';
      return `${display.icon} ${e.entityId} is ${display.label}${from}`;
    }
    case 'statusRemoved': {
      const e = entry.event;
      const id = e.statusSource?.id ?? '?';
      const display = getConditionDisplay(id);
      return `${display.icon} ${e.entityId} is no longer ${display.label}`;
    }
    case 'turnStarted':
      return `⏳ Round ${entry.event.round} — ${entry.event.entityId}'s turn`;
    case 'turnEnded':
      return `↩️ ${entry.event.entityId} ends turn`;
    case 'died': {
      const e = entry.event;
      const killer = e.killerEntityId ? ` by ${e.killerEntityId}` : '';
      return `☠️ ${e.entityId} dies${killer}`;
    }
    case 'removed':
      return `🗑️ ${entry.event.entityId} removed (${entry.event.reason})`;
    case 'encounterEnded':
      return `🏆 Encounter ended: ${entry.event.reason}`;
  }
}
