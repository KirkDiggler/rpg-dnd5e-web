/**
 * What was said in a watched run, in the game's own words (rpg-project#1006
 * follow-up). A record `speech` beat is read into the act stream's `Speech`
 * message and handed to the game's one formatter, `speechWords`, so the
 * studio and the game say a line the same way: "Guard says to Aldric:
 * “Whoa there…”". The viewer is nobody (the studio's view is the author's),
 * so no line reads "You …".
 *
 * A `barred` beat is said here too: who holds the way and what they held.
 */
import { speechWords } from '@/components/session/combat-experience/speechLine';
import type { RecordRow } from '@/components/session/recordFeed';
import { create } from '@bufbuild/protobuf';
import {
  Loudness,
  PartyKind,
  PartySchema,
  SpeechSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { speechOf, type RunBarred, type RunSpeech } from './runView';
import type { RunSaid } from './studioSession';

const LOUDNESS: Readonly<Record<string, Loudness>> = {
  whisper: Loudness.WHISPER,
  speak: Loudness.SPEAK,
  shout: Loudness.SHOUT,
  scream: Loudness.SCREAM,
};

const member = (id: string) =>
  create(PartySchema, { kind: PartyKind.MEMBER, id });

/** A name and its id, unless the name is the id: "Guard (gate-1)". */
export function namedId(
  id: string,
  names?: ReadonlyMap<string, string>
): string {
  const name = names?.get(id);
  return name && name !== id ? `${name} (${id})` : id;
}

/** The line, as the game says it. */
export function runSpeechLine(
  line: RunSpeech,
  names?: ReadonlyMap<string, string>
): string {
  const speech = create(SpeechSchema, {
    utterance: line.utterance,
    speaker: line.speaker ? member(line.speaker) : undefined,
    spokenTo: line.to ? member(line.to) : undefined,
    words: line.words,
    hops: line.hops,
    loudness: LOUDNESS[line.loudness] ?? Loudness.SPEAK,
  });
  const said = speechWords(speech, (party) =>
    party?.id ? (names?.get(party.id) ?? party.id) : 'someone'
  );
  return said.where ? `${said.headline} (${said.where})` : said.headline;
}

/** "Guard (gate-1) holds this door (open)", "… blocks the way to 4, 2". */
export function barredLine(
  barred: RunBarred,
  names?: ReadonlyMap<string, string>
): string {
  const holder = namedId(barred.barrier, names);
  if (barred.door)
    return `${holder} holds this door${barred.verb ? ` (${barred.verb})` : ''}`;
  return barred.cell
    ? `${holder} blocks the way to ${barred.cell.q}, ${barred.cell.r}`
    : `${holder} blocks the way`;
}

/** What each speaker said in rows [from, upTo): its last line, by member
 * id, for the speech mark on its glyph. A line nobody saw said has no
 * speaker and marks nobody. */
export function saidInStep(
  rows: readonly RecordRow[],
  from: number,
  upTo: number,
  names?: ReadonlyMap<string, string>
): Map<string, RunSaid> {
  const said = new Map<string, RunSaid>();
  for (const line of speechOf(rows, upTo, from)) {
    if (!line.speaker) continue;
    said.set(line.speaker, {
      line: runSpeechLine(line, names),
      ...(line.words !== undefined ? { words: line.words } : {}),
    });
  }
  return said;
}
