/**
 * Deliberately crude line of sight for the Fog of War concept
 * (rpg-dnd5e-web#605).
 *
 * This does not need to be correct D&D. It needs to be decidable and stable,
 * so the event stream a play session produces is reproducible and can be
 * replayed as a fixture. Real visibility rules belong to the toolkit.
 *
 * The rule: you can see a floor hex if every hex strictly between you and it
 * is open floor. Solid rock blocks, and so does a closed door — but the door
 * itself is still visible, which is why the check excludes the target.
 */

import { getHexLine } from '@/components/hex-grid/hexMath';
import type { PositionLike } from '../events';
import { DOOR_CLOSED, key, type World } from './world';

const blocksSight = (world: World, hexKey: string): boolean => {
  if (!world.hexes.has(hexKey)) return true; // solid rock
  return world.doors.get(hexKey) === DOOR_CLOSED;
};

/** Every floor hex currently visible from `origin`, including `origin`. */
export function visibleFrom(world: World, origin: PositionLike): Set<string> {
  const visible = new Set<string>();

  for (const [targetKey, hex] of world.hexes) {
    const line = getHexLine(origin, hex.position);
    // Exclude both endpoints: standing on a hex does not block your view of
    // it, and a closed door can be seen even though you cannot see past it.
    const blocked = line
      .slice(1, -1)
      .some((between) => blocksSight(world, key(between)));

    if (!blocked) visible.add(targetKey);
  }

  return visible;
}
