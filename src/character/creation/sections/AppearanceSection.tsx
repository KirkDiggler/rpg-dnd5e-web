/**
 * AppearanceSection - Character appearance customization in creation flow
 */

import { AppearanceEditor } from '@/components/AppearanceEditor';
import {
  DEFAULT_APPEARANCE,
  type CharacterAppearance,
} from '@/config/appearancePresets';
import { create } from '@bufbuild/protobuf';
import type { Appearance } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  AppearanceSchema,
  UpdateAppearanceRequestSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { characterClient } from '../../../api/client';

interface AppearanceSectionProps {
  /** Draft ID for saving appearance */
  draftId: string | null;
  /** Initial appearance from draft (if any) */
  initialAppearance?: Appearance;
  /** Callback when appearance changes */
  onAppearanceChange?: (appearance: CharacterAppearance) => void;
}

/**
 * Convert proto Appearance to CharacterAppearance
 */
function protoToAppearance(proto?: Appearance): CharacterAppearance {
  if (!proto) {
    return { ...DEFAULT_APPEARANCE };
  }
  return {
    skinTone: proto.skinTone || DEFAULT_APPEARANCE.skinTone,
    primaryColor: proto.primaryColor || DEFAULT_APPEARANCE.primaryColor,
    secondaryColor: proto.secondaryColor || DEFAULT_APPEARANCE.secondaryColor,
    eyeColor: proto.eyeColor || DEFAULT_APPEARANCE.eyeColor,
  };
}

export function AppearanceSection({
  draftId,
  initialAppearance,
  onAppearanceChange,
}: AppearanceSectionProps) {
  const [appearance, setAppearance] = useState<CharacterAppearance>(() =>
    protoToAppearance(initialAppearance)
  );
  const [saving, setSaving] = useState(false);

  // Update local state when initial appearance changes (e.g., draft loads)
  useEffect(() => {
    if (initialAppearance) {
      setAppearance(protoToAppearance(initialAppearance));
    }
  }, [initialAppearance]);

  const handleAppearanceChange = useCallback(
    async (newAppearance: CharacterAppearance) => {
      setAppearance(newAppearance);
      onAppearanceChange?.(newAppearance);

      // Save to API if we have a draft
      if (draftId) {
        setSaving(true);
        try {
          const request = create(UpdateAppearanceRequestSchema, {
            draftId,
            appearance: create(AppearanceSchema, {
              skinTone: newAppearance.skinTone,
              primaryColor: newAppearance.primaryColor,
              secondaryColor: newAppearance.secondaryColor,
              eyeColor: newAppearance.eyeColor,
            }),
          });
          await characterClient.updateAppearance(request);
        } catch (error) {
          console.error('Failed to save appearance:', error);
          // Don't revert - let the user keep editing
        } finally {
          setSaving(false);
        }
      }
    },
    [draftId, onAppearanceChange]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3
          className="text-lg font-semibold"
          style={{ color: 'var(--text-primary)', fontFamily: 'Cinzel, serif' }}
        >
          Appearance
        </h3>
        {saving && (
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Saving...
          </span>
        )}
      </div>

      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Customize your character&apos;s colors. These settings affect how your
        character appears in combat.
      </p>

      <AppearanceEditor
        appearance={appearance}
        onChange={handleAppearanceChange}
      />
    </motion.div>
  );
}
