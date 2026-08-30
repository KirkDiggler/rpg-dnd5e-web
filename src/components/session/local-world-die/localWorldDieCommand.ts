import type { VisualThrowProfileV1 } from '@/components/ui/dice/visualThrowProfile';
import type {
  LocalWorldDiePlanTerminal,
  LocalWorldDieRigidBodyState,
} from './localWorldDiePreSimulation';
import type { LocalWorldDieWitnessPlan } from './localWorldDieWitnessPlan';

export interface LocalWorldDieHeldState {
  readonly position: readonly [number, number];
  readonly height: number;
}

export type LocalWorldDieCommand =
  | Readonly<{ id: number; kind: 'reset' }>
  | Readonly<{ id: number; kind: 'held'; held: LocalWorldDieHeldState }>
  | Readonly<{
      id: number;
      kind: 'released';
      held: LocalWorldDieHeldState;
      profile: VisualThrowProfileV1;
      plannedTerminal?: LocalWorldDiePlanTerminal;
    }>
  | Readonly<{
      id: number;
      kind: 'witness';
      plan: LocalWorldDieWitnessPlan;
    }>;

export function localWorldDieDynamicState(
  command: LocalWorldDieCommand
): LocalWorldDieRigidBodyState | undefined {
  return command.kind === 'witness' ? command.plan.initialState : undefined;
}

export function localWorldDieCommandTerminal(
  command: LocalWorldDieCommand
): LocalWorldDiePlanTerminal | undefined {
  if (command.kind === 'witness') return command.plan.terminal;
  return command.kind === 'released' ? command.plannedTerminal : undefined;
}
