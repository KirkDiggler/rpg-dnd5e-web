/**
 * EncounterDockConcept — visual harness for verifying EncounterDock's
 * responsive behavior (rpg-dnd5e-web#494) across viewport widths without
 * needing a live rpg-api + Redis + Envoy stack. Representative mock data
 * (a populated combat log, several actions across economy slots, status
 * badges) so the wrap/shrink behavior can be checked against realistic
 * content, not just an empty dock. Resize the browser (or Chrome DevTools
 * device toolbar) narrower to see identity/actions/log wrap, then stack.
 * Deliberately no hardcoded breakpoint here (Copilot review #496 caught a
 * stale ~604px figure that measured wrong against real content) — the
 * actual wrap width is a function of this fixture's specific text
 * (name/class/action-label lengths), not a fixed constant; it'll measure
 * differently against other mock data or the real encounter's data.
 *
 * Not wired to any real state — mirrors the same fixture-building pattern
 * CombatLog.test.tsx and actionMenuHelpers.test.ts already use for proto
 * message mocks (`as never` / `as unknown as T`).
 */

import type {
  ActionEconomy,
  AvailableAction,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import {
  EconomySlot,
  EncounterMode,
  TargetKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { EncounterDock } from '../../components/game/EncounterDock';
import type { CombatLogEntry } from '../../hooks/useCombatLog';
import type { EntityStatus } from '../../hooks/useEncounterState';

const mockEconomy: ActionEconomy = {
  actionsRemaining: 1,
  bonusActionsRemaining: 1,
  reactionsRemaining: 1,
  movementRemaining: 15,
  capacities: {},
} as unknown as ActionEconomy;

function action(
  id: string,
  displayName: string,
  slot: EconomySlot
): AvailableAction {
  return {
    ref: { module: 'dnd5e', type: 'combat_abilities', id },
    displayName,
    available: true,
    unavailableReason: '',
    economySlot: slot,
    targetKind: TargetKind.SINGLE_ENTITY,
  } as unknown as AvailableAction;
}

const mockActions: AvailableAction[] = [
  action('attack', 'Attack', EconomySlot.ACTION),
  action('dodge', 'Dodge', EconomySlot.ACTION),
  action('second-wind', 'Second Wind', EconomySlot.BONUS_ACTION),
];

const mockStatuses: EntityStatus[] = [
  {
    source: { module: 'dnd5e', type: 'conditions', id: 'raging' },
    displayName: 'Raging',
  },
  {
    source: { module: 'dnd5e', type: 'conditions', id: 'prone' },
    displayName: 'Prone',
  },
];

function logEntry(
  id: number,
  attacker: string,
  target: string
): CombatLogEntry {
  return {
    id,
    round: 1,
    kind: 'attack',
    event: {
      attackerEntityId: attacker,
      targetEntityId: target,
      hit: id % 2 === 0,
      critical: false,
      attackRoll: 12 + id,
      attackBonus: 5,
      targetAc: 14,
      hasAdvantage: false,
      hasDisadvantage: false,
      advantageSources: [],
      disadvantageSources: [],
    } as never,
  };
}

const mockLogEntries: CombatLogEntry[] = [
  logEntry(0, 'char-alice', 'goblin-1'),
  logEntry(1, 'goblin-1', 'char-alice'),
  logEntry(2, 'char-alice', 'goblin-1'),
  logEntry(3, 'goblin-1', 'char-bob'),
  logEntry(4, 'char-bob', 'goblin-1'),
];

export function EncounterDockConcept() {
  return (
    <div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
        Resize the browser narrower to check EncounterDock's wrap behavior
        (rpg-dnd5e-web#494) — the exact width it wraps at depends on this
        fixture's content, not a fixed breakpoint. EncounterDock itself doesn't
        set position:fixed — that's EncounterView's wrapper — so it renders
        inline in this page's normal flow, which is enough to observe its own
        internal column wrap/shrink behavior. It does NOT reproduce
        EncounterView's map-starvation risk on short viewports (see
        EncounterDock.tsx's DOCK_MAX_HEIGHT_VH comment) — that needs a live
        encounter with the real portaled layout.
      </p>
      <EncounterDock
        entityId="char-alice"
        displayName="Alice"
        classRefId="rogue"
        hp={{ current: 12, max: 20 }}
        ac={14}
        statuses={mockStatuses}
        economy={mockEconomy}
        actions={mockActions}
        mode={EncounterMode.TURN_BASED}
        encounterEnded={false}
        isMyTurn={true}
        activeEntityName={undefined}
        actionsEnabled={true}
        actionsLoading={false}
        onSelectAction={() => {}}
        reactionReadiness={undefined}
        reactionLoading={false}
        reactionDisabled={false}
        onToggleReaction={() => {}}
        onEndTurn={() => {}}
        endTurnDisabled={false}
        endTurnLoading={false}
        combatLogEntries={mockLogEntries}
        // rpg-dnd5e-web#571: this bench verifies wrap/responsive behavior,
        // not the equipment chip — undefined hides it, same as any
        // non-CHARACTER entity or pre-snapshot render on the live screen.
        equipment={undefined}
        onEquipIntent={() => {}}
        equipLoading={false}
      />
    </div>
  );
}
