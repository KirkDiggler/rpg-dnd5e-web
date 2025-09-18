import { TraitBadgeGroup } from '@/components/TraitBadge';
import { TraitIcons } from '@/constants/traits';
import type { BackgroundInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { ChoiceCategory } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { motion } from 'framer-motion';
import { useCallback, useContext, useState } from 'react';
import {
  getLanguageDisplay,
  getSkillDisplay,
} from '../../../utils/enumDisplay';
import { BackgroundSelectionModal } from '../BackgroundSelectionModal';
import { CharacterDraftContext } from '../CharacterDraftContextDef';

export function SkillsBackgroundSection() {
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);

  const context = useContext(CharacterDraftContext);
  if (!context)
    throw new Error(
      'SkillsBackgroundSection must be used within CharacterDraftProvider'
    );

  const { classChoices, raceChoices, backgroundInfo, setBackground } = context;

  // Get proficiencies from character choices (now ChoiceSubmission arrays)
  const classChoiceSubmissions = classChoices || [];
  const raceChoiceSubmissions = raceChoices || [];

  // Extract skills, tools, and languages from ChoiceSubmission
  const classSkillChoices: number[] = [];
  const classToolChoices: string[] = [];
  const classFeatChoices: string[] = [];
  const raceSkillChoices: number[] = [];
  const raceLanguageChoices: number[] = [];

  // Process class choices
  classChoiceSubmissions.forEach((choice) => {
    if (
      choice.category === ChoiceCategory.SKILLS &&
      choice.selection?.case === 'skills'
    ) {
      classSkillChoices.push(...(choice.selection.value.skills || []));
    } else if (choice.category === ChoiceCategory.TOOLS) {
      // TODO: Handle tool choices when implemented
    }
    // TODO: Handle feat choices
  });

  // Process race choices
  raceChoiceSubmissions.forEach((choice) => {
    if (
      choice.category === ChoiceCategory.SKILLS &&
      choice.selection?.case === 'skills'
    ) {
      raceSkillChoices.push(...(choice.selection.value.skills || []));
    } else if (
      choice.category === ChoiceCategory.LANGUAGES &&
      choice.selection?.case === 'languages'
    ) {
      raceLanguageChoices.push(...(choice.selection.value.languages || []));
    }
  });

  // Background selection handlers
  const handleBackgroundSelect = useCallback(
    async (background: BackgroundInfo) => {
      try {
        // Backgrounds don't have choices - they provide fixed proficiencies
        await setBackground(background, []);
      } catch (error) {
        console.error('Failed to select background:', error);
      }
    },
    [setBackground]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Skills Section */}
        <div className="space-y-4">
          <h2
            className="text-xl font-bold font-serif"
            style={{ color: 'var(--text-primary)' }}
          >
            Skills & Proficiencies
          </h2>

          <TraitBadgeGroup
            title="Racial Proficiencies"
            traits={raceSkillChoices.map((skillEnum, index) => ({
              id: `race-skill-${index}`,
              name: getSkillDisplay(skillEnum),
              type: 'racial' as const,
              icon: TraitIcons.racial,
              description: 'Racial proficiency',
            }))}
          />

          {classToolChoices.length > 0 && (
            <TraitBadgeGroup
              title="Tool Proficiencies"
              traits={classToolChoices.map((toolId, index) => ({
                id: `class-tool-${index}`,
                name: toolId
                  .replace('tool:-', '')
                  .replace(/-/g, ' ')
                  .replace(/\b\w/g, (l: string) => l.toUpperCase()),
                type: 'class' as const,
                icon: '🔧',
                description: 'Tool proficiency',
              }))}
            />
          )}

          {classFeatChoices.length > 0 && (
            <TraitBadgeGroup
              title="Feats"
              traits={classFeatChoices.map((featId, index) => ({
                id: `class-feat-${index}`,
                name: featId
                  .replace('feat:-', '')
                  .replace(/-/g, ' ')
                  .replace(/\b\w/g, (l: string) => l.toUpperCase()),
                type: 'class' as const,
                icon: '⭐',
                description: 'Feat',
              }))}
            />
          )}
        </div>

        {/* Background Section */}
        <div className="space-y-4">
          <h2
            className="text-xl font-bold font-serif"
            style={{ color: 'var(--text-primary)' }}
          >
            Background & Languages
          </h2>

          {raceLanguageChoices.length > 0 && (
            <TraitBadgeGroup
              title="Languages"
              traits={raceLanguageChoices.map((langEnum, index) => ({
                id: `race-lang-${index}`,
                name: getLanguageDisplay(langEnum),
                type: 'racial' as const,
                icon: '💬',
                description: 'Language',
              }))}
            />
          )}

          {backgroundInfo ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-4 rounded-lg border-2"
              style={{
                backgroundColor: 'var(--card-bg)',
                borderColor: 'var(--accent-primary)',
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="text-2xl">🛡️</div>
                <div>
                  <h3
                    className="font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {backgroundInfo.name}
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Background proficiencies and choices applied
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBackgroundModal(true)}
                className="text-xs text-muted hover:text-accent"
              >
                Click to change
              </button>
            </motion.div>
          ) : (
            <button
              onClick={() => setShowBackgroundModal(true)}
              className="w-full p-6 text-center rounded-lg border-2 border-dashed hover:border-solid transition-all"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-primary)',
              }}
            >
              <div className="text-4xl mb-2">🛡️</div>
              <h4
                className="font-medium text-lg mb-1"
                style={{ color: 'var(--text-primary)' }}
              >
                Choose Your Background
              </h4>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Your background grants skills, languages, and equipment
              </p>
            </button>
          )}
        </div>
      </div>

      <BackgroundSelectionModal
        isOpen={showBackgroundModal}
        currentBackground={backgroundInfo?.backgroundId}
        onSelect={handleBackgroundSelect}
        onClose={() => setShowBackgroundModal(false)}
      />
    </div>
  );
}
