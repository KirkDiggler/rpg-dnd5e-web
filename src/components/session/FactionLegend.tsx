/**
 * FactionLegend — which colour is which side (rpg-project#375 §7). A
 * member coloured by faction is a puzzle without a key, and the roster is
 * the only per-member row that carries the faction, so the key is read
 * off the roster and nothing else.
 *
 * RENDERS NOTHING for a dungeon that declares no faction: every member is
 * `party` or `monsters`, both of which have always been blue and red, and
 * the screen must look exactly as it did before factions existed. The
 * legend appears the first time a declared side is on the roster, and it
 * lists the reserved sides beside it so the reader sees the whole table.
 */
import type { PublicMemberInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  factionColors,
  SIDE_COLORS,
  sideCounts,
  sidesOnRoster,
} from './factionColor';
import { authoredWords } from './holdingBeat';

export interface FactionLegendProps {
  roster: ReadonlyMap<string, PublicMemberInfo>;
}

export function FactionLegend({ roster }: FactionLegendProps) {
  const colors = factionColors(roster);
  if (colors.size === 0) return null;
  const counts = sideCounts(roster);
  return (
    <div
      data-testid="faction-legend"
      aria-label="sides"
      style={{
        position: 'absolute',
        left: 8,
        top: 8,
        zIndex: 5,
        display: 'flex',
        gap: 10,
        padding: '4px 8px',
        borderRadius: 6,
        background: 'rgba(0, 0, 0, 0.55)',
        color: '#e5e7eb',
        fontSize: 12,
        pointerEvents: 'none',
      }}
    >
      {sidesOnRoster(roster).map((side) => {
        const color = colors.get(side) ?? SIDE_COLORS[side] ?? '#a0aec0';
        return (
          <span
            key={side}
            data-testid={`faction-legend-${side}`}
            data-color={color}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <i
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: 999,
                background: color,
              }}
            />
            {authoredWords(side)} · {counts.get(side) ?? 0}
          </span>
        );
      })}
    </div>
  );
}
