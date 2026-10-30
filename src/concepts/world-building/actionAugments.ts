/**
 * ADD ACTION AND DROP ACTION (rpg-project#721): the two ordered ref lists a
 * stat block (`TemplateSpec.AddActions`/`DropActions`) and a placement
 * (`RoomMonsterBinding.AddActions`/`DropActions`) carry, as edits and as the
 * Read back's sentences.
 *
 * THE ENGINE RESOLVES, THE STUDIO CARRIES. The session assembles a creature's
 * weapons at launch in one order (rpg-toolkit `rulebooks/dnd5e/session`
 * `instantiateWithActionAugments`, `augmentActions`): the base's weapons, the
 * stat block's `actions` (a replacement), its add/drop, the placement's
 * `actions` (a replacement), then its add/drop. A drop removes every copy and
 * refuses a weapon absent from the list at its layer. The Read back follows
 * that order from the draft alone: where no layer replaces the list, it says
 * "the kind's weapons" rather than guess what the rulebook gives the base.
 *
 * TYPED REFS, WEAPONS TODAY. The toolkit's grammar names an action as
 * `dnd5e:weapons:<id>` (`dungeonspec/grammar.go placeActionAugment`); a feature
 * or spell ref joins when the catalog names one. Catalog membership is the
 * engine's question, asked at launch, not this module's.
 */
import { DND5E_WEAPON_REF_RE, parseRef } from '@/utils/refs';
import { joinAnd } from './answerVocabulary';
import { castMemberOf } from './cast';
import { normalizeBinding } from './monsterOrderEdits';
import type { RoomDraftDocument, RoomMonsterBinding } from './roomDraft';

export type ActionAugmentKey = 'addActions' | 'dropActions';

/** The engine's sentence for a ref its grammar refuses (rpg-toolkit
 * `dungeonspec/grammar.go placeActionAugment`), or null when it is a weapon
 * ref. The form says it before Apply in the words PutDungeon would. */
export function actionRefRefusal(ref: string): string | null {
  const text = ref.trim();
  if (DND5E_WEAPON_REF_RE.test(text)) return null;
  if (!parseRef(text)) return `"${text}" is not a ref.`;
  return `"${text}" is not a weapon: an action names a weapon as dnd5e:weapons:<id>`;
}

/** The first staged ref the grammar refuses, with its list and index, so the
 * form can land on the field. */
export function firstActionRefRefusal(
  lists: Partial<Record<ActionAugmentKey, readonly string[]>>
): { key: ActionAugmentKey; index: number; message: string } | null {
  for (const key of ['addActions', 'dropActions'] as const) {
    const refs = lists[key] ?? [];
    for (let index = 0; index < refs.length; index += 1) {
      const message = actionRefRefusal(refs[index]);
      if (message) return { key, index, message };
    }
  }
  return null;
}

/** Replace one placement's add or drop list. An empty list is the authored
 * state "none" and drops the key, as `normalizeBinding` does for `actions`. */
export function setMonsterActionAugment(
  binding: RoomMonsterBinding | undefined,
  key: ActionAugmentKey,
  refs: readonly string[]
): RoomMonsterBinding | undefined {
  return normalizeBinding({ ...(binding ?? {}), [key]: [...refs] });
}

/** Move one entry of an ordered list; an out-of-range or no-op move returns
 * the list unchanged. */
