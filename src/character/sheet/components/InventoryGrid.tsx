import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { motion } from 'framer-motion';
import { Coins, Package, Search, Weight } from 'lucide-react';
import { useState } from 'react';

interface InventoryGridProps {
  character: Character;
}

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  weight: number;
  value: number;
  type: 'weapon' | 'armor' | 'consumable' | 'misc';
  equipped: boolean;
}

export function InventoryGrid({ character }: InventoryGridProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  // TODO: Get actual inventory from character data
  const mockInventory: InventoryItem[] = [
    {
      id: '1',
      name: 'Shortsword',
      quantity: 1,
      weight: 2,
      value: 10,
      type: 'weapon',
      equipped: true,
    },
    {
      id: '2',
      name: 'Leather Armor',
      quantity: 1,
      weight: 10,
      value: 10,
      type: 'armor',
      equipped: true,
    },
    {
      id: '3',
      name: 'Health Potion',
      quantity: 3,
      weight: 0.5,
      value: 50,
      type: 'consumable',
      equipped: false,
    },
    {
      id: '4',
      name: "Rope (50')",
      quantity: 1,
      weight: 10,
      value: 1,
      type: 'misc',
      equipped: false,
    },
    {
      id: '5',
      name: 'Rations (5 days)',
      quantity: 5,
      weight: 2,
      value: 0.5,
      type: 'consumable',
      equipped: false,
    },
    {
      id: '6',
      name: 'Torch',
      quantity: 10,
      weight: 1,
      value: 0.01,
      type: 'misc',
      equipped: false,
    },
  ];

  const filteredInventory = mockInventory.filter((item) => {
    const matchesSearch = item.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || item.type === filterType;
    return matchesSearch && matchesFilter;
  });

  const totalWeight = mockInventory.reduce(
    (sum, item) => sum + item.weight * item.quantity,
    0
  );
  const totalValue = mockInventory.reduce(
    (sum, item) => sum + item.value * item.quantity,
    0
  );

  // Calculate carrying capacity (STR * 15 for standard rules)
  const strength = character.abilityScores?.strength || 10;
  const carryingCapacity = strength * 15;

  const handleDragStart = (e: React.DragEvent, item: InventoryItem) => {
    e.dataTransfer.setData('item', JSON.stringify(item));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="game-card p-6"
      style={{
        background: 'var(--card-bg)',
        border: '2px solid var(--border-primary)',
        borderRadius: '0.75rem',
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Package
          className="w-5 h-5"
          style={{ color: 'var(--accent-primary)' }}
        />
        <h2
          className="text-xl font-bold font-serif"
          style={{ color: 'var(--text-primary)' }}
        >
          Inventory
        </h2>
      </div>

      {/* Search and Filter */}
      <div className="space-y-3 mb-4">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            type="text"
            placeholder="Search items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3 py-2 rounded-lg border text-sm"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filterType === 'all' ? 'ring-2' : ''
            }`}
            style={{
              backgroundColor:
                filterType === 'all'
                  ? 'var(--accent-primary)'
                  : 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              ringColor: 'var(--accent-primary)',
            }}
          >
            All
          </button>
          <button
            onClick={() => setFilterType('weapon')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filterType === 'weapon' ? 'ring-2' : ''
            }`}
            style={{
              backgroundColor:
                filterType === 'weapon'
                  ? 'var(--accent-primary)'
                  : 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              ringColor: 'var(--accent-primary)',
            }}
          >
            Weapons
          </button>
          <button
            onClick={() => setFilterType('armor')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filterType === 'armor' ? 'ring-2' : ''
            }`}
            style={{
              backgroundColor:
                filterType === 'armor'
                  ? 'var(--accent-primary)'
                  : 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              ringColor: 'var(--accent-primary)',
            }}
          >
            Armor
          </button>
          <button
            onClick={() => setFilterType('consumable')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filterType === 'consumable' ? 'ring-2' : ''
            }`}
            style={{
              backgroundColor:
                filterType === 'consumable'
                  ? 'var(--accent-primary)'
                  : 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              ringColor: 'var(--accent-primary)',
            }}
          >
            Consumables
          </button>
        </div>
      </div>

      {/* Inventory Grid */}
      <div className="grid grid-cols-4 gap-2 mb-4 max-h-80 overflow-y-auto">
        {filteredInventory.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.02 * index }}
            draggable={!item.equipped}
            onDragStart={(e) => handleDragStart(e, item)}
            onClick={() =>
              setSelectedItem(item.id === selectedItem ? null : item.id)
            }
            className={`
              aspect-square rounded-lg border-2 p-2 cursor-pointer transition-all
              ${item.equipped ? 'opacity-50' : 'hover:scale-105'}
              ${selectedItem === item.id ? 'ring-2' : ''}
            `}
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: item.equipped
                ? 'var(--accent-primary)'
                : 'var(--border-primary)',
              ringColor: 'var(--accent-primary)',
            }}
          >
            <div className="h-full flex flex-col items-center justify-center text-center">
              <Package
                className="w-6 h-6 mb-1"
                style={{
                  color: item.equipped
                    ? 'var(--accent-primary)'
                    : 'var(--text-secondary)',
                }}
              />
              <div
                className="text-xs font-medium line-clamp-2"
                style={{ color: 'var(--text-primary)' }}
              >
                {item.name}
              </div>
              {item.quantity > 1 && (
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  x{item.quantity}
                </div>
              )}
              {item.equipped && (
                <div
                  className="text-xs font-bold mt-1"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  Equipped
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Weight and Value Summary */}
      <div
        className="border-t pt-3 space-y-2"
        style={{ borderColor: 'var(--border-primary)' }}
      >
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Weight
              className="w-4 h-4"
              style={{ color: 'var(--text-muted)' }}
            />
            <span style={{ color: 'var(--text-primary)' }}>
              Weight: {totalWeight} / {carryingCapacity} lbs
            </span>
          </div>
          <div
            className="text-xs"
            style={{
              color:
                totalWeight > carryingCapacity
                  ? 'var(--error)'
                  : 'var(--text-muted)',
            }}
          >
            {totalWeight > carryingCapacity ? 'Encumbered!' : 'Normal'}
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Coins className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <span style={{ color: 'var(--text-primary)' }}>
            Total Value: {totalValue.toFixed(2)} gp
          </span>
        </div>
      </div>
    </motion.div>
  );
}
