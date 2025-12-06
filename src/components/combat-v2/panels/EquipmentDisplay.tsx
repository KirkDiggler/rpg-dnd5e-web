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
    <div className={styles.equipmentDisplay}>
      <WeaponSlot
        slot="mainHand"
        label="Main Hand"
        item={mainHand}
        onClick={onWeaponClick}
        disabled={disabled}
      />
      <WeaponSlot
        slot="offHand"
        label="Off Hand"
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

function WeaponSlot({ slot, label, item, onClick, disabled }: WeaponSlotProps) {
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
    // Check if it's armor or shield by name
    const name = item.itemId.toLowerCase();
    if (name.includes('shield')) return '🛡️';
    if (
      name.includes('armor') ||
      name.includes('mail') ||
      name.includes('plate')
    )
      return '🛡️';
    return '📦'; // Generic item
  };

  return (
    <div
      className={`${styles.weaponSlot} ${isEmpty ? styles.weaponSlotEmpty : ''} ${isClickable ? styles.weaponSlotClickable : ''} ${disabled ? styles.weaponSlotDisabled : ''}`}
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
    >
      <div className={styles.weaponSlotHeader}>
        <span className={styles.weaponSlotIcon}>{getItemIcon()}</span>
        <span className={styles.weaponSlotLabel}>{label}</span>
      </div>

      {isEmpty ? (
        <div className={styles.weaponSlotContent}>
          <span className={styles.weaponSlotEmpty}>Empty</span>
        </div>
      ) : isWeapon ? (
        <div className={styles.weaponSlotContent}>
          <div className={styles.weaponName}>
            {equipment?.name || item.itemId}
          </div>
          <div className={styles.weaponDamage}>
            {weaponData.damageDice}{' '}
            {getDamageTypeDisplay(weaponData.damageType)}
          </div>
        </div>
      ) : (
        <div className={styles.weaponSlotContent}>
          <div className={styles.weaponName}>
            {equipment?.name || item.itemId}
          </div>
          <div
            className={styles.weaponDamage}
            style={{ color: 'var(--text-muted)' }}
          >
            {equipment?.equipmentData?.case === 'armorData' ? 'Armor' : 'Item'}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Convert DamageType enum to display string
 */
function getDamageTypeDisplay(damageType: DamageType): string {
  const damageTypeMap: Record<DamageType, string> = {
    [DamageType.UNSPECIFIED]: 'unspecified',
    [DamageType.BLUDGEONING]: 'bludgeoning',
    [DamageType.PIERCING]: 'piercing',
    [DamageType.SLASHING]: 'slashing',
    [DamageType.ACID]: 'acid',
    [DamageType.COLD]: 'cold',
    [DamageType.FIRE]: 'fire',
    [DamageType.FORCE]: 'force',
    [DamageType.LIGHTNING]: 'lightning',
    [DamageType.NECROTIC]: 'necrotic',
    [DamageType.POISON]: 'poison',
    [DamageType.PSYCHIC]: 'psychic',
    [DamageType.RADIANT]: 'radiant',
    [DamageType.THUNDER]: 'thunder',
  };

  return damageTypeMap[damageType] || 'unknown';
}
