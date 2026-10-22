/**
 * heardBeat — ONE set of sentences for a sound reaching this player
 * (`Heard`, rpg-project#569 H5), read by the beat line and the Story log alike
 * so the two cannot drift into two accounts of one sound (`holdingBeat.ts`'s
 * reason).
 *
 * WHAT A HEARD BEAT IS. A kind, the cell it was made at, and how many regions
 * it crossed. NEVER WHO MADE IT (R4): the wire carries no maker, and nothing
 * here composes one — "You hear metal clanging, to the north", never "the
 * guard strikes". Hearing is passive and the server decided who heard (R5),
 * so there is no roll to show either.
 *
 * THE DIRECTION IS PRESENTATION, NOT A RULE. It is the compass bearing from
 * the cell the listener stood on when the beat arrived to the sound's cell,
 * read on the board's own geometry (north is screen-up, `facingYaw.ts`). No
 * distance, no line of sight, no loudness — the server already judged all of
 * that; this only says which way to look.
 */
import { HEX_SIZE } from '@/components/hex-grid/hexMath';
import { worldPositionOf } from './positionBridge';

/** A cell, dungeon-absolute and axial like every position on this seam. */
export interface HeardCell {
  readonly x: number;
  readonly y: number;
}

/** A sound as this module reads it: its kind, where it was made, and how
 * many regions it crossed. */
export interface HeardSound {
  readonly kind: string;
  readonly position?: HeardCell;
  readonly hops: number;
}

/**
 * The sealed rulebook kinds (`clang`, `boom`, `voice`, `crash`) as the
 * phrase a player reads. A kind this client does not know yet is shown as
 * its own raw word rather than hidden: the rulebook owns the vocabulary, so a
 * fifth kind must still reach the player the day it ships.
 */
const SOUND_PHRASES: Readonly<Record<string, string>> = Object.freeze({
  clang: 'metal clanging',
  boom: 'a boom',
  voice: 'a voice',
  crash: 'a crash',
});

export function soundPhrase(kind: string): string {
  return SOUND_PHRASES[kind] ?? kind;
}

/** The eight compass words, counter-clockwise from east — the order the
 * sector arithmetic below indexes. */
const COMPASS = [
  'east',
  'northeast',
  'north',
  'northwest',
  'west',
  'southwest',
  'south',
  'southeast',
] as const;
export type CompassWord = (typeof COMPASS)[number];

/** The compass word from one cell toward another, or undefined for the same
 * cell. Each wire cell goes through the board's own bridge
 * (`positionBridge.worldPositionOf`), so a bearing reads the way the map
 * draws it: +X east, +Z south. */
export function compassFrom(
  from: HeardCell,
  to: HeardCell
): CompassWord | undefined {
  const a = worldPositionOf(from, HEX_SIZE);
  const b = worldPositionOf(to, HEX_SIZE);
  const east = b.x - a.x;
  const north = a.z - b.z;
  if (Math.abs(east) < 1e-9 && Math.abs(north) < 1e-9) return undefined;
  const sector = Math.round(Math.atan2(north, east) / (Math.PI / 4));
  return COMPASS[(sector + 8) % 8];
}

export interface HeardLine {
  /** "You hear metal clanging, to the north" — the kind and which way. */
  readonly headline: string;
  /** "2 rooms away", "In this room". */
  readonly detail: string;
}

/**
 * The sound as a player reads it. `listenerAt` is the cell this player stood
 * on when the beat arrived; absent — no known position yet — the line says
 * the kind and the rooms and leaves the bearing out rather than guessing one.
 *
 * "right here" is said only when the sound was made on the listener's own
 * cell AND crossed no region: both facts agree it is beside them.
 */
export function formatHeardLine(
  heard: HeardSound,
  listenerAt?: HeardCell | null
): HeardLine {
  const phrase = soundPhrase(heard.kind);
  const where =
    listenerAt && heard.position
      ? compassFrom(listenerAt, heard.position)
      : undefined;
  const sameCell =
    listenerAt !== undefined &&
    listenerAt !== null &&
    heard.position !== undefined &&
    where === undefined;
  const bearing =
    where !== undefined
      ? `, to the ${where}`
      : sameCell && heard.hops === 0
        ? ', right here'
        : '';
  const detail =
    heard.hops > 0
      ? `${heard.hops} ${heard.hops === 1 ? 'room' : 'rooms'} away`
      : 'In this room';
  return Object.freeze({
    headline: `You hear ${phrase}${bearing}`,
    detail,
  });
}

/** The one-line form the beat line and the live announcement use:
 * "You hear metal clanging, to the north — 2 rooms away." */
export function heardSentence(
  heard: HeardSound,
  listenerAt?: HeardCell | null
): string {
  const line = formatHeardLine(heard, listenerAt);
  return heard.hops > 0
    ? `${line.headline}, ${line.detail}.`
    : `${line.headline}.`;
}
