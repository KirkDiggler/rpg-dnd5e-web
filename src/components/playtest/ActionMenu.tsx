/**
 * ActionMenu — renders the server-authored action menu (TakeAction wave #426).
 *
 * Consumes the `available_actions` list from the server-pushed TurnState
 * (TurnStateChanged event / snapshot). It:
 *   - groups entries by `economy_slot` (Action / Bonus Action / Reaction /
 *     Movement / Free),
 *   - DISABLES entries where `available === false` and shows the server's
 *     `unavailable_reason` (no client-side legality check — D7 / no-logic-in-web),
 *   - on click, hands the chosen action back to the harness which raises the
 *     targeting prompt per `target_kind` and dispatches TakeAction.
 *
 * The web computes NOTHING here — availability, reasons, slots, and target
 * kinds are all the server's verdict, rendered verbatim.
 */

import type { AvailableAction } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { getActionIconUrl } from '../../utils/actionIcons';
import {
  actionKey,
  economySlotLabel,
  groupActionsBySlot,
  targetKindLabel,
} from './actionMenuHelpers';

export interface ActionMenuProps {
  /** The server-authored available actions (from TurnState.available_actions). */
  actions: AvailableAction[];
  /** Whether the menu is interactive (TURN_BASED + local player's turn, not loading). */
  enabled: boolean;
  /** Whether a TakeAction RPC is currently in flight. */
  loading: boolean;
  /**
   * Invoked when an available action is clicked. The harness decides what to do
   * per the action's `target_kind` (raise a prompt or dispatch directly) — the
   * menu never inspects targeting rules itself.
   */
  onSelectAction: (action: AvailableAction) => void;
}

export function ActionMenu({
  actions,
  enabled,
  loading,
  onSelectAction,
}: ActionMenuProps) {
  const groups = groupActionsBySlot(actions);

  if (actions.length === 0) {
    return (
      <div
        data-testid="action-menu-empty"
        style={{ color: '#666', fontSize: 12, marginBottom: 8 }}
      >
        (no actions available — waiting for the server menu)
      </div>
    );
  }

  return (
    <div data-testid="action-menu" style={{ marginBottom: 8 }}>
      {groups.map(({ slot, actions: slotActions }) => (
        <div key={slot} style={{ marginBottom: 8 }}>
          <div
            style={{
              fontSize: 11,
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 4,
            }}
          >
            {economySlotLabel(slot)}
          </div>
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            {slotActions.map((action) => (
              <ActionMenuButton
                key={actionKey(action)}
                action={action}
                enabled={enabled}
                loading={loading}
                onSelectAction={onSelectAction}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface ActionMenuButtonProps {
  action: AvailableAction;
  enabled: boolean;
  loading: boolean;
  onSelectAction: (action: AvailableAction) => void;
}

function ActionMenuButton({
  action,
  enabled,
  loading,
  onSelectAction,
}: ActionMenuButtonProps) {
  // Disabled when the server says unavailable OR the turn/loading gate is off.
  // The unavailable_reason is the SERVER's string — rendered verbatim, never
  // composed client-side.
  const serverUnavailable = !action.available;
  const disabled = !enabled || loading || serverUnavailable;
  const title = serverUnavailable
    ? action.unavailableReason || 'unavailable'
    : `Take action (${targetKindLabel(action.targetKind)})`;
  // #497: icon-by-ref-id, following #473's status-icon precedent
  // (conditionIcons.ts) — undefined for any ref id outside the 9 shipped
  // action-bar icons (e.g. class features like Second Wind), which falls
  // back to text-only below, never a broken image.
  const iconUrl = getActionIconUrl(action.ref?.id ?? '');

  return (
    <button
      type="button"
      data-testid={`action-${actionKey(action)}`}
      data-available={String(action.available)}
      onClick={() => onSelectAction(action)}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        padding: '4px 10px',
        background: serverUnavailable
          ? '#2a2a2a'
          : enabled
            ? '#2a3a4a'
            : '#262626',
        color: serverUnavailable ? '#777' : enabled ? '#9cf' : '#666',
        border: `1px solid ${serverUnavailable ? '#444' : '#3a5a7a'}`,
        borderRadius: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'monospace',
        fontSize: 12,
        opacity: serverUnavailable ? 0.7 : 1,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {iconUrl && (
          // Decorative: the label right after it already carries the
          // semantics, same pattern as StatusBadgeList's ConditionBadge
          // (#467/#473 Copilot review).
          <img
            src={iconUrl}
            alt=""
            aria-hidden="true"
            width={16}
            height={16}
            style={{ display: 'inline-block', flexShrink: 0 }}
          />
        )}
        <span>{action.displayName || actionKey(action)}</span>
      </span>
      {serverUnavailable && action.unavailableReason && (
        <span
          data-testid={`action-reason-${actionKey(action)}`}
          style={{ fontSize: 10, color: '#a66', marginTop: 2 }}
        >
          {action.unavailableReason}
        </span>
      )}
    </button>
  );
}
