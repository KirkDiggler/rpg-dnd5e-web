/**
 * CombatPanel — render-only HTML overlay, the session route's actual
 * combat UI (rpg-project#249, rpg-dnd5e-web#762/#525/#533). Every
 * decision about what's enabled/lit/shown lives in `combatPanel.ts`
 * (composing `turnHud.ts`) and `useCombatPanel.ts`; this component only
 * draws `CombatPanelSelection` and reports clicks — same split every
 * other piece of this route keeps (`MoveIndicator`/`moveIndicator.ts`,
 * `TurnHud`/`turnHud.ts`).
 *
 * ATTACK IS A FLOOR GESTURE, NOT A PANEL BUTTON (`combatPanel.ts`'s own
 * doc comment) — this panel shows the shapes, the movement bound, who's
 * in reach (via the floor highlight, not drawn here), the hover/target
 * label, and End Turn as the one consequential button. Reach is never
 * computed here or anywhere client-side — every affordance in
 * `selection` already answers "can I" from the wire.
 */
import type {
  CombatPanelParticipant,
  CombatPanelSelection,
} from './combatPanel';
import { Shape } from './Shape';
import { SHAPE_ORDER } from './turnShapeText';

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 12,
  left: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '10px 14px',
  background: 'var(--bg-secondary, rgba(0, 0, 0, 0.6))',
  border: '1px solid var(--border-primary, rgba(255, 255, 255, 0.12))',
  borderRadius: 8,
  color: 'var(--text-primary, #e5e7eb)',
  fontSize: 13,
  minWidth: 220,
  maxWidth: 320,
};

function ParticipantChip({ entry }: { entry: CombatPanelParticipant }) {
  return (
    <span
      data-testid="combat-panel-participant"
      data-active={entry.isActive}
      data-you={entry.isYou}
      data-downed={entry.isDowned}
      style={{
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        background: entry.isActive
          ? 'var(--accent-primary, #facc15)'
          : 'var(--bg-tertiary, rgba(255, 255, 255, 0.1))',
        color: entry.isActive
          ? 'var(--bg-primary, #0a0a0a)'
          : 'var(--text-secondary, #aaa)',
        fontWeight: entry.isActive ? 700 : 400,
        border: entry.isYou
          ? '1px solid var(--accent-primary, #facc15)'
          : '1px solid transparent',
        textDecoration: entry.isDowned ? 'line-through' : undefined,
        opacity: entry.isDowned ? 0.6 : 1,
      }}
    >
      {entry.name}
      {entry.isYou ? ' (you)' : ''}
      {entry.isDowned ? ' — downed' : ''}
    </span>
  );
}

