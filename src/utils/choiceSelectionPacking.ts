import type {
  Choice,
  ChoiceData,
  ChoiceSource,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { ChoiceCategory } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import type {
  FightingStyle,
  Language,
  Skill,
  Tool,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import {
  convertCantripChoiceToProto,
  convertEquipmentChoiceToProto,
  convertExpertiseChoiceToProto,
  convertFeatureChoiceToProto,
  convertLanguageChoiceToProto,
  convertSkillChoiceToProto,
  convertSpellChoiceToProto,
  convertToolChoiceToProto,
} from './choiceConverter';

/**
 * What a ChoiceRenderer hands back for one requirement.
 *
 * The control is generic, so its output is one of two shapes and never a
 * per-requirement type: an array of enum numbers, or an array of strings —
 * spell refs, or the equipment encoding below.
 */
export type RenderedSelection = readonly (string | number)[];

/**
 * The inverse of ChoiceRenderer's emitters: one Choice plus what the renderer
 * handed back, packed into the ChoiceData the wire takes.
 *
 * THE CATEGORY DISPATCHES, NOTHING ELSE. This is the same dispatch
 * ChoiceRenderer already performs to pick a control, run backwards, so a
 * caller can iterate the choices it was given and pack every one of them
 * without knowing what any of them is for. Character creation packs the same
 * conversions by hand at fifteen call sites, each one hand-filtering its
 * category out of the class's list first; a level-up cannot do that, because
 * what a level asks for is whatever the engine says it asks for.
 *
 * Returns null for a category with no packing — the fallback SimpleChoice
 * renders a debug box and produces nothing sendable — so a caller that cannot
 * pack a requirement finds out rather than sending a choice with no selection
 * in it.
 */
export function packChoiceSelection(
  choice: Choice,
  selections: RenderedSelection,
  source: ChoiceSource
): ChoiceData | null {
  const choiceId = choice.id;

  switch (choice.choiceType) {
    case ChoiceCategory.SKILLS:
      return convertSkillChoiceToProto(
        { choiceId, skills: selections as Skill[] },
        source
      );
    case ChoiceCategory.LANGUAGES:
      return convertLanguageChoiceToProto(
        { choiceId, languages: selections as Language[] },
        source
      );
    case ChoiceCategory.TOOLS:
      return convertToolChoiceToProto(
        { choiceId, tools: selections as Tool[] },
        source
      );
    case ChoiceCategory.CANTRIPS:
      return convertCantripChoiceToProto(
        { choiceId, spellRefs: selections as string[] },
        source
      );
    case ChoiceCategory.SPELLS:
      return convertSpellChoiceToProto(
        { choiceId, spellRefs: selections as string[] },
        source
      );
    case ChoiceCategory.EXPERTISE:
      return convertExpertiseChoiceToProto(
        choiceId,
        selections as Skill[],
        source
      );
    case ChoiceCategory.FIGHTING_STYLE: {
      const style = selections[0];
      if (typeof style !== 'number') return null;
      return convertFeatureChoiceToProto(
        { choiceId, featureId: choiceId, selection: style as FightingStyle },
        source
      );
    }
    case ChoiceCategory.EQUIPMENT: {
      const equipment = parseEquipmentSelection(selections);
      if (!equipment) return null;
      return convertEquipmentChoiceToProto(
        {
          choiceId,
          bundleId: equipment.bundleId,
          categorySelections: equipment.categorySelections,
        },
        source
      );
    }
    default:
      return null;
  }
}

/**
 * Whether a requirement has the answer it asked for.
 *
 * THE COUNT COMES OFF THE REQUIREMENT, never off what the requirement is for.
 * `choose_count` says how many values a Choice wants and EnumChoice caps
 * selection at exactly that, so for every enum- or ref-valued requirement the
 * test is the count and nothing more.
 *
 * Equipment is the one shape whose selections are not a flat list of picked
 * values — ChoiceRenderer emits the chosen bundle followed by one `cat<n>:`
 * entry per item — so it is satisfied when a bundle is chosen and every
 * category that bundle declares has been filled. A category left half-filled
 * is not an answer, and reading its length as one would enable a confirm over
 * a request the engine will refuse.
 */
export function isChoiceSatisfied(
  choice: Choice,
  selections: RenderedSelection | undefined
): boolean {
  if (!selections) return false;

  if (choice.options?.case === 'equipmentOptions') {
    const equipment = parseEquipmentSelection(selections);
    if (!equipment) return false;

    const bundle = choice.options.value.bundles.find(
      (candidate) => candidate.id === equipment.bundleId
    );
    if (!bundle) return false;

    return bundle.categoryChoices.every((categoryChoice, index) => {
      const picked = equipment.categorySelections.find(
        (selection) => selection.categoryIndex === index
      );
      return (picked?.equipmentIds.length ?? 0) === categoryChoice.choose;
    });
  }

  return selections.length === choice.chooseCount;
}

/**
 * ChoiceRenderer's equipment encoding, read back.
 *
 * It emits `[bundleId, 'cat<n>:<selectionId>:<name>', ...]`, and the category
 * index is load-bearing: two categories of one bundle are two different
 * questions, so items must go back into the index they were picked under and
 * never be collapsed into one list.
 */
function parseEquipmentSelection(selections: RenderedSelection): {
  bundleId: string;
  categorySelections: Array<{ categoryIndex: number; equipmentIds: string[] }>;
} | null {
  const bundleId = selections[0];
  if (typeof bundleId !== 'string' || bundleId === '') return null;

  const byCategory = new Map<number, string[]>();
  selections.slice(1).forEach((entry) => {
    if (typeof entry !== 'string') return;
    const match = /^cat(\d+):([^:]+)(?::.*)?$/.exec(entry);
    const categoryIndex = match ? Number(match[1]) : 0;
    const equipmentId = match ? match[2] : entry;
    const ids = byCategory.get(categoryIndex) ?? [];
    ids.push(equipmentId);
    byCategory.set(categoryIndex, ids);
  });

  return {
    bundleId,
    categorySelections: [...byCategory.entries()]
      .sort(([left], [right]) => left - right)
      .map(([categoryIndex, equipmentIds]) => ({
        categoryIndex,
        equipmentIds,
      })),
  };
}
