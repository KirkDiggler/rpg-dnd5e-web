import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useState } from 'react';
import { Card } from '../../../components/ui/Card';

interface DnDEquipmentProps {
  character: Character;
  onShowModal?: (title: string, content: React.ReactNode) => void;
}

export function DnDEquipment({ character, onShowModal }: DnDEquipmentProps) {
  const [expanded, setExpanded] = useState(false);

  // Get actual equipment from character
  const equipment = character.inventory || [];
  const totalWeight = equipment.reduce(
    (sum, item) => sum + item.weight * item.quantity,
    0
  );

  const handleShowDetails = () => {
    const content = (
      <div className="space-y-4">
        <div
          className="grid grid-cols-4 gap-2 text-sm font-bold border-b pb-2"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <div style={{ color: 'var(--text-primary)' }}>Item</div>
          <div style={{ color: 'var(--text-primary)' }}>Type</div>
          <div style={{ color: 'var(--text-primary)' }}>Qty</div>
          <div style={{ color: 'var(--text-primary)' }}>Weight</div>
        </div>

        {equipment.map((item, index) => (
          <div
            key={index}
            className="grid grid-cols-4 gap-2 text-sm py-2 hover:bg-opacity-50 rounded cursor-pointer"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
            onClick={() => {
              // TODO: Show item details in nested modal
            }}
          >
            <div
              className="font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              {item.name}
            </div>
            <div style={{ color: 'var(--text-muted)' }}>{item.type}</div>
            <div style={{ color: 'var(--text-muted)' }}>{item.quantity}</div>
            <div style={{ color: 'var(--text-muted)' }}>
              {item.weight * item.quantity} lbs
            </div>
          </div>
        ))}

        <div
          className="border-t pt-3"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <div className="flex justify-between font-bold">
            <span style={{ color: 'var(--text-primary)' }}>Total Weight:</span>
            <span style={{ color: 'var(--text-primary)' }}>
              {totalWeight} lbs
            </span>
          </div>
          <div className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Carrying Capacity: {(character.abilityScores?.strength || 10) * 15}{' '}
            lbs
          </div>
        </div>
      </div>
    );

    if (onShowModal) {
      onShowModal('Equipment & Inventory', content);
    } else {
      setExpanded(!expanded);
    }
  };

  const weaponsAndArmor = equipment.filter(
    (item) => item.type === 'Weapon' || item.type === 'Armor'
  );
  const otherGear = equipment.filter(
    (item) => item.type !== 'Weapon' && item.type !== 'Armor'
  );

  return (
    <Card className="p-4">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={handleShowDetails}
      >
        <h4
          className="text-lg font-bold"
          style={{
            fontFamily: 'Cinzel, serif',
            color: 'var(--text-primary)',
          }}
        >
          EQUIPMENT
        </h4>
        <div
          className="text-sm px-2 py-1 rounded"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--text-button)',
          }}
        >
          {equipment.length} items
        </div>
      </div>

      {/* Quick Equipment Overview */}
      <div className="mt-3 space-y-3">
        {equipment.length === 0 ? (
          <div className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>
            No equipment
          </div>
        ) : (
          <>
            {/* Weapons & Armor */}
            <div>
              <h5
                className="text-sm font-bold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Weapons & Armor
              </h5>
              <div className="space-y-1">
                {weaponsAndArmor.slice(0, 3).map((item, index) => (
              <div key={index} className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-muted)' }}>{item.name}</span>
                <span style={{ color: 'var(--text-subtle)' }}>
                  {item.quantity > 1 ? `×${item.quantity}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Other Gear */}
        <div>
          <h5
            className="text-sm font-bold mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            Other Equipment
          </h5>
          <div className="space-y-1">
            {otherGear.slice(0, 3).map((item, index) => (
              <div key={index} className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-muted)' }}>{item.name}</span>
                <span style={{ color: 'var(--text-subtle)' }}>
                  {item.quantity > 1 ? `×${item.quantity}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

            {/* Weight Summary */}
            <div
              className="pt-2 border-t"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-primary)' }}>Total Weight:</span>
                <span
                  style={{
                    color:
                      totalWeight > (character.abilityScores?.strength || 10) * 15
                        ? 'var(--health)'
                        : 'var(--text-primary)',
                  }}
                >
                  {totalWeight} lbs
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Click indicator */}
      <div
        className="text-center mt-3 text-xs"
        style={{ color: 'var(--text-subtle)' }}
      >
        Click to view full inventory
      </div>

      {/* Expanded content (if modal not used) */}
      {expanded && !onShowModal && (
        <div
          className="mt-4 pt-4 border-t"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <div className="space-y-2">
            {equipment.map((item, index) => (
              <div
                key={index}
                className="flex justify-between items-center p-2 rounded"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <div>
                  <div
                    className="font-medium text-sm"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {item.name}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {item.type} • {item.weight * item.quantity} lbs
                  </div>
                </div>
                <div
                  className="text-sm font-bold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  ×{item.quantity}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
