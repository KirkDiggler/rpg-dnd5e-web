/**
 * Fixture authority (rpg-dnd5e-web#605).
 *
 * The cases the play loop must reach, per
 * rpg-project/ideas/fog-of-war/design.md §"Authored world and play loop".
 *
 * Note on case 7: the design pictured a monster walking out of sight and
 * freezing where it was last seen. In this fixture the doorway hex is visible
 * from everywhere in Room A (see los.test.ts), so backing away never loses
 * sight of what is beyond it — an entity that walks out of a visible hex is
 * simply seen to leave. What freezes a memory is the *hex* ceasing to be
 * visible while something is standing on it, and here the door closing is
 * what does that.
 */

import { describe, expect, it } from 'vitest';
import type { HexKnowledgeChanged, HexRecord } from '../events';
import { createAuthority } from './authority';
import { at, DOOR_CLOSED, DOOR_OPEN, key, twoRoomCrypt } from './world';

const recordAt = (
  event: HexKnowledgeChanged,
  q: number,
  r: number
): HexRecord | undefined =>
  event.hexes.find((hex) => key(hex.position) === key(at(q, r)));

const inRoomB = (record: HexRecord) => record.zoneId === 'room-b';
const goblinAt = (facing: number) => [{ entityId: 'goblin-1', facing }];

/** Viewer in Room A watching the goblin through the open doorway. */
const watchingTheGoblin = () => {
  const world = twoRoomCrypt();
  world.placements.set('goblin-1', { hex: at(4, 1), facing: 0 });
  const authority = createAuthority(world);
  authority.subscribe();
  return { authority, opened: authority.setDoor(at(3, 1), DOOR_OPEN) };
};

describe('fixture authority', () => {
  it('discloses only what the viewer can see, and says nothing about the rest', () => {
    const authority = createAuthority(twoRoomCrypt());

    const first = authority.subscribe();

    expect(first.hexes.length).toBeGreaterThan(0);
    expect(first.hexes.every((hex) => hex.state === 'VISIBLE')).toBe(true);
    // Room B is behind a closed door. It is not mentioned at all — unseen is
    // omission, not an empty record.
    expect(first.hexes.some(inRoomB)).toBe(false);
    // Nor is the goblin standing in it disclosed.
    expect(first.entities).toEqual([]);
  });

  it('opening the door reveals part of Room B, not Room B', () => {
    const authority = createAuthority(twoRoomCrypt());
    authority.subscribe();

    const roomB = authority.setDoor(at(3, 1), DOOR_OPEN).hexes.filter(inRoomB);

    expect(roomB).toHaveLength(4); // of nine
    expect(roomB.some((hex) => key(hex.position) === key(at(4, 1)))).toBe(true);
    expect(roomB.some((hex) => key(hex.position) === key(at(4, 0)))).toBe(
      false
    );
  });

  it('emits nothing at all for a change the viewer cannot see', () => {
    const authority = createAuthority(twoRoomCrypt());
    authority.subscribe();

    const hidden = authority.mutateHidden((world) => {
      world.placements.set('goblin-1', { hex: at(6, 2), facing: 3 });
    });

    expect(hidden.hexes).toEqual([]);
    expect(hidden.entities).toEqual([]);
  });

  it('freezes the entity on the hex when that hex stops being visible', () => {
    // design.md case 7. The door shuts while the goblin is standing there.
    const { authority, opened } = watchingTheGoblin();
    expect(recordAt(opened, 4, 1)?.contents).toEqual(goblinAt(0));

    const shut = authority.setDoor(at(3, 1), DOOR_CLOSED);
    const frozen = recordAt(shut, 4, 1);

    expect(frozen?.state).toBe('REMEMBERED');
    expect(frozen?.contents).toEqual(goblinAt(0));
  });

  it('a frozen memory survives the entity moving away unseen', () => {
    const { authority } = watchingTheGoblin();
    authority.setDoor(at(3, 1), DOOR_CLOSED);

    const wandered = authority.mutateHidden((world) => {
      world.placements.set('goblin-1', { hex: at(6, 2), facing: 3 });
    });

    expect(wandered.hexes).toEqual([]);
  });

  it('re-sighting the frozen hex reports it empty', () => {
    // design.md case 8 — the load-bearing one, end to end.
    const { authority } = watchingTheGoblin();
    authority.setDoor(at(3, 1), DOOR_CLOSED);
    authority.mutateHidden((world) => {
      world.placements.set('goblin-1', { hex: at(6, 2), facing: 3 });
    });

    const resighted = recordAt(authority.setDoor(at(3, 1), DOOR_OPEN), 4, 1);

    expect(resighted?.state).toBe('VISIBLE');
    expect(resighted?.contents).toEqual([]);
  });

  it('an entity leaving a still-visible hex is seen to leave, not frozen', () => {
    // The other half of case 7: no ghost, because the viewer watched it go.
    const { authority } = watchingTheGoblin();

    const [walked] = authority.moveEntity('goblin-1', [at(6, 2)]);
    const vacated = recordAt(walked!, 4, 1);

    expect(vacated?.state).toBe('VISIBLE');
    expect(vacated?.contents).toEqual([]);
  });

  it('repeats nothing when nothing changed', () => {
    const authority = createAuthority(twoRoomCrypt());
    authority.subscribe();

    expect(authority.moveViewer(authority.viewerHex()).hexes).toEqual([]);
  });
});
