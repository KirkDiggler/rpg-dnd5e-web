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
import { CONCEPT_LOG_ENTRIES } from '../combat-panel/logFixtures';

export interface DiceTrayEncounterPreviewProps {
  tray: React.ReactNode;
}

const economy = {
  actionsRemaining: 1,
  bonusActionsRemaining: 1,
  reactionsRemaining: 1,
  movementRemaining: 25,
  capacities: {},
} as unknown as ActionEconomy;

function action(
  id: string,
  displayName: string,
  slot: EconomySlot,
  targetKind: TargetKind = TargetKind.SINGLE_ENTITY
): AvailableAction {
  return {
    ref: { module: 'dnd5e', type: 'combat_abilities', id },
    displayName,
    available: true,
    unavailableReason: '',
    economySlot: slot,
    targetKind,
  } as unknown as AvailableAction;
}

const actions = [
  action('attack', 'Attack', EconomySlot.ACTION),
  action('dodge', 'Dodge', EconomySlot.ACTION, TargetKind.NONE),
  action(
    'second-wind',
    'Second Wind',
    EconomySlot.BONUS_ACTION,
    TargetKind.SELF
  ),
];

const inert = () => {};

export function DiceTrayEncounterPreview({
  tray,
}: DiceTrayEncounterPreviewProps) {
  return (
    <section
      className="dice-tray-encounter-preview"
      data-testid="dice-tray-encounter-preview"
      aria-label="Fixture gameplay preview"
    >
      <div
        className="dice-tray-encounter-preview__map-boundary"
        data-testid="dice-tray-map-boundary"
      >
        <div
          className="dice-tray-encounter-preview__map"
          data-testid="dice-tray-neutral-map"
        >
          <span aria-hidden="true">Neutral encounter map</span>
        </div>
        <aside
          className="dice-tray-left-drawer"
          data-testid="dice-tray-left-drawer"
          aria-label="Always visible dice drawer"
        >
          <div
            className="dice-tray-left-drawer__rail"
            data-testid="dice-tray-drawer-rail"
            aria-hidden="true"
          />
          <div
            className="dice-tray-left-drawer__carcass"
            data-testid="dice-tray-drawer-carcass"
          >
            <p className="dice-tray-left-drawer__status">
              Always visible · dice only
            </p>
            <div className="dice-tray-left-drawer__bed">{tray}</div>
            <div
              className="dice-tray-left-drawer__front"
              data-testid="dice-tray-drawer-front"
              aria-hidden="true"
            >
              <span
                className="dice-tray-left-drawer__handle"
                data-testid="dice-tray-drawer-handle"
                aria-hidden="true"
              />
            </div>
          </div>
        </aside>
      </div>
      <div className="dice-tray-encounter-preview__dock">
        <EncounterDock
          entityId="char-alice"
          displayName="Alice"
          classRefId="fighter"
          hp={{ current: 22, max: 28 }}
          ac={16}
          statuses={[]}
          economy={economy}
          actions={actions}
          mode={EncounterMode.TURN_BASED}
          encounterEnded={false}
          isMyTurn
          activeEntityName={undefined}
          actionsEnabled
          actionsLoading={false}
          onSelectAction={inert}
          reactionReadiness={undefined}
          reactionLoading={false}
          reactionDisabled={false}
          onToggleReaction={inert}
          onEndTurn={inert}
          endTurnDisabled={false}
          endTurnLoading={false}
          combatLogEntries={CONCEPT_LOG_ENTRIES}
          equipment={undefined}
          onEquipIntent={inert}
          equipLoading={false}
        />
      </div>
    </section>
  );
}
