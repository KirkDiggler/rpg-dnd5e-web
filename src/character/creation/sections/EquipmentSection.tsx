import { motion } from 'framer-motion';

const SAMPLE_EQUIPMENT = [
  { id: 'sword', name: 'Longsword', type: 'weapon', icon: '⚔️' },
  { id: 'shield', name: 'Shield', type: 'armor', icon: '🛡️' },
  { id: 'leather', name: 'Leather Armor', type: 'armor', icon: '🥼' },
  { id: 'potion', name: 'Healing Potion', type: 'consumable', icon: '🧪' },
  { id: 'rope', name: 'Rope (50 ft)', type: 'gear', icon: '🪢' },
  { id: 'torch', name: 'Torch', type: 'gear', icon: '🕯️' },
];

export function EquipmentSection() {
  // Equipment is automatically determined by class/background choices

  return (
    <div className="space-y-6">
      <h2
        className="text-2xl font-bold font-serif"
        style={{ color: 'var(--text-primary)' }}
      >
        Starting Equipment
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {SAMPLE_EQUIPMENT.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="inventory-slot group"
          >
            <div className="text-center">
              <div className="text-2xl mb-1 group-hover:scale-110 transition-transform">
                {item.icon}
              </div>
              <div
                className="text-xs font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {item.name}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="text-center">
        <p className="text-sm text-muted">
          Equipment is automatically selected based on your class and background
          choices.
        </p>
      </div>
    </div>
  );
}
