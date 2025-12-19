import type {
  Character,
  InventoryItem,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { DamageType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import styles from '../styles/combat.module.css';

export interface EquipmentDisplayProps {
  character: Character;
  onWeaponClick?: (slot: 'mainHand' | 'offHand') => void;
  disabled?: boolean;
}

/**
 * EquipmentDisplay - Shows equipped weapons with clickable attack functionality
 *
 * This component displays:
 * 1. Main hand weapon slot - weapon name, damage dice, damage type
 * 2. Off hand weapon slot - same display (or "Empty" if nothing equipped)
 * 3. Clicking a weapon initiates an attack (via callback)
 *
 * Data source: character.equipmentSlots.mainHand/offHand
 * Each slot contains an InventoryItem with nested Equipment data
 */
export function EquipmentDisplay({
  character,
  onWeaponClick,
  disabled = false,
}: EquipmentDisplayProps) {
  const mainHand = character.equipmentSlots?.mainHand;
  const offHand = character.equipmentSlots?.offHand;

  return (
    <div className={styles.equipmentDisplayCompact}>
      <CompactWeaponSlot
        slot="mainHand"
        label="Main"
        item={mainHand}
        onClick={onWeaponClick}
        disabled={disabled}
      />
      <CompactWeaponSlot
        slot="offHand"
        label="Off"
        item={offHand}
        onClick={onWeaponClick}
        disabled={disabled}
      />
    </div>
  );
}

interface WeaponSlotProps {
  slot: 'mainHand' | 'offHand';
  label: string;
  item?: InventoryItem;
  onClick?: (slot: 'mainHand' | 'offHand') => void;
  disabled: boolean;
}

/** Compact inline weapon slot for space-efficient display */
function CompactWeaponSlot({
  slot,
  label,
  item,
  onClick,
  disabled,
}: WeaponSlotProps) {
  const equipment = item?.equipment;
  const weaponData =
    equipment?.equipmentData?.case === 'weaponData'
      ? equipment.equipmentData.value
      : undefined;

  const isEmpty = !item || !item.itemId;
  const isWeapon = !!weaponData;
  const isClickable = isWeapon && !disabled && onClick;

  const handleClick = () => {
    if (isClickable && onClick) {
      onClick(slot);
    }
  };

  // Determine icon based on item type
  const getItemIcon = () => {
    if (!item || !item.itemId) return '✋';
    if (weaponData) return '⚔️';
    const name = item.itemId.toLowerCase();
    if (name.includes('shield')) return '🛡️';
    if (
      name.includes('armor') ||
      name.includes('mail') ||
      name.includes('plate')
    )
      return '🛡️';
    return '📦';
  };

  const getDisplayName = () => {
    if (isEmpty) return 'Empty';
    return equipment?.name || item.itemId || 'Unknown';
  };

  const getDamageInfo = () => {
    if (!weaponData) return null;
    return `${weaponData.damageDice} ${getDamageTypeAbbrev(weaponData.damageType)}`;
  };

  return (
    <div
      className={`${styles.compactWeaponSlot} ${isClickable ? styles.compactWeaponSlotClickable : ''} ${disabled ? styles.compactWeaponSlotDisabled : ''} ${isEmpty ? styles.compactWeaponSlotEmpty : ''}`}
      onClick={handleClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      title={`${label} Hand: ${getDisplayName()}${getDamageInfo() ? ` (${getDamageInfo()})` : ''}`}
    >
      <span className={styles.compactWeaponIcon}>{getItemIcon()}</span>
      <span className={styles.compactWeaponLabel}>{label}</span>
      <span className={styles.compactWeaponName}>{getDisplayName()}</span>
      {getDamageInfo() && (
        <span className={styles.compactWeaponDamage}>{getDamageInfo()}</span>
      )}
    </div>
  );
}

/** Get abbreviated damage type */
function getDamageTypeAbbrev(damageType: DamageType): string {
  const abbrevMap: Record<DamageType, string> = {
    [DamageType.UNSPECIFIED]: '',
    [DamageType.BLUDGEONING]: 'bludg.',
    [DamageType.PIERCING]: 'pierc.',
    [DamageType.SLASHING]: 'slash.',
    [DamageType.ACID]: 'acid',
    [DamageType.COLD]: 'cold',
    [DamageType.FIRE]: 'fire',
    [DamageType.FORCE]: 'force',
    [DamageType.LIGHTNING]: 'light.',
    [DamageType.NECROTIC]: 'necro.',
    [DamageType.POISON]: 'poison',
    [DamageType.PSYCHIC]: 'psych.',
    [DamageType.RADIANT]: 'radi.',
    [DamageType.THUNDER]: 'thund.',
  };
  return abbrevMap[damageType] || '';
}
