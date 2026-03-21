import { AbilityScoreGuidance } from './AbilityScoreGuidance';
import { ClassOverview } from './ClassOverview';
import { MONK_DATA } from './data';
import { EquipmentGuidance } from './EquipmentGuidance';
import { ProficiencyDetails } from './ProficiencyDetails';
import { SavingThrowContext } from './SavingThrowContext';

export function ClassSelectionConcept() {
  const classInfo = MONK_DATA;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Concept prototype — hardcoded Monk data. Validates what info the
          toolkit needs to produce for an informed class selection experience.
        </p>
      </div>

      {/* Class overview — the "sell" */}
      <ClassOverview classInfo={classInfo} />

      {/* Two-column grid for mechanical details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AbilityScoreGuidance guidance={classInfo.abilityGuidance} />
        <SavingThrowContext
          savingThrows={classInfo.savingThrows}
          context={classInfo.savingThrowContext}
        />
      </div>

      {/* Proficiencies — full width */}
      <ProficiencyDetails
        details={classInfo.proficiencyDetails}
        skillChoices={classInfo.skillChoices}
      />

      {/* Equipment guidance */}
      <EquipmentGuidance equipment={classInfo.equipmentGuidance} />
    </div>
  );
}
