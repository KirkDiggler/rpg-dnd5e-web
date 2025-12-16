import {
  useEquipItem,
  useGetCharacterInventory,
  useUnequipItem,
} from '@/api/equipmentHooks';
import {
  EquipmentSlot,
  type InventoryItem,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  AlertTriangle,
  Backpack,
  Check,
  CircleDot,
  Package,
  Shield,
  Shirt,
  Sword,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

// Import our new UI components
import { Button, EmptyState, ErrorDisplay, Modal, ModalFooter } from './ui';

interface EquipmentProps {
  characterId: string;
  onClose: () => void;
}

// Helper function to get slot display name and icon
function getSlotInfo(slot: EquipmentSlot): {
  name: string;
  shortName: string;
  icon: React.ReactNode;
} {
  const slotInfo: Partial<
    Record<
      EquipmentSlot,
      { name: string; shortName: string; icon: React.ReactNode }
    >
  > = {
    [EquipmentSlot.UNSPECIFIED]: {
      name: 'Unspecified',
      shortName: '?',
      icon: <Package size={18} />,
    },
    [EquipmentSlot.MAIN_HAND]: {
      name: 'Main Hand',
      shortName: 'Main',
      icon: <Sword size={18} />,
    },
    [EquipmentSlot.OFF_HAND]: {
      name: 'Off Hand',
      shortName: 'Off',
      icon: <Shield size={18} />,
    },
    [EquipmentSlot.ARMOR]: {
      name: 'Armor',
      shortName: 'Armor',
      icon: <Shirt size={18} />,
    },
    [EquipmentSlot.HELMET]: {
      name: 'Helmet',
      shortName: 'Helm',
      icon: <CircleDot size={18} />,
    },
    [EquipmentSlot.BOOTS]: {
      name: 'Boots',
      shortName: 'Boots',
      icon: <Package size={18} />,
    },
    [EquipmentSlot.GLOVES]: {
      name: 'Gloves',
      shortName: 'Gloves',
      icon: <Package size={18} />,
    },
    [EquipmentSlot.CLOAK]: {
      name: 'Cloak',
      shortName: 'Cloak',
      icon: <Package size={18} />,
    },
    [EquipmentSlot.AMULET]: {
      name: 'Amulet',
      shortName: 'Amulet',
      icon: <CircleDot size={18} />,
    },
    [EquipmentSlot.RING_1]: {
      name: 'Ring 1',
      shortName: 'Ring',
      icon: <CircleDot size={18} />,
    },
    [EquipmentSlot.RING_2]: {
      name: 'Ring 2',
      shortName: 'Ring',
      icon: <CircleDot size={18} />,
    },
    [EquipmentSlot.BELT]: {
      name: 'Belt',
      shortName: 'Belt',
      icon: <Package size={18} />,
    },
  };
  return (
    slotInfo[slot] || {
      name: 'Unknown Slot',
      shortName: '?',
      icon: <Package size={18} />,
    }
  );
}

// Helper function to get item type icon based on item name
function getItemIcon(itemName: string): React.ReactNode {
  const name = itemName.toLowerCase();

  if (
    name.includes('sword') ||
    name.includes('axe') ||
    name.includes('dagger') ||
    name.includes('rapier') ||
    name.includes('scimitar') ||
    name.includes('mace') ||
    name.includes('hammer') ||
    name.includes('club') ||
    name.includes('spear') ||
    name.includes('staff') ||
    name.includes('bow') ||
    name.includes('crossbow') ||
    name.includes('weapon')
  ) {
    return <Sword size={16} className="text-red-400" />;
  }

  if (name.includes('shield')) {
    return <Shield size={16} className="text-blue-400" />;
  }

  if (
    name.includes('armor') ||
    name.includes('mail') ||
    name.includes('plate') ||
    name.includes('leather') ||
    name.includes('hide') ||
    name.includes('breastplate')
  ) {
    return <Shirt size={16} className="text-gray-400" />;
  }

  return <Backpack size={16} className="text-amber-400" />;
}

// Helper function to get available slots for an item
function getAvailableSlots(itemName: string): EquipmentSlot[] {
  const name = itemName.toLowerCase();

  // Weapon-like items
  if (
    name.includes('sword') ||
    name.includes('axe') ||
    name.includes('mace') ||
    name.includes('hammer') ||
    name.includes('dagger') ||
    name.includes('club') ||
    name.includes('spear') ||
    name.includes('staff') ||
    name.includes('bow') ||
    name.includes('crossbow') ||
    name.includes('weapon') ||
    name.includes('rapier') ||
    name.includes('scimitar') ||
    name.includes('shortsword') ||
    name.includes('longsword') ||
    name.includes('greatsword') ||
    name.includes('warhammer') ||
    name.includes('battleaxe') ||
    name.includes('greataxe') ||
    name.includes('morningstar') ||
    name.includes('flail') ||
    name.includes('pike') ||
    name.includes('halberd') ||
    name.includes('glaive')
  ) {
    return [EquipmentSlot.MAIN_HAND, EquipmentSlot.OFF_HAND];
  }

  // Shield
  if (name.includes('shield')) {
    return [EquipmentSlot.OFF_HAND];
  }

  // Armor
  if (
    name.includes('armor') ||
    name.includes('mail') ||
    name.includes('plate') ||
    name.includes('leather') ||
    name.includes('studded') ||
    name.includes('hide') ||
    name.includes('breastplate') ||
    name.includes('cuirass')
  ) {
    return [EquipmentSlot.ARMOR];
  }

  // Helmet
  if (
    name.includes('helm') ||
    name.includes('helmet') ||
    name.includes('cap')
  ) {
    return [EquipmentSlot.HELMET];
  }

  // Boots
  if (
    name.includes('boot') ||
    name.includes('shoe') ||
    name.includes('greave')
  ) {
    return [EquipmentSlot.BOOTS];
  }

  // Gloves
  if (name.includes('glove') || name.includes('gauntlet')) {
    return [EquipmentSlot.GLOVES];
  }

  // Cloak
  if (
    name.includes('cloak') ||
    name.includes('cape') ||
    name.includes('mantle')
  ) {
    return [EquipmentSlot.CLOAK];
  }

  // Amulet
  if (
    name.includes('amulet') ||
    name.includes('necklace') ||
    name.includes('pendant')
  ) {
    return [EquipmentSlot.AMULET];
  }

  // Ring
  if (name.includes('ring')) {
    return [EquipmentSlot.RING_1, EquipmentSlot.RING_2];
  }

  // Belt
  if (name.includes('belt') || name.includes('girdle')) {
    return [EquipmentSlot.BELT];
  }

  // Default - could be anything, show main slots
  return [EquipmentSlot.MAIN_HAND, EquipmentSlot.OFF_HAND, EquipmentSlot.ARMOR];
}

export function Equipment({ characterId, onClose }: EquipmentProps) {
  const {
    getCharacterInventory,
    loading: inventoryLoading,
    error: inventoryError,
    data: inventoryData,
  } = useGetCharacterInventory();

  const {
    equipItem,
    loading: equipLoading,
    error: equipError,
  } = useEquipItem();

  const {
    unequipItem,
    loading: unequipLoading,
    error: unequipError,
  } = useUnequipItem();

  const [selectedItem, setSelectedItem] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const isLoading = inventoryLoading || equipLoading || unequipLoading;
  const hasError = inventoryError || equipError || unequipError;

  // Fetch inventory on mount
  useEffect(() => {
    if (characterId) {
      getCharacterInventory(characterId).catch((error) => {
        console.error('Failed to fetch inventory:', error);
      });
    }
  }, [characterId, getCharacterInventory]);

  // Refresh inventory after equipment changes
  const refreshInventory = async () => {
    if (characterId) {
      await getCharacterInventory(characterId);
    }
  };

  const handleEquipItem = async (itemId: string, slot: EquipmentSlot) => {
    try {
      await equipItem(characterId, itemId, slot);
      await refreshInventory();
      setSelectedItem(null);
    } catch (error) {
      console.error('Failed to equip item:', error);
    }
  };

  const handleUnequipItem = async (slot: EquipmentSlot) => {
    try {
      await unequipItem(characterId, slot);
      await refreshInventory();
    } catch (error) {
      console.error('Failed to unequip item:', error);
    }
  };

  const handleSlotClick = (slot: EquipmentSlot) => {
    if (selectedItem) {
      // Check if this slot is valid for the selected item
      const availableSlots = getAvailableSlots(selectedItem.name);
      if (availableSlots.includes(slot)) {
        handleEquipItem(selectedItem.id, slot);
      }
    }
  };

  // Get equipped item for a slot
  const getEquippedItem = (slot: EquipmentSlot) => {
    if (!inventoryData?.equipmentSlots) return null;
    switch (slot) {
      case EquipmentSlot.MAIN_HAND:
        return inventoryData.equipmentSlots.mainHand;
      case EquipmentSlot.OFF_HAND:
        return inventoryData.equipmentSlots.offHand;
      case EquipmentSlot.ARMOR:
        return inventoryData.equipmentSlots.armor;
      default:
        return null;
    }
  };

  // Compact equipment slot component
  const CompactSlot = ({ slot }: { slot: EquipmentSlot }) => {
    const { name, icon } = getSlotInfo(slot);
    const equippedItem = getEquippedItem(slot);
    const canAcceptItem = selectedItem
      ? getAvailableSlots(selectedItem.name).includes(slot)
      : false;
    const isHighlighted = selectedItem && canAcceptItem;

    return (
      <div
        role={isHighlighted ? 'button' : undefined}
        tabIndex={isHighlighted ? 0 : undefined}
        onClick={() => isHighlighted && handleSlotClick(slot)}
        onKeyDown={(e) => {
          if (isHighlighted && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handleSlotClick(slot);
          }
        }}
        className={`
          flex items-center gap-3 p-3 rounded-lg border transition-all
          ${isHighlighted ? 'border-blue-500 bg-blue-500/10 cursor-pointer' : 'border-gray-700 bg-gray-800/50'}
          ${equippedItem ? 'hover:bg-gray-700/50' : ''}
        `}
      >
        {/* Slot icon */}
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
            isHighlighted
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-gray-700 text-gray-400'
          }`}
        >
          {icon}
        </div>

        {/* Slot content */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500 uppercase tracking-wide">
            {name}
          </div>
          {equippedItem ? (
            <div
              className="text-sm text-white truncate font-medium"
              title={equippedItem.customName || equippedItem.itemId}
            >
              {equippedItem.customName || equippedItem.itemId}
            </div>
          ) : isHighlighted ? (
            <div className="text-sm text-blue-400">Click to equip</div>
          ) : (
            <div className="text-sm text-gray-600 italic">Empty</div>
          )}
        </div>

        {/* Unequip button */}
        {equippedItem && (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              handleUnequipItem(slot);
            }}
            disabled={isLoading}
            className="flex-shrink-0"
            aria-label="Unequip item"
          >
            <X size={16} />
          </Button>
        )}
      </div>
    );
  };

  // Compact inventory item row
  const CompactInventoryItem = ({
    item,
    index,
  }: {
    item: InventoryItem;
    index: number;
  }) => {
    const isSelected = selectedItem?.id === item.itemId;
    const itemName = item.customName || item.itemId;

    return (
      <div
        key={`${item.itemId}-${index}`}
        role="button"
        tabIndex={0}
        onClick={() => {
          setSelectedItem(
            isSelected ? null : { id: item.itemId, name: itemName }
          );
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setSelectedItem(
              isSelected ? null : { id: item.itemId, name: itemName }
            );
          }
        }}
        className={`
          flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all
          ${isSelected ? 'bg-blue-500/20 ring-1 ring-blue-500' : 'hover:bg-gray-700/50'}
        `}
      >
        {/* Item icon */}
        <div className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center bg-gray-700">
          {getItemIcon(itemName)}
        </div>

        {/* Item info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white truncate" title={itemName}>
            {itemName}
          </div>
          <div className="text-xs text-gray-500 flex items-center gap-2">
            {item.quantity > 1 && <span>×{item.quantity}</span>}
            {item.isAttuned && <span className="text-yellow-500">Attuned</span>}
            {isSelected && (
              <span className="text-blue-400">
                →{' '}
                {getAvailableSlots(itemName)
                  .map((s) => getSlotInfo(s).shortName)
                  .join(', ')}
              </span>
            )}
          </div>
        </div>

        {/* Selection indicator */}
        {isSelected && (
          <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
            <Check size={12} className="text-white" strokeWidth={3} />
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal
      isOpen
      title="Equipment"
      onClose={onClose}
      size="lg"
      loading={isLoading}
      error={hasError?.message}
      footer={<ModalFooter onCancel={onClose} cancelText="Close" />}
    >
      {!isLoading && !hasError && (
        <div className="flex gap-4 min-h-[300px]">
          {/* Left: Equipment Slots */}
          <div className="w-64 flex-shrink-0">
            <div className="flex items-center gap-2 mb-3 text-gray-400">
              <Shield size={16} />
              <span className="text-sm font-medium uppercase tracking-wide">
                Equipped
              </span>
            </div>

            {inventoryData ? (
              <div className="space-y-2">
                <CompactSlot slot={EquipmentSlot.MAIN_HAND} />
                <CompactSlot slot={EquipmentSlot.OFF_HAND} />
                <CompactSlot slot={EquipmentSlot.ARMOR} />
              </div>
            ) : (
              <EmptyState
                title="No Equipment Data"
                description="Unable to load"
                icon={<AlertTriangle size={32} />}
                size="sm"
              />
            )}

            {/* Compact stats footer */}
            {inventoryData && (
              <div className="mt-4 pt-3 border-t border-gray-700 text-xs text-gray-500 space-y-1">
                {inventoryData.encumbrance && (
                  <div className="flex justify-between">
                    <span>Weight</span>
                    <span className="text-gray-400">
                      {inventoryData.encumbrance.currentWeight}/
                      {inventoryData.encumbrance.carryingCapacity} lbs
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Attunement</span>
                  <span className="text-gray-400">
                    {inventoryData.attunementSlotsUsed || 0}/
                    {inventoryData.attunementSlotsMax || 3}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Right: Inventory */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3 text-gray-400">
              <Backpack size={16} />
              <span className="text-sm font-medium uppercase tracking-wide">
                Inventory ({inventoryData?.inventory?.length || 0})
              </span>
              {selectedItem && (
                <span className="ml-auto text-xs text-blue-400">
                  Click a slot to equip
                </span>
              )}
            </div>

            {!inventoryData || inventoryData.inventory.length === 0 ? (
              <EmptyState
                title="Empty Inventory"
                description="Find some loot!"
                icon={<Package size={32} />}
                size="sm"
              />
            ) : (
              <div className="space-y-1 max-h-[280px] overflow-y-auto pr-2">
                {inventoryData.inventory.map((item, index) => (
                  <CompactInventoryItem
                    key={`${item.itemId}-${index}`}
                    item={item}
                    index={index}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error State */}
      {hasError && !isLoading && (
        <ErrorDisplay
          title="Equipment Error"
          message={hasError.message}
          onRetry={() => refreshInventory()}
        />
      )}
    </Modal>
  );
}
