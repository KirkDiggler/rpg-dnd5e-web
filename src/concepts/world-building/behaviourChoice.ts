/**
 * A CREATURE RUNS A BEHAVIOUR THE FILE DEFINES (rpg-project#970). The file's
 * `behaviorDefinitions` are built elsewhere; here a creature is given one.
 *
 * WHAT ASSIGNING WRITES, and nothing else: the creature's `behaviors`, as
 * one binding `{ id, use }` — the id it already used (else `policy`, the
 * castle's), the definition's name — and `behaviorState`, that same id: the
 * one behaviour supplies the creature's state. No `with` and no `items`: the
 * engine refuses both on a concrete (recipe) definition. Posts, blocking
 * states and every other key stay as authored.
 *
 * WHICH DEFINITIONS CAN BE ASSIGNED: a concrete definition (it has a
 * `recipe`) needs nothing from the creature. A sequence (`ref`/`body`)
 * needs the cells it walks, as `items`; this slice does not author them, so
 * it is offered with that reason and not assigned.
 */
import type { RoomMonsterBinding } from './roomDraft';
import type { SiteScope } from './siteScope';

export interface BehaviourChoice {
  id: string;
  assignable: boolean;
  reason?: string;
}

export const DEFAULT_BEHAVIOUR_ID = 'policy';
const NEEDS_CELLS = 'needs cells to walk: edit in the file';
const UNREAD = 'is not a shape this build reads: edit in the file';

function definitionsOf(scope: SiteScope): Record<string, unknown> {
  const raw = scope.unread?.behaviorDefinitions;
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/** Every definition the file declares, in its order, and whether it can be
 * assigned here. */
export function behaviourChoicesOf(scope: SiteScope): BehaviourChoice[] {
  return Object.entries(definitionsOf(scope)).map(([id, definition]) => {
    const shape =
      definition !== null && typeof definition === 'object'
        ? (definition as Record<string, unknown>)
        : {};
    if (Object.hasOwn(shape, 'recipe')) return { id, assignable: true };
    if (Object.hasOwn(shape, 'ref') || Object.hasOwn(shape, 'body'))
      return { id, assignable: false, reason: NEEDS_CELLS };
    return { id, assignable: false, reason: UNREAD };
  });
}

interface BehaviourBinding {
  id?: unknown;
  use?: unknown;
}

/** The binding's own behaviours as written, or undefined. */
export function bindingBehaviours(
  binding: RoomMonsterBinding | undefined
): BehaviourBinding[] | undefined {
  const raw = (binding as Record<string, unknown> | undefined)?.behaviors;
  return Array.isArray(raw) ? (raw as BehaviourBinding[]) : undefined;
}

/** The binding running `definition`: its `behaviors` and `behaviorState`
 * replaced, everything else kept. */
export function assignBehaviour(
  binding: RoomMonsterBinding | undefined,
  definition: string
): RoomMonsterBinding {
  const first = bindingBehaviours(binding)?.[0];
  const id =
    typeof first?.id === 'string' && first.id !== ''
      ? first.id
      : DEFAULT_BEHAVIOUR_ID;
  return {
    ...(binding ?? {}),
    behaviors: [{ id, use: definition }],
    behaviorState: id,
  } as RoomMonsterBinding;
}
