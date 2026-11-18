/**
 * speechLine — the one set of words for a `Speech` act (rpg-project#934,
 * slice two of rpg-project#930): one spoken thing, as THIS viewer perceived it.
 *
 * IT RENDERS WHAT THE MESSAGE SAYS AND CALCULATES NOTHING. Every part of a
 * `Speech` is present or absent, never blanked, and an absent part is one the
 * viewer did not perceive:
 *
 * - no `speaker`: the viewer did not see who spoke. The line is "Someone …",
 *   never attributed — not from the place, the words, the option or anything
 *   else on the screen.
 * - no `spokenTo`: no addressee is named.
 * - no `words`: the words did not reach the viewer. A seen speaker "whispers
 *   to the guard"; an unseen one is "a voice".
 * - no `roll`: nothing rolled, or the words were not caught. A roll with no
 *   speaker is "someone rolled N".
 *
 * Reach, rooms and who hears are the server's; `hops` is read as given.
 */
import {
  Loudness,
  type Party,
  type Speech,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { subjectSays, toWhom } from '../sharedVia';

/** Loudness as the verb a line is said with, in its base form. */
export function loudnessBase(loudness: Loudness): string {
  switch (loudness) {
    case Loudness.WHISPER:
      return 'whisper';
    case Loudness.SHOUT:
      return 'shout';
    case Loudness.SCREAM:
      return 'scream';
    default:
      // SPEAK, and UNSPECIFIED which a well-formed Speech never carries: an
      // unmarked line is spoken.
      return 'say';
  }
}

/** Loudness as the verb a line is said with: "says", "shouts". */
export function loudnessVerb(loudness: Loudness): string {
  const base = loudnessBase(loudness);
  return base === 'say' ? 'says' : `${base}s`;
}

/** A voice heard with no words, by loudness: "a voice", "a voice shouting". */
function voicePhrase(loudness: Loudness): string {
  switch (loudness) {
    case Loudness.WHISPER:
      return 'a voice whispering';
    case Loudness.SHOUT:
      return 'a voice shouting';
    case Loudness.SCREAM:
      return 'a scream';
    default:
      return 'a voice';
  }
}

/** How far off a voice carried, from `hops`; '' when the wire sends none. */
export function hopsPhrase(hops: number | undefined): string {
  if (hops === undefined) return '';
  if (hops <= 0) return 'in this room';
  return `${hops} ${hops === 1 ? 'room' : 'rooms'} away`;
}

export interface SpeechWords {
  /** "Aldric shouts to the guard: “Open up!”", "Someone says: “…”". */
  readonly headline: string;
  /** Where an unseen voice came from: "in this room", "1 room away". */
  readonly where: string;
  /** The words exactly as authored, when the viewer caught them. */
  readonly words?: string;
  /** Whether the viewer knows who spoke. */
  readonly speakerSeen: boolean;
}

/**
 * The line a viewer reads for a `Speech`. `name` turns a party into the name
 * the reader knows it by (the describer's own `partyName`); `viewer` is who
 * reads it, so their own line reads "You say …" and a line said to them
 * "… to you" (`subjectSays`, `toWhom`).
 */
export function speechWords(
  speech: Speech,
  name: (party: Party | undefined) => string,
  viewer = ''
): SpeechWords {
  const speakerParty = speech.speaker;
  const speaker = speakerParty?.id
    ? subjectSays(
        [speakerParty.id],
        viewer,
        () => name(speakerParty),
        loudnessBase(speech.loudness),
        loudnessVerb(speech.loudness)
      )
    : '';
  const spokenTo = speech.spokenTo;
  const to = spokenTo?.id
    ? ` to ${toWhom(spokenTo.id, viewer, () => name(spokenTo))}`
    : '';
  const where = speaker ? '' : hopsPhrase(speech.hops);
  const caught = speech.words !== undefined;
  let headline: string;
  if (caught) {
    headline = `${speaker || `Someone ${loudnessVerb(speech.loudness)}`}${to}: “${speech.words}”`;
  } else if (speaker) {
    headline = `${speaker}${to}`;
  } else {
    headline = `You hear ${voicePhrase(speech.loudness)}`;
  }
  return Object.freeze({
    headline,
    where,
    ...(caught ? { words: speech.words } : {}),
    speakerSeen: Boolean(speaker),
  });
}
