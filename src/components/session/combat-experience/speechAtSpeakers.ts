/**
 * speechAtSpeakers — what is being said on the map right now
 * (rpg-project#842, R2; rpg-project#934).
 *
 * A line the viewer caught shows on the map while its notice is on screen:
 *
 * - over the SPEAKER, when the viewer saw who spoke (`speechAtSpeakers`): a
 *   `Speech` that names its speaker and carries words;
 * - at the PLACE the voice came from, when the viewer did not see who spoke
 *   (`voicesAtPlaces`): a `Speech` with no speaker. It names nobody; it only
 *   marks where the voice was.
 *
 * Nothing here decides who heard what: only rows the toast policy already
 * toasts, from acts the server sent, can speak, and every part is read off
 * the message as sent.
 */
import { speechSound } from '../heardBeat';
import { throughMark } from '../sharedVia';
import { speechWords } from './speechLine';
import type { CombatExperienceStoryExchange } from './types';

/**
 * A line with whose senses it came through, when a friend's (rpg-project#935):
 * "Halt! — through Bea". The viewer's own line is unmarked.
 */
function marked(entry: CombatExperienceStoryExchange, line: string): string {
  const context = entry.describeContext;
  const mark = context
    ? throughMark(entry.act, context.viewerMember, context.memberNames)
    : '';
  return mark ? `${line} — ${mark}` : line;
}

/** Each speaker's line on screen, by member id; the newest line wins. */
export function speechAtSpeakers(
  notices: readonly CombatExperienceStoryExchange[]
): ReadonlyMap<string, string> {
  const speech = new Map<string, string>();
  for (const entry of notices) {
    const act = entry.act;
    if (!entry.toastRule || act?.body.case !== 'speech') continue;
    const { speaker, words } = act.body.value;
    if (speaker?.id && words) speech.set(speaker.id, marked(entry, words));
  }
  return speech;
}

/** A voice the viewer heard from someone they did not see, at its place. */
export interface VoiceAtPlace {
  /** The notice it rides on: one cue per spoken thing. */
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** The words, when caught; otherwise how it sounded ("You hear a voice"). */
  readonly line: string;
}

/**
 * Each unseen speaker's voice on screen, at the place it came from.
 *
 * A notice brings its whole exchange's voices with it (rpg-project#934): the
 * reply heard through the wall carries no notice of its own when the line's
 * words reached the viewer, yet it still marks the place it came from, for as
 * long as the line's notice shows. `story` is where those quiet rows are
 * found, by the act tag they share; without it only the notices' own voices
 * show.
 */
export function voicesAtPlaces(
  notices: readonly CombatExperienceStoryExchange[],
  story: readonly CombatExperienceStoryExchange[] = []
): readonly VoiceAtPlace[] {
  const voices: VoiceAtPlace[] = [];
  const seen = new Set<string>();
  const add = (entry: CombatExperienceStoryExchange) => {
    const act = entry.act;
    if (seen.has(entry.id) || act?.body.case !== 'speech') return;
    const speech = act.body.value;
    const sound = speechSound(speech);
    if (!sound?.position) return;
    seen.add(entry.id);
    voices.push(
      Object.freeze({
        id: entry.id,
        x: sound.position.x,
        y: sound.position.y,
        line: marked(
          entry,
          speech.words ??
            speechWords(speech, () => '').headline.replace(/^You hear /, '')
        ),
      })
    );
  };
  for (const entry of notices) {
    if (!entry.toastRule || entry.act?.body.case !== 'speech') continue;
    add(entry);
    if (!entry.group) continue;
    for (const row of story)
      if (row.group === entry.group && row.id !== entry.id) add(row);
  }
  return voices;
}
