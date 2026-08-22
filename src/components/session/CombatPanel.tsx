/**
 * CombatPanel — render-only HTML overlay, the session route's actual
 * combat UI (rpg-dnd5e-web#762, "grow the HUD into a panel" — Kirk,
 * live-walking PR #769: "well I am 4 spaces away but it stays attack
 * ready and i see nothign happen. what was our plan here? I do not have
 * a panel, I cannot end turn or even see whose turn it is"). Every
 * decision about what's enabled/lit/shown lives in `combatPanel.ts`
 * (composing `turnHud.ts`) and `useCombatPanel.ts`; this component only
 * draws `CombatPanelSelection` and reports clicks — same split every
 * other piece of this route keeps (`MoveIndicator`/`moveIndicator.ts`,
 * `TurnHud`/`turnHud.ts`).
 *
 * Replaces `TurnHud` in `SessionEncounterView`'s own render (that
 * component and its tests stay as the focused building block underneath
 * this one — see its own doc comment). Same bottom-left anchor, same
 * free-roam pill when there's nothing to fight.
 *
 * ATTACK HAS NO REACH CHECK. `AttackRequest`'s own doc comment: the
 * engine does not enforce reach/adjacency today (toolkit#1010, deferred
 * to the movement wave) — attacking from across the room is exactly what
 * the server currently allows, so the Attack button is never disabled for
 * distance. The client renders what the API allows; it does not
 * calculate rules.
 */
import type {
  CombatPanelOrderEntry,
  CombatPanelSelection,
} from './combatPanel';
import { Shape } from './Shape';
import { declarationRowText, SHAPE_ORDER } from './turnShapeText';

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

function OrderChip({ entry }: { entry: CombatPanelOrderEntry }) {
  return (
    <span
      data-testid="combat-panel-order-chip"
      data-active={entry.isActive}
      data-you={entry.isYou}
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
      }}
    >
      {entry.id}
      {entry.isYou ? ' (you)' : ''}
    </span>
  );
}

function ActionButton({
  testId,
  label,
  gate,
  onClick,
  busy,
}: {
  testId: string;
  label: string;
  gate: { enabled: boolean; reason: string | null };
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={!gate.enabled || busy}
      title={gate.reason ?? undefined}
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 6,
        border: '1px solid var(--border-primary, rgba(255, 255, 255, 0.2))',
        background:
          gate.enabled && !busy
            ? 'var(--accent-primary, #facc15)'
            : 'var(--bg-tertiary, rgba(255, 255, 255, 0.08))',
        color:
          gate.enabled && !busy
            ? 'var(--bg-primary, #0a0a0a)'
            : 'var(--text-muted, rgba(255, 255, 255, 0.4))',
        cursor: gate.enabled && !busy ? 'pointer' : 'not-allowed',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}

export interface CombatPanelProps {
  selection: CombatPanelSelection;
  onAttackClick: () => void;
  onEndTurnClick: () => void;
  attacking: boolean;
  endingTurn: boolean;
}

export function CombatPanel({
  selection,
  onAttackClick,
  onEndTurnClick,
  attacking,
  endingTurn,
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
      </div>
    );
  }

  return (
    <div data-testid="combat-panel" style={overlayStyle}>
      <div
        data-testid="combat-panel-round"
        style={{ fontSize: 12, color: 'var(--text-secondary, #aaa)' }}
      >
        Round {selection.round}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {selection.order.map((entry) => (
          <OrderChip key={entry.id} entry={entry} />
        ))}
      </div>

      {selection.waitingOn && (
        <div
          data-testid="combat-panel-waiting-on"
          style={{ color: 'var(--text-secondary, #aaa)' }}
        >
          Waiting on {selection.waitingOn}.
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

      <div
        data-testid="combat-panel-target"
        style={{ color: 'var(--text-secondary, #aaa)' }}
      >
        {selection.selectedTargetId
          ? `Target: ${selection.selectedTargetId}`
          : 'No target selected'}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <ActionButton
          testId="combat-panel-attack-button"
          label="Attack"
          gate={selection.attack}
          onClick={onAttackClick}
          busy={attacking}
        />
        <ActionButton
          testId="combat-panel-end-turn-button"
          label="End Turn"
          gate={selection.endTurn}
          onClick={onEndTurnClick}
          busy={endingTurn}
        />
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
