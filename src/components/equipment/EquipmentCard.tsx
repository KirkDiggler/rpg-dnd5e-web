import {
  ArmorCategory,
  DamageType,
  WeaponCategory,
  WeaponProperty,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import type { Equipment } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/equipment_types_pb';

// --- Enum formatting helpers ---

function formatDamageType(dt: DamageType): string {
  const map: Record<number, string> = {
    [DamageType.BLUDGEONING]: 'bludgeoning',
    [DamageType.PIERCING]: 'piercing',
    [DamageType.SLASHING]: 'slashing',
    [DamageType.FIRE]: 'fire',
    [DamageType.COLD]: 'cold',
    [DamageType.LIGHTNING]: 'lightning',
    [DamageType.THUNDER]: 'thunder',
    [DamageType.ACID]: 'acid',
    [DamageType.POISON]: 'poison',
    [DamageType.NECROTIC]: 'necrotic',
    [DamageType.RADIANT]: 'radiant',
    [DamageType.PSYCHIC]: 'psychic',
    [DamageType.FORCE]: 'force',
  };
  return map[dt] ?? 'unknown';
}

function formatWeaponCategory(wc: WeaponCategory): string {
  const map: Record<number, string> = {
    [WeaponCategory.SIMPLE]: 'Simple',
    [WeaponCategory.MARTIAL]: 'Martial',
    [WeaponCategory.IMPROVISED]: 'Improvised',
  };
  return map[wc] ?? 'Unknown';
}

function formatArmorCategory(ac: ArmorCategory): string {
  const map: Record<number, string> = {
    [ArmorCategory.LIGHT]: 'Light',
    [ArmorCategory.MEDIUM]: 'Medium',
    [ArmorCategory.HEAVY]: 'Heavy',
    [ArmorCategory.SHIELD]: 'Shield',
  };
  return map[ac] ?? 'Unknown';
}

function formatWeaponProperty(wp: WeaponProperty): string {
  const map: Record<number, string> = {
    [WeaponProperty.LIGHT]: 'Light',
    [WeaponProperty.FINESSE]: 'Finesse',
    [WeaponProperty.THROWN]: 'Thrown',
    [WeaponProperty.TWO_HANDED]: 'Two-Handed',
    [WeaponProperty.VERSATILE]: 'Versatile',
    [WeaponProperty.AMMUNITION]: 'Ammunition',
    [WeaponProperty.LOADING]: 'Loading',
    [WeaponProperty.HEAVY]: 'Heavy',
    [WeaponProperty.REACH]: 'Reach',
    [WeaponProperty.SPECIAL]: 'Special',
  };
  return map[wp] ?? 'Unknown';
}

// --- Styles ---

const tagStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  backgroundColor: 'var(--bg-tertiary)',
  borderRadius: '3px',
  fontSize: '11px',
  color: 'var(--text-secondary)',
  lineHeight: '1.4',
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

// --- Sub-renderers ---

function WeaponInfo({
  equipment,
  compact,
}: {
  equipment: Equipment;
  compact: boolean;
}) {
  if (equipment.equipmentData.case !== 'weaponData') return null;
  const weapon = equipment.equipmentData.value;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {/* Damage line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            fontSize: compact ? '13px' : '15px',
            fontWeight: 'bold',
            color: 'var(--text-primary)',
          }}
        >
          {weapon.damageDice} {formatDamageType(weapon.damageType)}
        </span>
        <span style={labelStyle}>
          {formatWeaponCategory(weapon.weaponCategory)}
        </span>
      </div>

      {/* Range for ranged weapons */}
      {weapon.normalRange > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          Range: {weapon.normalRange}/{weapon.longRange} ft
        </div>
      )}

      {/* Properties as tags */}
      {weapon.properties.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {weapon.properties
            .filter((p) => p !== WeaponProperty.UNSPECIFIED)
            .map((prop) => (
              <span key={prop} style={tagStyle}>
                {formatWeaponProperty(prop)}
              </span>
            ))}
        </div>
      )}

      {/* Weight footer */}
      {!compact && equipment.weight && equipment.weight.quantity > 0 && (
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          {equipment.weight.quantity} {equipment.weight.unit}
        </div>
      )}
    </div>
  );
}

function ArmorInfo({
  equipment,
  compact,
}: {
  equipment: Equipment;
  compact: boolean;
}) {
  if (equipment.equipmentData.case !== 'armorData') return null;
  const armor = equipment.equipmentData.value;

  // Build AC display string
  let acDisplay = `AC ${armor.baseAc}`;
  if (armor.dexBonus) {
    if (armor.hasDexLimit) {
      acDisplay += ` + Dex (max ${armor.maxDexBonus})`;
    } else {
      acDisplay += ' + Dex';
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {/* AC line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            fontSize: compact ? '13px' : '15px',
            fontWeight: 'bold',
            color: 'var(--text-primary)',
          }}
        >
          {acDisplay}
        </span>
        <span style={labelStyle}>
          {formatArmorCategory(armor.armorCategory)}
        </span>
      </div>

      {/* Flags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {armor.stealthDisadvantage && (
          <span style={{ ...tagStyle, color: 'var(--accent-primary)' }}>
            Stealth Disadvantage
          </span>
        )}
        {armor.strMinimum > 0 && (
          <span style={tagStyle}>Str {armor.strMinimum} required</span>
        )}
      </div>

      {/* Weight footer */}
      {!compact && equipment.weight && equipment.weight.quantity > 0 && (
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          {equipment.weight.quantity} {equipment.weight.unit}
        </div>
      )}
    </div>
  );
}

function GearInfo({
  equipment,
  compact,
}: {
  equipment: Equipment;
  compact: boolean;
}) {
  return (
    <div>
      {!compact && equipment.weight && equipment.weight.quantity > 0 && (
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          {equipment.weight.quantity} {equipment.weight.unit}
        </div>
      )}
    </div>
  );
}

// --- Main component ---

interface EquipmentCardProps {
  equipment: Equipment;
  compact?: boolean;
}

export function EquipmentCard({
  equipment,
  compact = false,
}: EquipmentCardProps) {
  const containerStyle: React.CSSProperties = {
    padding: compact ? '8px 10px' : '12px 16px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-primary)',
    borderRadius: '6px',
  };

  return (
    <div style={containerStyle}>
      {/* Name */}
      <div
        style={{
          fontWeight: 'bold',
          fontSize: compact ? '13px' : '14px',
          color: 'var(--text-primary)',
          marginBottom: '4px',
        }}
      >
        {equipment.name}
      </div>

      {/* Type-specific content */}
      {equipment.equipmentData.case === 'weaponData' && (
        <WeaponInfo equipment={equipment} compact={compact} />
      )}
      {equipment.equipmentData.case === 'armorData' && (
        <ArmorInfo equipment={equipment} compact={compact} />
      )}
      {equipment.equipmentData.case !== 'weaponData' &&
        equipment.equipmentData.case !== 'armorData' && (
          <GearInfo equipment={equipment} compact={compact} />
        )}
    </div>
  );
}
