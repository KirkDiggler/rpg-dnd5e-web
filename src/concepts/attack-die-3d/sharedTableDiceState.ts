import type { DiceRollGroupKey } from '../../components/ui/dice/diceRollGroup';
import type {
  SharedTableDiceScenario,
  SharedTableDiceScenarioId,
} from './sharedTableDiceFixtures';

export type SharedTableDicePhase =
  | 'attack'
  | 'attack-verdict'
  | 'damage'
  | 'impact'
  | 'complete';

export interface SharedTableDiceActivePresentation {
  readonly presentationId: string;
  readonly groupKey: DiceRollGroupKey;
  readonly generations: Readonly<{
    roller?: number;
    spectator?: number;
  }>;
  readonly completed: Readonly<{
    roller: boolean;
    spectator: boolean;
  }>;
}

export interface SharedTableDiceState {
  readonly scenarioId: SharedTableDiceScenarioId;
  readonly phase: SharedTableDicePhase;
  readonly activePresentation?: SharedTableDiceActivePresentation;
}

function expectedGroupKey(
  phase: SharedTableDicePhase
): DiceRollGroupKey | undefined {
  if (phase === 'attack') return 'attack';
  if (phase === 'damage') return 'damage';
  return undefined;
}

function completedBarrier(active: SharedTableDiceActivePresentation): boolean {
  return (
    active.generations.roller !== undefined &&
    active.generations.spectator !== undefined &&
    active.completed.roller &&
    active.completed.spectator
  );
}

export function reduceSharedTableDice(
  state: SharedTableDiceState,
  action:
    | {
        readonly type: 'presentation-mounted';
        readonly presentationId: string;
        readonly groupKey: DiceRollGroupKey;
        readonly witnessRole: 'roller' | 'spectator';
        readonly rendererGeneration: number;
      }
    | {
        readonly type: 'group-complete';
        readonly presentationId: string;
        readonly groupKey: DiceRollGroupKey;
        readonly witnessRole: 'roller' | 'spectator';
        readonly rendererGeneration: number;
      }
    | { readonly type: 'verdict-complete' }
    | { readonly type: 'impact-complete' },
  scenario: SharedTableDiceScenario
): SharedTableDiceState {
  switch (action.type) {
    case 'presentation-mounted': {
      const groupKey = expectedGroupKey(state.phase);
      if (!groupKey || action.groupKey !== groupKey) return state;
      if (!state.activePresentation)
        return {
          ...state,
          activePresentation: {
            presentationId: action.presentationId,
            groupKey: action.groupKey,
            generations: { [action.witnessRole]: action.rendererGeneration },
            completed: { roller: false, spectator: false },
          },
        };
      if (
        state.activePresentation.presentationId !== action.presentationId ||
        state.activePresentation.groupKey !== action.groupKey
      )
        return state;
      if (
        state.activePresentation.generations[action.witnessRole] ===
          action.rendererGeneration &&
        state.activePresentation.completed[action.witnessRole] === false
      )
        return state;
      return {
        ...state,
        activePresentation: {
          ...state.activePresentation,
          generations: {
            ...state.activePresentation.generations,
            [action.witnessRole]: action.rendererGeneration,
          },
          completed: {
            ...state.activePresentation.completed,
            [action.witnessRole]: false,
          },
        },
      };
    }
    case 'group-complete': {
      if (!state.activePresentation) return state;
      if (
        state.activePresentation.presentationId !== action.presentationId ||
        state.activePresentation.groupKey !== action.groupKey ||
        state.activePresentation.generations[action.witnessRole] !==
          action.rendererGeneration ||
        state.activePresentation.completed[action.witnessRole]
      )
        return state;
      const activePresentation: SharedTableDiceActivePresentation = {
        ...state.activePresentation,
        completed: {
          ...state.activePresentation.completed,
          [action.witnessRole]: true,
        },
      };
      if (!completedBarrier(activePresentation))
        return { ...state, activePresentation };
      return {
        ...state,
        phase: state.phase === 'attack' ? 'attack-verdict' : 'impact',
        activePresentation,
      };
    }
    case 'verdict-complete':
      if (state.phase !== 'attack-verdict') return state;
      if (scenario.hit && scenario.damage)
        return {
          scenarioId: state.scenarioId,
          phase: 'damage',
        };
      return {
        scenarioId: state.scenarioId,
        phase: 'complete',
      };
    case 'impact-complete':
      if (state.phase !== 'impact') return state;
      return {
        scenarioId: state.scenarioId,
        phase: 'complete',
      };
  }
}
