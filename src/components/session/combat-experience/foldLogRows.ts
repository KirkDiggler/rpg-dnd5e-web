/**
 * foldLogRows — the story log's movement fold (rpg-dnd5e-web#1301, R35) and
 * the idle hold-pick filter (R36, proposed).
 *
 * OUT-OF-COMBAT MOVEMENT IS SCENE, NOT STORY (R35). With no fight formed, a
 * creature's consecutive walks fold into one collapsed row — "Gate Guard
 * walked 14 cells" — until that creature does anything other than walk or a
 * fight forms. Other creatures' acts in between do not break the stretch: a
 * patrol of three guards is three rows, not thirty. The row expands to its
 * walks. In a fight every walk stays its own row.
 *
 * IDLE HOLD PICKS (R36, PROPOSED). A table answer whose word is `hold` is a
 * creature's idle `time` pick: it is hidden from the log and never toasts.
 * This presentation filter stands only while R36 is proposed; when R36 is
 * ticked the session fold drops the pick (toolkit `act_family.go`) and this
 * filter is deleted.
 *
 * DASH PICKS (rpg-dnd5e-web#1341). A table answer whose word is `dash` is a
 * creature choosing to run. The run itself is the walk it causes, which the
 * describer reads as "<name> runs"; that walk reaches this viewer only when
 * they saw it. The pick is hidden from the log and never toasts, so a run is
 * one line and is told under the walk's own visibility. The Debug panel keeps
 * the pick and its roll.
 */
import type { Act } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { actorOf, isDeed } from './toastPolicy';
import type { CombatExperienceStoryExchange } from './types';

/** An idle `time` pick: a table answer with word `hold` (R36, proposed). */
export function isIdleHoldPick(act: Act): boolean {
  return (
    act.body.case === 'tableAnswer' &&
    !act.body.value.dealt &&
    act.body.value.word === 'hold'
  );
}

/** A creature's `dash` pick: its run is told by the walk it causes. */
export function isDashPick(act: Act): boolean {
  return (
    act.body.case === 'tableAnswer' &&
    !act.body.value.dealt &&
    act.body.value.word === 'dash'
  );
}

export type LogRow =
  | { readonly kind: 'entry'; readonly entry: CombatExperienceStoryExchange }
  | {
      readonly kind: 'walks';
      /** The first walk's row id, so the fold keeps its place. */
      readonly id: string;
      /** The walker's party id. */
      readonly mover: string;
      readonly cells: number;
      readonly walks: readonly CombatExperienceStoryExchange[];
    };

/**
 * The log's rows: each story entry, with every out-of-combat stretch of one
 * creature's walks folded into a single row at the stretch's first walk.
 * Entries without an act, and walks in a fight, pass through as rows.
 */
export function foldLogRows(
  story: readonly CombatExperienceStoryExchange[]
): readonly LogRow[] {
  interface Stretch {
    kind: 'walks';
    id: string;
    mover: string;
    cells: number;
    walks: CombatExperienceStoryExchange[];
  }
  const rows: (LogRow | Stretch)[] = [];
  const open = new Map<string, Stretch>();
  for (const entry of story) {
    const act = entry.act;
    if (!act) {
      rows.push({ kind: 'entry', entry });
      continue;
    }
    if (entry.fightEdge === 'formed') open.clear(); // a fight ends every stretch
    const mover = isDeed(act) ? actorOf(act)?.id : undefined;
    if (act.body.case === 'walk' && mover && !entry.inFight) {
      const cells = act.body.value.path.length;
      const stretch = open.get(mover);
      if (stretch) {
        stretch.walks.push(entry);
        stretch.cells += cells;
        continue;
      }
      const row: Stretch = {
        kind: 'walks',
        id: entry.id,
        mover,
        cells,
        walks: [entry],
      };
      open.set(mover, row);
      rows.push(row);
      continue;
    }
    // Anything else the creature does ends its stretch.
    if (mover) open.delete(mover);
    rows.push({ kind: 'entry', entry });
  }
  return rows;
}
