// Utility functions for displaying equipment choices in a user-friendly way

export function formatEquipmentChoice(choiceValue: string): string {
  // Handle bundle format: bundle_0:0:warhammer -> "Warhammer"
  if (choiceValue.startsWith('bundle_')) {
    const parts = choiceValue.split(':');
    if (parts.length >= 3) {
      // Get the last part which is the actual item
      const itemId = parts[parts.length - 1];
      return formatItemName(itemId);
    }
  }

  // Handle regular items
  return formatItemName(choiceValue);
}

export function formatItemName(itemId: string): string {
  // Convert kebab-case to Title Case
  return itemId
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function parseEquipmentSelection(selection: string): {
  bundleId?: string;
  nestedIndex?: number;
  itemId: string;
} {
  if (selection.startsWith('bundle_')) {
    const parts = selection.split(':');
    if (parts.length >= 3) {
      return {
        bundleId: parts[0],
        nestedIndex: parseInt(parts[1]),
        itemId: parts[2],
      };
    }
    return {
      bundleId: parts[0],
      itemId: parts[0],
    };
  }

  return { itemId: selection };
}

export function formatEquipmentList(
  choices: Record<string, string[]>
): string[] {
  const formattedItems: string[] = [];

  Object.entries(choices).forEach(([key, values]) => {
    if (key.includes('equipment')) {
      values.forEach((value) => {
        const formatted = formatEquipmentChoice(value);
        if (formatted && !formattedItems.includes(formatted)) {
          formattedItems.push(formatted);
        }
      });
    }
  });

  return formattedItems;
}