function ActionButton({
  testId,
  label,
  enabled,
  reason,
  onClick,
  busy,
}: {
  testId: string;
  label: string;
  enabled: boolean;
  reason: string | null;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={!enabled || busy}
      title={reason ?? undefined}
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 6,
        border: '1px solid var(--border-primary, rgba(255, 255, 255, 0.2))',
        background:
          enabled && !busy
            ? 'var(--accent-primary, #facc15)'
            : 'var(--bg-tertiary, rgba(255, 255, 255, 0.08))',
        color:
          enabled && !busy
            ? 'var(--bg-primary, #0a0a0a)'
            : 'var(--text-muted, rgba(255, 255, 255, 0.4))',
        cursor: enabled && !busy ? 'pointer' : 'not-allowed',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}

/** "Movement: 15 ft", dim once fewer than five feet remain —
 * `combatPanel.ts`'s own `moveMaxCells` already reads 0 there, so this
 * only needs the display text. `null` (no Move declaration on the wire
 * yet) renders nothing. */
function MovementRow({
  movement,
}: {
  movement: { remainingFeet: number; affordable: boolean } | null;
}) {
  if (!movement) return null;
  return (
    <div
      data-testid="combat-panel-movement"
      style={{
        color: movement.affordable
          ? 'var(--text-primary, #e5e7eb)'
          : 'var(--text-muted, rgba(255, 255, 255, 0.4))',
      }}
    >
      Movement: {movement.remainingFeet} ft
    </div>
  );
}

export interface CombatPanelProps {
  selection: CombatPanelSelection;
  /** "Your turn!" for a beat when your own turn starts — `null`
   * otherwise (web#533's turn-start orientation). */
  turnStartedBanner: string | null;
  onEndTurnClick: () => void;
  endingTurn: boolean;
  /** Opens the equipment screen (rpg-project#249 §4, reusing web#571's
   * component). `undefined` hides the entry point entirely. */
  onOpenEquipment?: () => void;
}

export function CombatPanel({
  selection,
  turnStartedBanner,
  onEndTurnClick,
  endingTurn,
  onOpenEquipment,
}: CombatPanelProps) {
  if (selection.mode === 'free-roam') {
    return (
      <div data-testid="combat-panel" style={overlayStyle}>
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
        {onOpenEquipment && (
          <button
            type="button"
            data-testid="combat-panel-equipment-button"
            onClick={onOpenEquipment}
            style={{
              alignSelf: 'flex-start',
              padding: '4px 10px',
              borderRadius: 6,
              border:
                '1px solid var(--border-primary, rgba(255, 255, 255, 0.2))',
              background: 'var(--bg-tertiary, rgba(255, 255, 255, 0.08))',
              color: 'var(--text-primary, #e5e7eb)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Equipment
          </button>
        )}
      </div>
    );
  }

  // The hover label wins over the generic "no target in reach" note —
  // both are "what happens if I click right now" style text, and only
  // one applies at a time (a hover only exists when something's under
  // the cursor, which is exactly when attackTargets is non-empty).
  const affordanceLine = selection.hoverLabel ?? selection.noTargetInReachText;

  const actionHint = selection.attackTargets.some((t) => t.affordable)
    ? 'Click a highlighted enemy to attack, or click the floor to move.'
    : 'Click the floor to move.';

  return (
    <div data-testid="combat-panel" style={overlayStyle}>
      {turnStartedBanner && (
        <div
          data-testid="combat-panel-turn-started"
          style={{
            fontWeight: 700,
            color: 'var(--accent-primary, #facc15)',
          }}
        >
          {turnStartedBanner}
        </div>
      )}

      <div
        data-testid="combat-panel-round"
        style={{ fontSize: 12, color: 'var(--text-secondary, #aaa)' }}
      >
        Round {selection.round}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {selection.participants.map((entry) => (
          <ParticipantChip key={entry.id} entry={entry} />
        ))}
      </div>

      {selection.waitingOnName && (
        <div
          data-testid="combat-panel-waiting-on"
          style={{ color: 'var(--text-secondary, #aaa)' }}
        >
          {selection.waitingOnName}&rsquo;s turn.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {SHAPE_ORDER.map((slotName) => {
          const shape = selection.shapes.find((s) => s.slot === slotName);
          return (
            <Shape key={slotName} slot={slotName} lit={shape?.lit ?? false} />
          );
        })}
      </div>
      <MovementRow movement={selection.movement} />

      {!selection.waitingOnName && (
        <div
          data-testid="combat-panel-action-hint"
          style={{ color: 'var(--text-secondary, #aaa)', fontSize: 12 }}
        >
          {actionHint}
        </div>
      )}

      {affordanceLine && (
        <div
          data-testid="combat-panel-hover"
          style={{ color: 'var(--text-primary, #e5e7eb)', fontWeight: 600 }}
        >
          {affordanceLine}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <ActionButton
          testId="combat-panel-end-turn-button"
          label="End Turn"
          enabled={selection.endTurn.enabled}
          reason={selection.endTurn.reason}
          onClick={onEndTurnClick}
          busy={endingTurn}
        />
        {onOpenEquipment && (
          <button
            type="button"
            data-testid="combat-panel-equipment-button"
            onClick={onOpenEquipment}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border:
                '1px solid var(--border-primary, rgba(255, 255, 255, 0.2))',
              background: 'var(--bg-tertiary, rgba(255, 255, 255, 0.08))',
              color: 'var(--text-primary, #e5e7eb)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Equipment
          </button>
        )}
      </div>

      {selection.lastBeat && (
        <div
          data-testid="combat-panel-beat-line"
          style={{
            borderTop:
              '1px solid var(--border-primary, rgba(255,255,255,0.12))',
            paddingTop: 6,
            color: 'var(--text-primary, #e5e7eb)',
          }}
        >
          {selection.lastBeat}
        </div>
      )}
    </div>
  );
}
