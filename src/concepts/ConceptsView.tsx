import { motion } from 'framer-motion';
import { useState } from 'react';
import { AssetAnchorLabConcept } from '../author/AssetAnchorLabConcept';
import { DungeonBuilderSandbox } from '../author/DungeonBuilderSandbox';
import { AttackDie3DConcept } from './attack-die-3d/AttackDie3DConcept';
import { ClassSelectionConcept } from './class-selection/ClassSelectionConcept';
import { CombatPacingConcept } from './combat-pacing/CombatPacingConcept';
import { CombatPanelConcept } from './combat-panel/CombatPanelConcept';
import { EncounterDockConcept } from './encounter-dock/EncounterDockConcept';
import { EquipmentConcept } from './equipment/EquipmentConcept';
import { FogOfWarConcept } from './fog-of-war/FogOfWarConcept';
import { JustRollConcept } from './just-roll/JustRollConcept';
import { SessionCombatConcept } from './session-combat/SessionCombatConcept';
import { SessionTombConcept } from './session-tomb/SessionTombConcept';
import { WeaponAttachmentConcept } from './weapon-attachment/WeaponAttachmentConcept';

type ConceptPage =
  | 'attack-die-3d'
  | 'class-selection'
  | 'encounter-dock'
  | 'combat-panel'
  | 'equipment'
  | 'combat-pacing'
  | 'just-roll'
  | 'fog-of-war'
  | 'session-combat'
  | 'session-tomb'
  | 'weapon-attachment'
  | 'dungeon-builder'
  | 'asset-anchor-lab';

const CONCEPT_PAGES: { id: ConceptPage; label: string }[] = [
  { id: 'attack-die-3d', label: 'Attack Die 3D' },
  { id: 'class-selection', label: 'Class Selection' },
  { id: 'encounter-dock', label: 'Encounter Dock' },
  { id: 'combat-panel', label: 'Combat Panel' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'combat-pacing', label: 'Combat Pacing' },
  { id: 'just-roll', label: 'Just Roll' },
  { id: 'fog-of-war', label: 'Fog of War' },
  { id: 'session-combat', label: 'Session Combat' },
  { id: 'session-tomb', label: 'Session Tomb' },
  { id: 'weapon-attachment', label: 'Weapon Attachment' },
  { id: 'dungeon-builder', label: 'Dungeon Builder' },
  { id: 'asset-anchor-lab', label: 'Asset Anchor Lab' },
];

interface ConceptsViewProps {
  onBack: () => void;
}

export function ConceptsView({ onBack }: ConceptsViewProps) {
  // Dev-only deep link: ?concept=<id> opens straight to a concept so visual
  // evidence is reproducible from a URL. Unknown values fall back silently.
  const requested =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('concept');
  const initialPage = CONCEPT_PAGES.some((page) => page.id === requested)
    ? (requested as ConceptPage)
    : 'class-selection';

  const [activePage, setActivePage] = useState<ConceptPage>(initialPage);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="px-3 py-1.5 rounded text-sm"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            Back
          </button>
          <h1
            className="text-3xl font-bold"
            style={{
              fontFamily: 'Cinzel, serif',
              color: 'var(--text-primary)',
            }}
          >
            Concepts Lab
          </h1>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CONCEPT_PAGES.map((page) => (
          <button
            key={page.id}
            onClick={() => setActivePage(page.id)}
            className="px-4 py-2 rounded text-sm font-medium transition-colors"
            style={{
              backgroundColor:
                activePage === page.id
                  ? 'var(--accent-primary)'
                  : 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border:
                activePage === page.id
                  ? '1px solid var(--accent-primary)'
                  : '1px solid var(--border-primary)',
            }}
          >
            {page.label}
          </button>
        ))}
      </div>

      {/* Active concept page */}
      <motion.div
        key={activePage}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activePage === 'attack-die-3d' && <AttackDie3DConcept />}
        {activePage === 'class-selection' && <ClassSelectionConcept />}
        {activePage === 'encounter-dock' && <EncounterDockConcept />}
        {activePage === 'combat-panel' && <CombatPanelConcept />}
        {activePage === 'equipment' && <EquipmentConcept />}
        {activePage === 'combat-pacing' && <CombatPacingConcept />}
        {activePage === 'just-roll' && <JustRollConcept />}
        {activePage === 'fog-of-war' && <FogOfWarConcept />}
        {activePage === 'session-combat' && <SessionCombatConcept />}
        {activePage === 'session-tomb' && <SessionTombConcept />}
        {activePage === 'weapon-attachment' && <WeaponAttachmentConcept />}
        {/* Graduated (rpg-project#194): the real builder now lives at the
            `/author` AppView (`src/author/AuthorView.tsx`), LIVE mode. This
            tab is the dev sandbox — the same `DungeonBuilder` on a fixture
            compile (`DungeonBuilderSandbox` hands it `fixtureCompile`), so
            it never calls PutDungeon and never depends on a running server,
            per Kirk's ask ("a dev one that is hooked to fixture data"). */}
        {activePage === 'dungeon-builder' && <DungeonBuilderSandbox />}
        {activePage === 'asset-anchor-lab' && <AssetAnchorLabConcept />}
      </motion.div>
    </div>
  );
}
