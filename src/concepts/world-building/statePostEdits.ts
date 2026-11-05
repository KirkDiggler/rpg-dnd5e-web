/** Edits to a state's post (`blocks`, `holds`; rpg-project#836, #852,
 * #857). Each returns a new recipe and leaves every other field, a field a
 * newer server added included, where it was. The server judges the post at
 * PutDungeon: the door, the cells, the pass. */
import type {
  CreatureState,
  CreatureStates,
  StateHolds,
} from './creatureStates';
import type { RoomGameplayData } from './roomDraft';
import { wallBoundDoorIds } from './structuralDoorEditing';

function withState(
  states: CreatureStates,
  name: string,
  edit: (state: CreatureState) => CreatureState
): CreatureStates {
  const next = { ...states };
  const current = states[name];
  if (typeof current !== 'object') return states;
  Object.defineProperty(next, name, {
    value: edit(current),
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return next;
}

/** `blocks: true`, or no `blocks` at all: false is the absent default. */
export function setStateBlocks(
  states: CreatureStates,
  name: string,
  blocks: boolean
): CreatureStates {
  return withState(states, name, (state) => {
    if (blocks) return { ...state, blocks: true };
    const next = { ...state };
    delete next.blocks;
    return next;
  });
}

/** A whole post, or none. A new post starts on the first door offered. */
export function setStateHolds(
  states: CreatureStates,
  name: string,
  holds: StateHolds | undefined
): CreatureStates {
  return withState(states, name, (state) => {
    const next = { ...state };
    if (holds) next.holds = holds;
    else delete next.holds;
    return next;
  });
}

/** One field of a post; `undefined` removes it (an absent against is both,
 * an absent at is the placed cell, an absent pass lets nobody through). */
export function patchStateHolds(
  states: CreatureStates,
  name: string,
  patch: Partial<StateHolds>
): CreatureStates {
  return withState(states, name, (state) => {
    if (!state.holds) return state;
    const holds: StateHolds = { ...state.holds };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete holds[key];
      else holds[key] = value;
    }
    return { ...state, holds };
  });
}

/** The doors a post may name: every wall-bound door and every bound door
 * prop, in that order, each once. */
export function roomDoorIds(
  room?: Pick<RoomGameplayData, 'walls' | 'doorBindings'>
): string[] {
  return [
    ...new Set([
      ...(room?.walls ?? []).flatMap(wallBoundDoorIds),
      ...Object.keys(room?.doorBindings ?? {}),
    ]),
  ];
}
