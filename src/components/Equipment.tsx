import {
  useEquipItem,
  useGetCharacterInventory,
  useUnequipItem,
} from '@/api/equipmentHooks';
import {
  EquipmentSlot,
  type InventoryItem,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { AlertTriangle, Package, Shield, Sword } from 'lucide-react';
import { useEffect, useState } from 'react';

// Import our new UI components
import {
  Button,
  Card,
  CardGrid,
  CardHeader,
  Container,
  EmptyState,
  ErrorDisplay,
  Grid,
  GridItem,
  Modal,
  ModalFooter,
  Panel,
  PanelHeader,
} from './ui';

interface EquipmentProps {
  characterId: string;
  onClose: () => void;
}

// Helper function to get slot display name and icon
function getSlotInfo(slot: EquipmentSlot): {
  name: string;
  icon: React.ReactNode;
} {
  const slotInfo: Partial<
    Record<EquipmentSlot, { name: string; icon: React.ReactNode }>
  > = {
    [EquipmentSlot.UNSPECIFIED]: {
      name: 'Unspecified',
      icon: <Package size={16} />,
    },
    [EquipmentSlot.MAIN_HAND]: { name: 'Main Hand', icon: <Sword size={16} /> },
    [EquipmentSlot.OFF_HAND]: { name: 'Off Hand', icon: <Shield size={16} /> },
    [EquipmentSlot.ARMOR]: { name: 'Armor', icon: <Shield size={16} /> },
    [EquipmentSlot.HELMET]: { name: 'Helmet', icon: <Shield size={16} /> },
    [EquipmentSlot.BOOTS]: { name: 'Boots', icon: <Shield size={16} /> },
    [EquipmentSlot.GLOVES]: { name: 'Gloves', icon: <Shield size={16} /> },
    [EquipmentSlot.CLOAK]: { name: 'Cloak', icon: <Shield size={16} /> },
    [EquipmentSlot.AMULET]: { name: 'Amulet', icon: <Shield size={16} /> },
    [EquipmentSlot.RING_1]: { name: 'Ring 1', icon: <Shield size={16} /> },
    [EquipmentSlot.RING_2]: { name: 'Ring 2', icon: <Shield size={16} /> },
    [EquipmentSlot.BELT]: { name: 'Belt', icon: <Shield size={16} /> },
  };
  return (
    slotInfo[slot] || { name: 'Unknown Slot', icon: <Package size={16} /> }
  );
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

// Convert equipment slots to select options
// Unused for now - kept for potential future use with dropdown selection
// function getSlotOptions(itemName: string): SelectOption[] {
//   const availableSlots = getAvailableSlots(itemName);
//   return availableSlots.map((slot) => {
//     const { name, icon } = getSlotInfo(slot);
//     return {
//       value: slot.toString(),
//       label: name,
//       icon,
//     };
//   });
// }

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

  // Render equipment slot
  const renderEquipmentSlot = (slot: EquipmentSlot) => {
    const { name, icon } = getSlotInfo(slot);

    // Get equipped item for this slot
    let equippedItem = null;
    if (inventoryData?.equipmentSlots) {
      switch (slot) {
        case EquipmentSlot.MAIN_HAND:
          equippedItem = inventoryData.equipmentSlots.mainHand;
          break;
        case EquipmentSlot.OFF_HAND:
          equippedItem = inventoryData.equipmentSlots.offHand;
          break;
        case EquipmentSlot.ARMOR:
          equippedItem = inventoryData.equipmentSlots.armor;
          break;
        default:
          equippedItem = null;
      }
    }

    // Check if this slot can accept the selected item
    const canAcceptItem = selectedItem
      ? getAvailableSlots(selectedItem.name).includes(slot)
      : false;
    const isHighlighted = selectedItem && canAcceptItem;

    return (
      <Card
        key={slot}
        variant={isHighlighted ? 'default' : 'elevated'}
        interactive={!!equippedItem || !!isHighlighted}
        onClick={() => {
          if (isHighlighted) {
            handleSlotClick(slot);
          }
        }}
        header={
          <CardHeader
            title={name}
            icon={icon}
            actions={
              equippedItem && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnequipItem(slot);
                  }}
                  loading={isLoading}
                  disabled={isLoading}
                >
                  Unequip
                </Button>
              )
            }
          />
        }
      >
        {isHighlighted && !equippedItem ? (
          <div
            className="text-center p-4"
            style={{ color: 'var(--accent-primary)' }}
          >
            <p className="font-semibold">
              Click to equip {selectedItem?.name} here
            </p>
          </div>
        ) : equippedItem ? (
          <div>
            <h4
              className="font-medium mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {equippedItem.itemId}
            </h4>
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              {equippedItem.quantity > 1 && (
                <span>×{equippedItem.quantity}</span>
              )}
              {equippedItem.isAttuned && (
                <span className="px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800">
                  Attuned
                </span>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<div className="text-2xl opacity-50">⚪</div>}
            title={
              isHighlighted
                ? `Click to equip ${selectedItem?.name}`
                : 'Empty Slot'
            }
            size="sm"
          />
        )}
      </Card>
    );
  };

  // Render inventory item
  const renderInventoryItem = (item: InventoryItem, index: number) => {
    const isSelected = selectedItem?.id === item.itemId;
    const itemName = item.customName || item.itemId;

    return (
      <Card
        key={`${item.itemId}-${index}`}
        variant="default"
        interactive
        selected={isSelected}
        onClick={() => {
          setSelectedItem(
            isSelected ? null : { id: item.itemId, name: itemName }
          );
        }}
        header={
          <CardHeader
            title={itemName}
            subtitle={item.quantity > 1 ? `×${item.quantity}` : undefined}
            actions={
              item.isAttuned && (
                <span className="px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800">
                  Attuned
                </span>
              )
            }
          />
        }
        footer={
          isSelected && (
            <div
              className="text-center p-2"
              style={{ color: 'var(--accent-primary)' }}
            >
              <p className="text-sm font-semibold">
                Now click a slot above to equip
              </p>
              <p className="text-xs opacity-75 mt-1">
                Valid slots:{' '}
                {getAvailableSlots(itemName)
                  .map((s) => getSlotInfo(s).name)
                  .join(', ')}
              </p>
            </div>
          )
        }
      >
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {isSelected ? 'Select a slot to equip this item' : 'Click to equip'}
        </div>
      </Card>
    );
  };

  return (
    <Modal
      isOpen
      title="Equipment Management"
      onClose={onClose}
      size="xl"
      loading={isLoading}
      error={hasError?.message}
      footer={<ModalFooter onCancel={onClose} cancelText="Close" />}
    >
      <Container size="full" padding="none">
        {!isLoading && !hasError && (
          <div className="space-y-6">
            {/* Equipment Slots Section */}
            <Panel>
              <PanelHeader title="Equipped Items" icon={<Shield size={20} />} />

              {inventoryData ? (
                <CardGrid columns={3} gap="md">
                  {[
                    EquipmentSlot.MAIN_HAND,
                    EquipmentSlot.OFF_HAND,
                    EquipmentSlot.ARMOR,
                  ].map(renderEquipmentSlot)}
                </CardGrid>
              ) : (
                <EmptyState
                  title="No Equipment Data"
                  description="Unable to load equipment information"
                  icon={<AlertTriangle size={48} />}
                />
              )}
            </Panel>

            {/* Inventory Section */}
            <Panel>
              <PanelHeader
                title={`Inventory (${inventoryData?.inventory?.length || 0} items)`}
                icon={<Package size={20} />}
              />

              {!inventoryData || inventoryData.inventory.length === 0 ? (
                <EmptyState
                  title="No Items in Inventory"
                  description="Your inventory is empty. Find some loot to fill it up!"
                  icon={<Package size={48} />}
                />
              ) : (
                <CardGrid columns={3} gap="md">
                  {inventoryData.inventory.map(renderInventoryItem)}
                </CardGrid>
              )}
            </Panel>

            {/* Character Stats */}
            <Grid cols={2} gap="lg">
              {/* Encumbrance */}
              {inventoryData?.encumbrance && (
                <GridItem>
                  <Panel variant="outlined">
                    <PanelHeader title="Encumbrance" />
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span style={{ color: 'var(--text-muted)' }}>
                          Current Weight
                        </span>
                        <span style={{ color: 'var(--text-primary)' }}>
                          {inventoryData.encumbrance.currentWeight} /{' '}
                          {inventoryData.encumbrance.carryingCapacity} lbs
                        </span>
                      </div>
                      <div
                        className="w-full bg-gray-300 rounded-full h-2"
                        style={{ backgroundColor: 'var(--bg-primary)' }}
                      >
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: `${Math.min(
                              100,
                              (inventoryData.encumbrance.currentWeight /
                                inventoryData.encumbrance.carryingCapacity) *
                                100
                            )}%`,
                            backgroundColor:
                              inventoryData.encumbrance.currentWeight >
                              inventoryData.encumbrance.carryingCapacity
                                ? '#dc2626'
                                : 'var(--accent-primary)',
                          }}
                        />
                      </div>
                    </div>
                  </Panel>
                </GridItem>
              )}

              {/* Attunement */}
              {inventoryData && (
                <GridItem>
                  <Panel variant="outlined">
                    <PanelHeader title="Attunement Slots" />
                    <div className="text-sm">
                      <span style={{ color: 'var(--text-primary)' }}>
                        {inventoryData.attunementSlotsUsed || 0} /{' '}
                        {inventoryData.attunementSlotsMax || 3}
                      </span>
                      <span
                        className="ml-2"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        slots used
                      </span>
                    </div>
                  </Panel>
                </GridItem>
              )}
            </Grid>
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
      </Container>
    </Modal>
  );
}
