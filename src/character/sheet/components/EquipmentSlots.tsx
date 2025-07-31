import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { motion } from 'framer-motion';
import {
  CircleDot,
  Footprints,
  Gem,
  Hand,
  HardHat,
  Shield as ShieldIcon,
  Shirt,
  Sword,
} from 'lucide-react';
import { useState } from 'react';

interface EquipmentSlotsProps {
  character: Character;
}

interface EquipmentSlot {
  id: string;
  label: string;
  icon: React.ElementType;
  equipped?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function EquipmentSlots({ character }: EquipmentSlotsProps) {
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);

  // TODO: Get actual equipped items from character data
  const equipmentSlots: EquipmentSlot[] = [
    { id: 'helmet', label: 'Helmet', icon: HardHat, equipped: undefined },
    { id: 'armor', label: 'Armor', icon: Shirt, equipped: 'Leather Armor' },
    { id: 'mainHand', label: 'Main Hand', icon: Sword, equipped: 'Shortsword' },
    { id: 'offHand', label: 'Off Hand', icon: ShieldIcon, equipped: undefined },
    { id: 'gloves', label: 'Gloves', icon: Hand, equipped: undefined },
    { id: 'boots', label: 'Boots', icon: Footprints, equipped: undefined },
    { id: 'amulet', label: 'Amulet', icon: Gem, equipped: undefined },
    { id: 'ring1', label: 'Ring 1', icon: CircleDot, equipped: undefined },
    { id: 'ring2', label: 'Ring 2', icon: CircleDot, equipped: undefined },
  ];

  const handleDrop = (e: React.DragEvent, slotId: string) => {
    e.preventDefault();
    // TODO: Handle equipping item from inventory
    console.log('Drop on slot:', slotId);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="game-card p-6"
      style={{
        background: 'var(--card-bg)',
        border: '2px solid var(--border-primary)',
        borderRadius: '0.75rem',
      }}
    >
      <h2
        className="text-xl font-bold font-serif mb-4"
        style={{ color: 'var(--text-primary)' }}
      >
        Equipment
      </h2>

      <div className="grid grid-cols-3 gap-3">
        {equipmentSlots.map((slot, index) => {
          const Icon = slot.icon;
          const isHovered = hoveredSlot === slot.id;

          return (
            <motion.div
              key={slot.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 * index }}
              className="relative"
              onMouseEnter={() => setHoveredSlot(slot.id)}
              onMouseLeave={() => setHoveredSlot(null)}
              onDragOver={(e) => {
                e.preventDefault();
                setHoveredSlot(slot.id);
              }}
              onDragLeave={() => setHoveredSlot(null)}
              onDrop={(e) => handleDrop(e, slot.id)}
            >
              <motion.div
                className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-all"
                style={{
                  backgroundColor: slot.equipped
                    ? 'var(--bg-secondary)'
                    : 'var(--card-bg)',
                  borderColor: isHovered
                    ? 'var(--accent-primary)'
                    : 'var(--border-primary)',
                  borderStyle: slot.equipped ? 'solid' : 'dashed',
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {slot.equipped ? (
                  <div className="text-center p-2">
                    <Icon
                      className="w-8 h-8 mx-auto mb-1"
                      style={{ color: 'var(--accent-primary)' }}
                    />
                    <div
                      className="text-xs font-medium line-clamp-2"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {slot.equipped}
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-2">
                    <Icon
                      className="w-8 h-8 mx-auto mb-1 opacity-30"
                      style={{ color: 'var(--text-muted)' }}
                    />
                    <div
                      className="text-xs opacity-50"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {slot.label}
                    </div>
                  </div>
                )}
              </motion.div>

              {/* Hover tooltip */}
              {isHovered && slot.equipped && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 p-2 rounded text-xs whitespace-nowrap z-10"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                    boxShadow: 'var(--shadow-modal)',
                  }}
                >
                  Click to unequip
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      <div
        className="mt-4 text-xs text-center"
        style={{ color: 'var(--text-muted)' }}
      >
        Drag items from inventory to equip
      </div>
    </motion.div>
  );
}
