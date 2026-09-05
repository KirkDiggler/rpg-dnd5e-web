/**
 * sessionRefreshKeys — which cached reads a delivered beat invalidates
 * (`useCoalescedSessionRefreshes`), as a pure table so the answer can be
 * tested against real event fixtures rather than read off a component.
 *
 * Lifted out of `SessionEncounterView` unchanged for the beats it already
 * knew; the hold-out (rpg-project#375 §5–§7) adds two rows:
 *
 * - STANCE_CHANGED refreshes what the fold changed — who may be attacked
 *   (`afford`) and what the viewer sees (`view`). A FIGHT_ENDED with cause
 *   BY_STANCE follows on its own row for the members who were in it.
 * - ARRIVED patches the one cached view the arrival lands in: a MONSTER is
 *   a new roster member, so `roster` is re-pulled exactly as on JOINED; a
 *   PROP is a new atlas prop, so `atlas` is. Either way the same verb's
 *   sight refresh may now show it, so `view` rides along.
 *
 * RESERVED PLACEMENTS ARE NEVER DRAWN, and this table is the client's whole
 * part in that: the client draws sightings and atlas props and lists
 * roster rows, and a placement in reserve is in none of them (design
 * §3.7, R6 — absent from every projection for every member). There is no
 * placement list on the wire to draw from, so there is nothing to
 * suppress; the first the client hears of the placement is ARRIVED, and
 * this is where it learns what to re-read.
 */
import {
  EventKind,
  type Event as SessionEvent,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { PlacementKind } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { SessionRefreshKey } from './useCoalescedSessionRefreshes';

export function refreshKeysFor(
  event: SessionEvent,
  member: string
): SessionRefreshKey[] {
  switch (event.body.case) {
    case 'moved':
      return event.body.value.member === member
        ? ['where', 'afford', 'turn']
        : ['view'];
    case 'struck':
    case 'missed':
    case 'activationResult':
    case 'deathSaveRolled':
      return ['characterData', 'afford', 'view'];
    case 'downed':
      return ['characterData', 'afford', 'turn', 'view'];
    case 'fightStarted':
    case 'fightEnded':
      return ['characterData', 'afford', 'turn', 'view'];
    case 'turnEnded':
      return ['characterData', 'afford', 'turn', 'view'];
    case 'ended':
      return ['characterData', 'afford', 'turn', 'view'];
    case 'joined':
      return ['roster'];
    case 'door':
      return ['doors'];
    // DOOR_REVEALED / REGION_REVEALED patch this recipient's cached
    // GetDoors / GetAtlas views in place, per the protos' own doc
    // comment on both messages. Chosen refresh path (deliberate, per
    // rpg-project#886): re-run the now member-scoped GetDoors/GetAtlas
    // rather than splice the event's own doorways/boundaries/props
    // payload into the cached atlas by hand — reveals are rare beats,
    // not a hot path, and reusing the already-proven fetch path costs
    // one extra round trip in exchange for not inventing new
    // merge/dedup logic this wave has no live server to verify
    // against. A doorRevealed door may also compose with a lock, so
    // its DoorInfo belongs in 'doors' too, not atlas alone.
    case 'doorRevealed':
      return ['doors', 'atlas'];
    case 'regionRevealed':
      return ['atlas'];
    // A PROP LEFT THE FLOOR, OR LANDED BACK ON IT. Both patch the
    // held atlas in the same frame in the view; this refetch is the
    // server's own answer landing behind it, exactly as the reveal beats do.
    case 'held':
    case 'dropped':
      return ['atlas'];
    // THE STANCE FOLDED: what the viewer may attack and what they see
    // changed; the fight that dissolves because of it has its own row.
    case 'stanceChanged':
      return ['afford', 'view'];
    // A RESERVED PLACEMENT ENTERED THE RUN: patch the one view it lands in
    // (`Arrived`'s own doc comment — a monster re-pulls GetRoster as JOINED
    // does, a prop re-pulls GetAtlas), and the sight it may now be in.
    case 'arrived':
      return event.body.value.kind === PlacementKind.PROP
        ? ['atlas', 'view']
        : ['roster', 'view'];
    // LOOT REFETCHES NOTHING, and that is design P3 in the refresh
    // table: a body with nothing to give must be indistinguishable
    // from the captain, so this beat cannot trigger work that only a
    // fruitful loot would need. What the looter gained arrives as
    // their own DOOR_REVEALED beat, which refetches on its own line
    // above — the same bytes a successful search produces.
    case 'looted':
    case 'activated':
    case 'exited':
    case undefined:
      return event.kind === EventKind.ENDED
        ? ['characterData', 'afford', 'turn', 'view']
        : [];
  }
}
