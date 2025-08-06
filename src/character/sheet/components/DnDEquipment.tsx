import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useState } from 'react';
import { Card } from '../../../components/ui/Card';

interface DnDEquipmentProps {
  character: Character;
  onShowModal?: (title: string, content: React.ReactNode) => void;
}

export function DnDEquipment({ character, onShowModal }: DnDEquipmentProps) {
  const [expanded, setExpanded] = useState(false);

  // Get equipment from character inventory
  // Note: inventory items only contain itemId references, not full equipment data
  // TODO: Need to fetch actual equipment details using itemId from Equipment API
  const inventoryItems = character.inventory || [];

  // For now, show basic inventory info
  const handleShowDetails = () => {
    const content = (
      <div className="space-y-4">
        <div
          className="grid grid-cols-3 gap-2 text-sm font-bold border-b pb-2"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <div style={{ color: 'var(--text-primary)' }}>Item ID</div>
          <div style={{ color: 'var(--text-primary)' }}>Qty</div>
          <div style={{ color: 'var(--text-primary)' }}>Attuned</div>
        </div>

        {inventoryItems.map((item, index) => (
          <div
            key={index}
            className="grid grid-cols-3 gap-2 text-sm py-2 hover:bg-opacity-50 rounded"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            <div
              className="font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              {item.customName || item.itemId}
            </div>
            <div style={{ color: 'var(--text-muted)' }}>{item.quantity}</div>
            <div style={{ color: 'var(--text-muted)' }}>
              {item.isAttuned ? '✓' : '—'}
            </div>
          </div>
        ))}

        {inventoryItems.length === 0 && (
          <p
            className="text-center py-4"
            style={{ color: 'var(--text-secondary)' }}
          >
            No equipment
          </p>
        )}
      </div>
    );

    if (onShowModal) {
      onShowModal('Equipment & Inventory', content);
    }
  };

  return (
    <Card className="p-4 h-full">
      <div className="flex justify-between items-center mb-3">
        <h4
          className="text-lg font-bold"
          style={{
            fontFamily: 'Cinzel, serif',
            color: 'var(--text-primary)',
          }}
        >
          Equipment
        </h4>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm px-2 py-1 rounded transition-colors"
          style={{
            backgroundColor: expanded
              ? 'var(--accent-primary)'
              : 'var(--bg-secondary)',
            color: expanded ? 'var(--text-button)' : 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
          }}
        >
          {expanded ? 'Hide' : 'Show All'}
        </button>
      </div>

      <div className="flex justify-between items-center mb-2">
        <button
          onClick={handleShowDetails}
          className="text-sm hover:underline"
          style={{ color: 'var(--accent-primary)' }}
        >
          View Details →
        </button>
        <div
          className="text-sm"
          style={{
            color: 'var(--text-muted)',
          }}
        >
          {inventoryItems.length} items
        </div>
      </div>

      {/* Quick Equipment Overview */}
      <div className="mt-3 space-y-3">
        {inventoryItems.length === 0 ? (
          <div
            className="text-sm text-center py-4"
            style={{ color: 'var(--text-secondary)' }}
          >
            No equipment
          </div>
        ) : (
          <>
            {/* Show first few items */}
            <div>
              <h5
                className="text-sm font-bold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Inventory Items
              </h5>
              <div className="space-y-1">
                {inventoryItems
                  .slice(0, expanded ? undefined : 3)
                  .map((item, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span style={{ color: 'var(--text-muted)' }}>
                        {item.customName || `Item: ${item.itemId}`}
                      </span>
                      <span style={{ color: 'var(--text-subtle)' }}>
                        {item.quantity > 1 ? `×${item.quantity}` : ''}
                        {item.isAttuned ? ' (Attuned)' : ''}
                      </span>
                    </div>
                  ))}
                {!expanded && inventoryItems.length > 3 && (
                  <div
                    className="text-sm text-center"
                    style={{ color: 'var(--text-subtle)' }}
                  >
                    +{inventoryItems.length - 3} more...
                  </div>
                )}
              </div>
            </div>

            {/* Note about equipment details */}
            <div
              className="pt-2 border-t text-xs"
              style={{
                borderColor: 'var(--border-primary)',
                color: 'var(--text-subtle)',
              }}
            >
              Note: Full equipment details require Equipment API integration
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
