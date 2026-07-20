/**
 * organizeVerbs — turns the server's flat AvailableAction list into the
 * command bar's structure: core verbs flat in the bar, everything else
 * grouped by where it comes from (rpg-dnd5e-web#525 round 3, Kirk's busy-kit
 * concern: "group them by ... wherever they would come from").
 *
 * The wire already carries provenance — AvailableAction.ref.type
 * ("combat_abilities"/"actions" = core; "feature", "spell", "item", ... are
 * the toolkit's open-ended vocabulary) — so grouping is pure presentation
 * of server data. Cost mapping is the same story: economy_slot → pool shape,
 * 1:1; the server decides what each action costs, the web never infers.
 *
 * Promoted from the /concepts CommandBar (design record) so the live dock
 * and the concept compositions organize verbs identically.
 */

import type {
  ActionEconomy,
  AvailableAction,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { EconomySlot } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import type { CostShape } from './VerbButton';

/** Core verbs stay flat in the bar; everything else groups by provenance. */
export const CORE_TYPES = new Set(['actions', 'combat_abilities']);

/** Core verbs shown flat before the tail folds into the drop-up's
 * "Actions" section — keeps the bar one row at Discord width. */
export const INLINE_CORE_LIMIT = 5;

/** Known provenance labels; anything unknown gets sentence-cased so future
 * ref.types render reasonably instead of breaking the menu. The wire uses
 * plural type names (rpg-api emits "dnd5e:features:rage"); singulars are
 * kept for the concept fixtures that predate that observation. */
const GROUP_LABELS: Record<string, string> = {
  feature: 'Features',
  features: 'Features',
  spell: 'Spells',
  spells: 'Spells',
  item: 'Items',
  items: 'Items',
};

export function groupLabel(refType: string): string {
  if (GROUP_LABELS[refType]) return GROUP_LABELS[refType];
  const words = refType.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface VerbGroup {
  label: string;
  actions: AvailableAction[];
}

function groupByProvenance(extras: AvailableAction[]): VerbGroup[] {
  const groups: VerbGroup[] = [];
  for (const a of extras) {
    const label = groupLabel(a.ref?.type ?? 'other');
    const existing = groups.find((g) => g.label === label);
    if (existing) existing.actions.push(a);
    else groups.push({ label, actions: [a] });
  }
  return groups;
}

export interface OrganizedVerbs {
  /** Flat in the bar, in server order, capped at INLINE_CORE_LIMIT. */
  core: AvailableAction[];
  /** Drop-up sections: overflowed core first (as "Actions"), then one
   * section per non-core ref.type in first-seen order. */
  groups: VerbGroup[];
  /** Total actions living in the drop-up. */
  menuCount: number;
  /** Trigger says what it holds: one group reads by name ("Features ▾ 4");
   * several fall back to a total ("More ▾ N"). */
  triggerLabel: string;
}

export function organizeVerbs(actions: AvailableAction[]): OrganizedVerbs {
  const allCore = actions.filter((a) => CORE_TYPES.has(a.ref?.type ?? ''));
  const core = allCore.slice(0, INLINE_CORE_LIMIT);
  const coreOverflow = allCore.slice(INLINE_CORE_LIMIT);
  const extras = actions.filter((a) => !CORE_TYPES.has(a.ref?.type ?? ''));
  const groups = [
    ...(coreOverflow.length > 0
      ? [{ label: 'Actions', actions: coreOverflow }]
      : []),
    ...groupByProvenance(extras),
  ];
  const menuCount = coreOverflow.length + extras.length;
  const triggerLabel =
    groups.length === 1
      ? `${groups[0].label} ▾ ${groups[0].actions.length}`
      : `More ▾ ${menuCount}`;
  return { core, groups, menuCount, triggerLabel };
}

/** economy_slot → pool shape, 1:1 — presentation mapping only. Slots
 * without a pool (movement, free) get no badge. */
const SLOT_SHAPE: Partial<Record<EconomySlot, CostShape>> = {
  [EconomySlot.ACTION]: 'action',
  [EconomySlot.BONUS_ACTION]: 'bonus',
  [EconomySlot.REACTION]: 'reaction',
};

/** The badge VerbButton renders for this action: which pool it draws from
 * and whether that pool is currently spent. `economy` absent (pre-turnState
 * window) renders badges as unspent rather than hiding them. */
export function verbCost(
  action: AvailableAction,
  economy: ActionEconomy | null | undefined
): { shape: CostShape; spent: boolean } | undefined {
  const shape = SLOT_SHAPE[action.economySlot];
  if (!shape) return undefined;
  const remaining = economy
    ? {
        action: economy.actionsRemaining,
        bonus: economy.bonusActionsRemaining,
        reaction: economy.reactionsRemaining,
      }[shape]
    : 1;
  return { shape, spent: remaining === 0 };
}
