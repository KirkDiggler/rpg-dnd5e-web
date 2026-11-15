/**
 * The engine's faction-turning rule the studio's editors follow
 * (rpg-project#576, B4). The laws the studio's own read-back once stated
 * left with it (rpg-project#968): the read-back is the engine's.
 */
import type { Stance } from '@/author/factionVocabulary';

/** The stance a declared one turns to when an `until` step holds: its
 * `then` when it names one (rpg-project#717), else the other of hostile and
 * neutral. Allied with no `then` is refused by the decoder and answers
 * itself. The computation the `untilTurns` law states (`factions.go`
 * `turnsTo`). */
export function turnsTo(stance: Stance, then?: Stance): Stance {
  if (then !== undefined) return then;
  if (stance === 'hostile') return 'neutral';
  if (stance === 'neutral') return 'hostile';
  return stance;
}
