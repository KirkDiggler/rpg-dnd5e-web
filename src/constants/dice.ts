import type { DiceType } from '@/components/DiceRoller';

export const STANDARD_DICE: Array<{
  id: string;
  type: DiceType;
  label?: string;
}> = [
  { id: 'd4', type: 'd4' },
  { id: 'd6', type: 'd6' },
  { id: 'd8', type: 'd8' },
  { id: 'd10', type: 'd10' },
  { id: 'd12', type: 'd12' },
  { id: 'd20', type: 'd20' },
  { id: 'd100', type: 'd100' },
];

export const ABILITY_DICE: Array<{
  id: string;
  type: DiceType;
  count: number;
  label: string;
}> = [{ id: 'ability-roll', type: 'd6', count: 4, label: 'Ability Score' }];