export function moveRef(
  refs: readonly string[],
  from: number,
  to: number
): readonly string[] {
  if (from === to || from < 0 || to < 0) return refs;
  if (from >= refs.length || to >= refs.length) return refs;
  const next = [...refs];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** `dnd5e:weapons:light_crossbow` → "a light crossbow". The ref's own id,
 * never a catalog name the web does not have. */
export function weaponNoun(ref: string): string {
  const id = parseRef(ref)?.idParts.join(' ') ?? ref;
  const words = id.replace(/[_-]+/g, ' ').trim();
  return `${/^[aeiou]/i.test(words) ? 'an' : 'a'} ${words}`;
}

/** One Read back line: its text, or the engine law it states. */
export interface ActionSentence {
  text: string;
  law?: 'dropAbsent' | 'noWeapons';
}

/** One authored step the Read back says. */
export interface ActionStep {
  key: ActionAugmentKey;
  ref: string;
  layer: 'template' | 'binding';
  /** A drop whose weapon is not in the list at its layer: the session
   * refuses the run at launch. Only knowable when a layer replaced the list. */
  absent?: boolean;
  /** An add of a weapon the list already holds at its layer: a second copy. */
  again?: boolean;
}

export interface ResolvedActions {
  /** True when a layer's `actions` replaced the kind's weapons, so `refs` is
   * the whole list. */
  known: boolean;
  refs: string[];
  /** Drops of the kind's own weapons, when the list is not known. */
  droppedFromKind: string[];
  steps: ActionStep[];
}

/** The placement's weapons in the session's order, from the draft alone. */
export function resolvedActionsOf(
  document: Readonly<RoomDraftDocument>,
  placementId: string
): ResolvedActions {
  const monster = document.draft.room.monsterDeclarations.find(
    (entry) => entry.id === placementId
  );
  const template = monster
    ? castMemberOf(document, monster.ref)?.template
    : undefined;
  const binding = document.draft.room.monsterBindings?.[placementId];
  const out: ResolvedActions = {
    known: false,
    refs: [],
    droppedFromKind: [],
    steps: [],
  };
  const layer = (
    name: ActionStep['layer'],
    block: Pick<RoomMonsterBinding, 'actions' | ActionAugmentKey> | undefined
  ): void => {
    if (!block) return;
    if (block.actions !== undefined) {
      out.known = true;
      out.refs = [...block.actions];
      out.droppedFromKind = [];
    }
    for (const ref of block.addActions ?? []) {
      const again = out.refs.includes(ref);
      out.refs.push(ref);
      out.steps.push({
        key: 'addActions',
        ref,
        layer: name,
        ...(again ? { again: true } : {}),
      });
    }
    for (const ref of block.dropActions ?? []) {
      const had = out.refs.includes(ref);
      out.refs = out.refs.filter((entry) => entry !== ref);
      if (!had && !out.known) out.droppedFromKind.push(ref);
      out.steps.push({
        key: 'dropActions',
        ref,
        layer: name,
        ...(!had && out.known ? { absent: true } : {}),
      });
    }
  };
  layer('template', template);
  layer('binding', binding);
  return out;
}

/** The Read back's weapon sentences: one per add and drop, then what it
 * fights with. Empty when no layer authors an add or a drop, so a creature
 * with neither reads exactly as it did. */
export function actionAugmentSentences(
  document: Readonly<RoomDraftDocument>,
  placementId: string
): ActionSentence[] {
  const resolved = resolvedActionsOf(document, placementId);
  if (resolved.steps.length === 0) return [];
  const from = (step: ActionStep): string =>
    step.layer === 'template' ? 'from its stat block' : 'by its own orders';
  const sentences: ActionSentence[] = [];
  for (const step of resolved.steps) {
    const noun = weaponNoun(step.ref);
    if (step.key === 'addActions')
      sentences.push({
        text: step.again
          ? `It carries another ${noun.replace(/^an? /, '')}, ${from(step)}.`
          : resolved.known
            ? `It carries ${noun} the kind does not, ${from(step)}.`
            : `It carries ${noun} on top of the kind’s weapons, ${from(step)}.`,
      });
    else if (step.absent)
      sentences.push({
        text: `It drops ${noun} ${from(step)}, but it carries none there.`,
      });
    else sentences.push({ text: `It does not carry ${noun}, ${from(step)}.` });
  }
  if (resolved.steps.some((step) => step.absent))
    sentences.push({ text: '', law: 'dropAbsent' });
  const dropped = resolved.steps.some((step) => step.key === 'dropActions');
  const nouns = resolved.refs.map(weaponNoun);
  if (resolved.known && nouns.length === 0) {
    // The engine will not arm a creature with nothing (rpg-dnd5e-web#1353
    // review): the run is refused at launch, and the Read back says so.
    sentences.push({ text: 'It is left with no weapon.' });
    sentences.push({ text: '', law: 'noWeapons' });
  } else if (resolved.known)
    sentences.push({
      text: `It fights with ${dropped ? 'only ' : ''}${joinAnd(nouns)}${nouns.length > 1 ? ', in that order' : ''}.`,
    });
  else {
    const less = resolved.droppedFromKind.length
      ? ` less ${joinAnd(resolved.droppedFromKind.map(weaponNoun))}`
      : '';
    const then = nouns.length ? `, then ${joinAnd(nouns)}` : '';
    sentences.push({
      text: `It fights with the kind’s weapons${less}${then}.`,
    });
  }
  return sentences;
}
