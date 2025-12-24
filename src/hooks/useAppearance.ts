/**
 * Hook to manage character appearance state with defaults
 */

import {
  DEFAULT_APPEARANCE,
  type CharacterAppearance,
} from '@/config/appearancePresets';
import { useState } from 'react';

export function useAppearance(initial?: Partial<CharacterAppearance>) {
  const [appearance, setAppearance] = useState<CharacterAppearance>({
    skinTone: initial?.skinTone || DEFAULT_APPEARANCE.skinTone,
    primaryColor: initial?.primaryColor || DEFAULT_APPEARANCE.primaryColor,
    secondaryColor:
      initial?.secondaryColor || DEFAULT_APPEARANCE.secondaryColor,
    eyeColor: initial?.eyeColor || DEFAULT_APPEARANCE.eyeColor,
  });

  return {
    appearance,
    setAppearance,
    reset: () =>
      setAppearance({
        skinTone: DEFAULT_APPEARANCE.skinTone,
        primaryColor: DEFAULT_APPEARANCE.primaryColor,
        secondaryColor: DEFAULT_APPEARANCE.secondaryColor,
        eyeColor: DEFAULT_APPEARANCE.eyeColor,
      }),
  };
}
