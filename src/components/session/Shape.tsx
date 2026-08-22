/**
 * Shape — one CSS-only action/bonus/reaction silhouette (circle/triangle/
 * diamond), lit vs dim. Shared between `TurnHud.tsx` and `CombatPanel.tsx`
 * (rpg-dnd5e-web#762 "grow the HUD into a panel") so the two never draw
 * "lit" two different ways. Text formatting for the row beside it lives
 * in `turnShapeText.ts` — split out because a `.tsx` file exporting both
 * a component and plain values breaks React Fast Refresh
 * (`react-refresh/only-export-components`).
 */
import type { TurnHudSlotName } from './turnHud';

const SHAPE_LABEL: Record<TurnHudSlotName, string> = {
  action: 'Action',
  bonus: 'Bonus',
  reaction: 'Reaction',
};

export function Shape({ slot, lit }: { slot: TurnHudSlotName; lit: boolean }) {
  const color = lit
    ? 'var(--accent-primary, #facc15)'
    : 'var(--text-muted, rgba(255, 255, 255, 0.25))';
  const label = `${SHAPE_LABEL[slot]} — ${lit ? 'ready' : 'not available'}`;

  let shape: React.ReactNode;
  if (slot === 'action') {
    // Circle.
    shape = (
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: color,
        }}
      />
    );
  } else if (slot === 'bonus') {
    // Triangle — a CSS border trick, no SVG/deps needed.
    shape = (
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderBottom: `16px solid ${color}`,
        }}
      />
    );
  } else {
    // Diamond — a rotated square.
    shape = (
      <div
        style={{
          width: 12,
          height: 12,
          transform: 'rotate(45deg)',
          background: color,
        }}
      />
    );
  }

  return (
    <div
      data-testid={`turn-hud-shape-${slot}`}
      data-lit={lit}
      title={label}
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
      }}
    >
      {shape}
    </div>
  );
}
