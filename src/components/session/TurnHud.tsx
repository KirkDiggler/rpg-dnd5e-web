/**
 * TurnHud — render-only HTML overlay for the turn economy (rpg-dnd5e-
 * web#762 slice 5a). Kirk's ruling on toolkit#1138: "backend tells dumb
 * client what it can do... we hand shapes for action, bonus and reaction
 * that lined up with the various things we could do. that was really
 * nice." This component only turns `useTurnHud`'s pure `TurnHudSelection`
 * into three CSS silhouettes (lit vs dim) and a declaration list — every
 * decision about WHAT to light lives in `turnHud.ts`, the same split
 * `MoveIndicator`/`moveIndicator.ts` already use on this route. The
 * silhouettes/row text themselves live in `turnShapes.tsx`, shared with
 * `CombatPanel.tsx` (rpg-dnd5e-web#762's later "grow the HUD into a
 * panel" pass) so the two never draw "lit" two different ways.
 *
 * HTML overlay, not inside the Canvas (unlike `MoveIndicator`, which
 * decorates the 3D floor) — a turn-economy readout is UI chrome, not a
 * thing that exists in the scene. Anchored bottom-left so it never
 * competes with `SessionEncounterView`'s own top-left Back/Walking status
 * line for the same screen region.
 *
 * STILL USED STANDALONE where a caller wants just the shapes (no turn
 * order/actions/beat line) — `CombatPanel` is the fuller picture
 * `SessionEncounterView` actually renders on the session route today; this
 * component and its own tests stay as the focused, independently-verified
 * building block underneath it.
 */
import { Shape } from './Shape';
import type { TurnHudSelection } from './turnHud';
import { declarationRowText, SHAPE_ORDER } from './turnShapeText';

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 12,
  left: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '8px 12px',
  background: 'var(--bg-secondary, rgba(0, 0, 0, 0.55))',
  border: '1px solid var(--border-primary, rgba(255, 255, 255, 0.12))',
  borderRadius: 8,
  color: 'var(--text-primary, #e5e7eb)',
  fontSize: 13,
  minWidth: 168,
  pointerEvents: 'none',
};

export interface TurnHudProps {
  selection: TurnHudSelection;
}

export function TurnHud({ selection }: TurnHudProps) {
  if (selection.mode === 'free-roam') {
    return (
      <div data-testid="turn-hud" style={overlayStyle}>
        <span
          data-testid="turn-hud-free-roam-pill"
          style={{
            alignSelf: 'flex-start',
            padding: '2px 10px',
            borderRadius: 999,
            background: 'var(--bg-tertiary, rgba(255, 255, 255, 0.12))',
            color: 'var(--text-secondary, #aaa)',
          }}
        >
          Free roam
        </span>
      </div>
    );
  }

  return (
    <div data-testid="turn-hud" style={overlayStyle}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {SHAPE_ORDER.map((slotName) => {
          const shape = selection.shapes.find((s) => s.slot === slotName);
          return (
            <Shape key={slotName} slot={slotName} lit={shape?.lit ?? false} />
          );
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {selection.declarations.map((row, i) => (
          <span
            key={i}
            data-testid="turn-hud-declaration-row"
            style={{
              color: row.affordable
                ? 'var(--text-primary, #e5e7eb)'
                : 'var(--color-error, #f87171)',
            }}
          >
            {declarationRowText(row)}
          </span>
        ))}
      </div>
    </div>
  );
}
