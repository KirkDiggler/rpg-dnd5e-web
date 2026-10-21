/**
 * The recent panel's selection (rpg-dnd5e-web#1301): which acts it shows,
 * newest first, behind a family filter.
 */
import {
  ClockMark,
  Family,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import type { CombatExperienceStoryExchange } from './types';

export const RECENT_LIMIT = 10;

/** The filter's chips: a family, with speak answers and fights split out. */
export type RecentCategory =
  | 'act'
  | 'moves'
  | 'reaction'
  | 'answer'
  | 'table'
  | 'state'
  | 'perception'
  | 'fight'
  | 'clock';

export const RECENT_CATEGORIES: readonly {
  key: RecentCategory;
  label: string;
}[] = [
  { key: 'act', label: 'Acts' },
  { key: 'moves', label: 'Moves' },
  { key: 'reaction', label: 'Reactions' },
  { key: 'answer', label: 'Answers' },
  { key: 'state', label: 'State' },
  { key: 'fight', label: 'Fights' },
  { key: 'table', label: 'Table picks' },
  { key: 'perception', label: 'Perception' },
  { key: 'clock', label: 'Clock' },
];

/**
 * The defaults: acts, reactions, state, a speak's answers and fights. Moves
 * are off: off-screen patrols walk while a fight is formed and would fill the
 * panel (a stopgap until the act stream's perception filter, E6).
 */
export const RECENT_DEFAULT: ReadonlySet<RecentCategory> = new Set([
  'act',
  'reaction',
  'answer',
  'state',
  'fight',
]);

export function recentCategory(act: Act): RecentCategory | null {
  switch (act.family) {
    case Family.ACT:
      return act.body.case === 'walk' ? 'moves' : 'act';
    case Family.REACTION:
      return 'reaction';
    case Family.TABLE_ANSWER:
      return act.verb === 'speak' ? 'answer' : 'table';
    case Family.STATE:
      return 'state';
    case Family.PERCEPTION:
      return 'perception';
    case Family.CLOCK: {
      const mark = act.body.case === 'clock' ? act.body.value.mark : undefined;
      return mark === ClockMark.FIGHT_FORMED ||
        mark === ClockMark.FIGHT_DISSOLVED
        ? 'fight'
        : 'clock';
    }
    default:
      return null;
  }
}

/** The newest `limit` story rows whose act passes the filter, newest first. */
export function selectRecent(
  story: readonly CombatExperienceStoryExchange[],
  filter: ReadonlySet<RecentCategory>,
  limit = RECENT_LIMIT
): readonly CombatExperienceStoryExchange[] {
  const picked: CombatExperienceStoryExchange[] = [];
  for (let i = story.length - 1; i >= 0 && picked.length < limit; i--) {
    const entry = story[i]!;
    if (!entry.act) continue;
    const category = recentCategory(entry.act);
    if (category && filter.has(category)) picked.push(entry);
  }
  return picked;
}
