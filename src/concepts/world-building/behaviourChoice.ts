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
 * `recipe`) needs nothing from the creature beyond the states its posts and
 * blocking states name. A sequence (`ref`/`body`)
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

/** The states a creature's own `posts` keys and `blockingStates` name, in
 * the order written. */
export function namedBodyStates(
  binding: RoomMonsterBinding | undefined
): string[] {
  const raw = binding as Record<string, unknown> | undefined;
  const posts =
    raw?.posts !== null &&
    typeof raw?.posts === 'object' &&
    !Array.isArray(raw?.posts)
      ? Object.keys(raw.posts as Record<string, unknown>)
      : [];
  const blocking = Array.isArray(raw?.blockingStates)
    ? (raw.blockingStates as unknown[]).filter(
        (state): state is string => typeof state === 'string'
      )
    : [];
  return [...new Set([...blocking, ...posts])].sort();
}

/** A definition's own states, as its `recipe.states` writes them; null when
 * the recipe names no states inline (then nothing here can be checked). */
function recipeStates(definition: Record<string, unknown>): Set<string> | null {
  const recipe = definition.recipe;
  if (recipe === null || typeof recipe !== 'object') return null;
  const states = (recipe as Record<string, unknown>).states;
  return states !== null && typeof states === 'object' && !Array.isArray(states)
    ? new Set(Object.keys(states as Record<string, unknown>))
    : null;
}

const code = (names: readonly string[]): string =>
  names.map((name) => `\`${name}\``).join(', ');

/** Every definition the file declares, in its order, and whether it can be
 * assigned here.
 *
 * FOR A CREATURE, its posts and blocking states are checked against each
 * definition's states (rpg-project#970 review, R26): a definition missing a
 * state the creature posts or blocks in is listed with the reason and not
 * assigned, because the engine refuses that pair ("body has no source
 * state"). This compares names the document itself holds — the creature's
 * `posts` keys and `blockingStates` with the definition's `recipe.states` —
 * and is no rule of the studio's about what runs. */
export function behaviourChoicesOf(
  scope: SiteScope,
  binding?: RoomMonsterBinding,
  owner?: string
): BehaviourChoice[] {
  const named = namedBodyStates(binding);
  return Object.entries(definitionsOf(scope)).map(([id, definition]) => {
    const shape =
      definition !== null && typeof definition === 'object'
        ? (definition as Record<string, unknown>)
        : {};
    if (Object.hasOwn(shape, 'recipe')) {
      const states = recipeStates(shape);
      const missing =
        states === null ? [] : named.filter((state) => !states.has(state));
      if (missing.length > 0)
        return {
          id,
          assignable: false,
          reason: `${owner ?? 'this creature'} holds posts or blocks in ${code(named)}; \`${id}\` has no state ${code(missing)}`,
        };
      return { id, assignable: true };
    }
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
