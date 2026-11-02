/**
 * actRefreshKeys — which cached reads a delivered act invalidates
 * (rpg-project#630), the act stream's counterpart of `sessionRefreshKeys.ts`.
 *
 * Each act answers with the keys the v1 beats it folds answered with, so
 * moving the funnel onto acts changes no read. The reasons for every row live
 * beside its v1 twin in `sessionRefreshKeys.ts`; this table cites them rather
 * than restating them. `actRefreshKeys.test.ts` pairs each act with the v1
 * event it replaces and asserts equal key sets.
 *
 * A REFUSED ACT names no keys: its body could not be read, so there is
 * nothing to decide from. The funnel's always-on `turn` and `afford` still
 * refresh around it.
 */
import {
  AttackOutcome,
  CastOutcome,
  ClockMark,
  Sense,
  StateKind,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import type { SessionRefreshKey } from './useCoalescedSessionRefreshes';

const COMBAT: SessionRefreshKey[] = ['characterData', 'afford', 'view'];
const FULL: SessionRefreshKey[] = ['characterData', 'afford', 'turn', 'view'];

/** The arrival kind a prop placement carries (Arrival.kind). */
const ARRIVED_PROP = 'prop';

function union(...sets: SessionRefreshKey[][]): SessionRefreshKey[] {
  return [...new Set(sets.flat())];
}

export function refreshKeysForAct(
  act: Act,
  member: string
): SessionRefreshKey[] {
  if (act.refused) return [];
  const body = act.body;
  switch (body.case) {
    // moved: the mover re-reads where they are; everyone else re-reads view.
    case 'walk':
      return body.value.mover?.id === member
        ? ['where', 'afford', 'turn']
        : ['view'];
    // struck / missed, and warded with `turn`; a reaction reads the same.
    case 'attack':
      return body.value.outcome === AttackOutcome.WARDED ? FULL : COMBAT;
    // cast / castMissed / saved, and castWarded with `turn`.
    case 'cast':
      return body.value.results.some((r) => r.outcome === CastOutcome.WARDED)
        ? FULL
        : COMBAT;
    // activated alone refreshes nothing; each result is an activationResult
    // (a stabilized one with `turn`), and each forced save a `saved`.
    case 'activate':
      if (body.value.results.length === 0 && body.value.saves.length === 0) {
        return [];
      }
      return body.value.results.some((r) => r.stabilization) ? FULL : COMBAT;
    // spoke, scoped to the speaker; a folded-in answer adds answered's row.
    case 'speak': {
      const own: SessionRefreshKey[] =
        body.value.by?.id === member ? ['characterData', 'afford'] : [];
      return body.value.answer ? union(own, ['afford', 'view']) : own;
    }
    case 'deathSave':
      return COMBAT;
    case 'loot':
      return [];
    case 'hold':
    case 'drop':
    case 'door':
      return ['view'];
    case 'equip':
      return ['characterData', 'afford'];
    case 'stay':
    case 'sneak':
      return [];
    case 'rest':
      return ['characterData', 'afford', 'turn'];
    // answered refreshes for everybody; tempered refreshes nothing.
    case 'tableAnswer':
      return body.value.dealt ? [] : ['afford', 'view'];
    case 'state':
      switch (body.value.change) {
        case StateKind.DOWNED:
          return FULL;
        case StateKind.STANCE:
          return ['afford', 'view'];
        case StateKind.CONCENTRATION_ENDED:
          return ['characterData', 'turn'];
        // A condition lifted is the activationResult it was on v1.
        case StateKind.CONDITION_REMOVED:
          return COMBAT;
        case StateKind.EXPERIENCE:
          return ['characterData'];
        // A creature's machine moving moves no geometry and changes no sheet.
        case StateKind.MACHINE:
          return [];
        default:
          return [];
      }
    case 'perception':
      switch (body.value.sense) {
        case Sense.SIGHT:
        case Sense.CELLS:
          return ['view', 'roster'];
        // discoveryChecked, scoped to the checked member — the observer.
        case Sense.DISCOVERY:
          return body.value.observer?.id === member
            ? ['characterData', 'afford']
            : [];
        // concealmentRevealed.
        case Sense.REVEAL:
          return ['doors', 'atlas'];
        default:
          return [];
      }
    case 'clock':
      switch (body.value.mark) {
        case ClockMark.TURN_ENDED:
        case ClockMark.FIGHT_FORMED:
        case ClockMark.FIGHT_DISSOLVED:
        case ClockMark.ENDED:
          return FULL;
        case ClockMark.JOINED:
          return ['roster'];
        case ClockMark.ARRIVED:
          return body.value.arrival?.kind === ARRIVED_PROP
            ? ['atlas', 'view']
            : ['roster', 'view'];
        case ClockMark.WINDOW_OPENED:
          return ['afford', 'view'];
        case ClockMark.ROLL_WINDOW_OPENED:
          return ['afford'];
        // A raise cutting beats moves nothing on the page.
        case ClockMark.WAKE_CUT:
          return [];
        default:
          return [];
      }
    case undefined:
      return [];
  }
}
