import type {
  Character,
  InventoryItem,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import styles from './features.module.css';

export interface EquipmentSlotsProps {
  /** Character whose equipment to display */
  character: Character;
}

/**
 * EquipmentSlots - Compact equipment display with icons and tooltips
 *
 * Shows:
 * - Main hand weapon icon
 * - Off hand weapon/shield icon
 *
 * Each slot is a small icon that shows the item name on hover.
 * Empty slots show a dimmed/outline icon.
 */
export function EquipmentSlots({ character }: EquipmentSlotsProps) {
  const slots = character.equipmentSlots;

  if (!slots) {
    return null;
  }

  return (
    <div className={styles.equipmentSlots}>
      <EquipmentSlotIcon
        item={slots.mainHand}
        slotName="Main Hand"
        emptyIcon="🗡️"
        filledIcon="⚔️"
      />
      <EquipmentSlotIcon
        item={slots.offHand}
        slotName="Off Hand"
        emptyIcon="🛡️"
        filledIcon="🛡️"
      />
    </div>
  );
}

interface EquipmentSlotIconProps {
  item: InventoryItem | undefined;
  slotName: string;
  emptyIcon: string;
  filledIcon: string;
}

function EquipmentSlotIcon({
  item,
  slotName,
  emptyIcon,
  filledIcon,
}: EquipmentSlotIconProps) {
  const isEmpty = !item || !item.equipment;
  const displayName = item?.customName || item?.equipment?.name || 'Empty';
  const icon = isEmpty ? emptyIcon : filledIcon;

  return (
    <div
      className={`${styles.equipmentSlot} ${isEmpty ? styles.equipmentSlotEmpty : ''}`}
      title={isEmpty ? `${slotName}: Empty` : `${slotName}: ${displayName}`}
    >
      <span className={styles.equipmentSlotIcon}>{icon}</span>
    </div>
  );
}
