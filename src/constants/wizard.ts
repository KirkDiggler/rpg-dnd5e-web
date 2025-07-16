export type WizardStep =
  | 'name'
  | 'race'
  | 'class'
  | 'ability-scores'
  | 'skills'
  | 'background'
  | 'review';

export const WIZARD_STEPS: WizardStep[] = [
  'name',
  'race',
  'class',
  'ability-scores',
  'skills',
  'background',
  'review',
];

export const STEP_TITLES: Record<WizardStep, string> = {
  name: 'Name Your Character',
  race: 'Choose Your Race',
  class: 'Select Your Class',
  'ability-scores': 'Set Ability Scores',
  skills: 'Choose Skills',
  background: 'Select Background',
  review: 'Review & Finalize',
};
