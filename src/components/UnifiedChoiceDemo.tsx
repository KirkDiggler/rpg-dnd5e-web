import { useState } from 'react';
import { useListClasses, useListRaces } from '@/api/hooks';
import { 
  UnifiedChoiceSelector,
  EquipmentChoices,
  ProficiencyChoices,
  LanguageChoices,
  type ChoiceSelections
} from '@/character/creation/choices';
import { Button } from './ui/Button';

export function UnifiedChoiceDemo() {
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedRace, setSelectedRace] = useState<string>('');
  const [classSelections, setClassSelections] = useState<ChoiceSelections>({});
  const [raceSelections, setRaceSelections] = useState<ChoiceSelections>({});

  const { data: classes, loading: classesLoading } = useListClasses();
  const { data: races, loading: racesLoading } = useListRaces();

  const currentClass = classes.find(c => c.classId === selectedClass);
  const currentRace = races.find(r => r.raceId === selectedRace);

  const handleShowSelections = () => {
    console.log('Class Selections:', classSelections);
    console.log('Race Selections:', raceSelections);
    alert('Check console for selections');
  };

  if (classesLoading || racesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-6">Unified Choice System Demo</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          This demonstrates the new unified choice components that work with the updated proto structure.
        </p>
      </div>

      {/* Class Selection */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Step 1: Select a Class</h2>
        <select
          value={selectedClass}
          onChange={(e) => {
            setSelectedClass(e.target.value);
            setClassSelections({}); // Reset selections when changing class
          }}
          className="w-full p-2 border rounded-lg dark:bg-gray-800"
        >
          <option value="">Choose a class...</option>
          {classes.map(cls => (
            <option key={cls.classId} value={cls.classId}>
              {cls.name}
            </option>
          ))}
        </select>

        {currentClass && currentClass.choices && currentClass.choices.length > 0 && (
          <div className="mt-6 space-y-6">
            <h3 className="text-lg font-medium">Class Choices for {currentClass.name}</h3>
            
            {/* Equipment Choices */}
            <EquipmentChoices
              choices={currentClass.choices}
              selections={classSelections}
              onSelectionsChange={setClassSelections}
            />

            {/* Proficiency Choices */}
            <ProficiencyChoices
              choices={currentClass.choices}
              selections={classSelections}
              onSelectionsChange={setClassSelections}
            />
          </div>
        )}
      </div>

      {/* Race Selection */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Step 2: Select a Race</h2>
        <select
          value={selectedRace}
          onChange={(e) => {
            setSelectedRace(e.target.value);
            setRaceSelections({}); // Reset selections when changing race
          }}
          className="w-full p-2 border rounded-lg dark:bg-gray-800"
        >
          <option value="">Choose a race...</option>
          {races.map(race => (
            <option key={race.raceId} value={race.raceId}>
              {race.name}
            </option>
          ))}
        </select>

        {currentRace && currentRace.choices && currentRace.choices.length > 0 && (
          <div className="mt-6 space-y-6">
            <h3 className="text-lg font-medium">Race Choices for {currentRace.name}</h3>
            
            {/* Language Choices */}
            <LanguageChoices
              choices={currentRace.choices}
              selections={raceSelections}
              onSelectionsChange={setRaceSelections}
            />

            {/* Proficiency Choices */}
            <ProficiencyChoices
              choices={currentRace.choices}
              selections={raceSelections}
              onSelectionsChange={setRaceSelections}
            />
          </div>
        )}
      </div>

      {/* Show All Choices (for debugging) */}
      <div className="space-y-4 border-t pt-6">
        <h2 className="text-xl font-semibold">All Choices (Debug View)</h2>
        
        {currentClass && currentClass.choices && (
          <div>
            <h3 className="font-medium">All Class Choices:</h3>
            <UnifiedChoiceSelector
              choices={currentClass.choices}
              selections={classSelections}
              onSelectionsChange={setClassSelections}
            />
          </div>
        )}

        {currentRace && currentRace.choices && (
          <div>
            <h3 className="font-medium">All Race Choices:</h3>
            <UnifiedChoiceSelector
              choices={currentRace.choices}
              selections={raceSelections}
              onSelectionsChange={setRaceSelections}
            />
          </div>
        )}
      </div>

      <div className="flex justify-center pt-6">
        <Button onClick={handleShowSelections}>
          Log Current Selections
        </Button>
      </div>
    </div>
  );
}