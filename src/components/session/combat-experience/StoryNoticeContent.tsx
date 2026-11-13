import {
  AttackOutcome,
  Loudness,
  Sense,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import type { ReactElement } from 'react';
import { friendNames, throughFriends } from '../sharedVia';
import {
  damageWord,
  formatRollFormula,
  partyName,
  type DescribeContext,
} from './describeAct';
import { RecentEventSummary } from './RecentEventSummary';
import { hopsPhrase } from './speechLine';
import styles from './StoryNotices.module.css';
import type { CombatExperienceStoryExchange } from './types';

/** Applied amounts and roll components are distinct provider facts, never a client sum. */
function NoticeContent({
  entry,
  showDescription = true,
}: {
  entry: CombatExperienceStoryExchange;
  showDescription?: boolean;
}): ReactElement {
  const { act, describeContext: context } = entry;
  if (!act || !context || act.refused)
    return (
      <RecentEventSummary entry={entry} showDescription={showDescription} />
    );
  if (act.body.case === 'attack') {
    const attack = act.body.value;
    const hit = attack.outcome === AttackOutcome.HIT;
    const verdict = hit
      ? attack.critical
        ? 'Critical hit'
        : 'Hit'
      : attack.outcome === AttackOutcome.MISS
        ? 'Miss'
        : attack.outcome === AttackOutcome.WARDED
          ? 'Warded'
          : 'Attack';
    const types = attack.damageComponents.length
      ? [
          ...new Set(
            attack.damageComponents.map(
              (part) => damageWord(part.damageType) || 'Type not supplied'
            )
          ),
        ].join(' + ')
      : damageWord(attack.attack?.damageType) || 'Type not supplied';
    return (
      <div className={styles.content}>
        <h3 className={styles.result}>
          {hit ? (
            <>
              <strong className={styles.amount}>{attack.damage}</strong>{' '}
              <span>Damage</span>
            </>
          ) : (
            verdict
          )}
        </h3>
        <p className={styles.participants}>
          {partyName(attack.by, context)} → {partyName(attack.to, context)}
        </p>
        <p>
          {hit ? `${types} · ${verdict}` : verdict}
          {attack.attack?.name ? ` · ${attack.attack.name}` : ''}
        </p>
        {attack.outcome === AttackOutcome.WARDED && (
          <p>
            Ward source:{' '}
            {attack.ward?.source
              ? partyName(attack.ward.source, context)
              : 'Not supplied'}
          </p>
        )}
        <RecentEventSummary entry={entry} showDescription={false} />
      </div>
    );
  }
  if (act.body.case === 'speech') {
    return (
      <div className={styles.content}>
        <SpeechFacts act={act} context={context} />
        <RecentEventSummary entry={entry} showDescription={showDescription} />
      </div>
    );
  }
  const amounts =
    act.body.case === 'activate'
      ? act.body.value.results.filter(
          (result) => result.kind === 'healed' || result.kind === 'damaged'
        )
      : [];
  return (
    <div className={styles.content}>
      {amounts.map((result, index) => (
        <div key={index} data-result-kind={result.kind}>
          <h3 className={styles.result}>
            <strong className={styles.amount}>{result.amount}</strong>{' '}
            <span>{result.kind === 'healed' ? 'Healing' : 'Damage'}</span>
          </h3>
          <p>
            {result.target
              ? partyName(result.target, context)
              : 'Target not supplied'}
            {result.kind === 'damaged'
              ? ` · ${damageWord(result.damageType) || 'Type not supplied'}`
              : ''}
          </p>
        </div>
      ))}
      {/* DETAILS ARE NEVER EMPTY: an act with no amount and no roll shows
          its own line here rather than opening onto nothing. */}
      <RecentEventSummary
        entry={entry}
        showDescription={
          showDescription ||
          (amounts.length === 0 && !formatRollFormula(act, context))
        }
      />
    </div>
  );
}

const LOUDNESS_WORD: Readonly<Record<Loudness, string>> = {
  [Loudness.UNSPECIFIED]: 'Spoken',
  [Loudness.WHISPER]: 'Whispered',
  [Loudness.SPEAK]: 'Spoken',
  [Loudness.SHOUT]: 'Shouted',
  [Loudness.SCREAM]: 'Screamed',
};

/**
 * What one spoken thing's Details say (rpg-project#934): each part as the
 * viewer perceived it, and plainly what they did not. Read off the message
 * only — an absent part is "not seen" or "not caught", never a guess.
 */
/**
 * A notice's Details (rpg-project#934, #935): the act's own content, and —
 * for an entry that came through a friend — whose senses it came through, as
 * a row ("Through: Bea"). A spoken thing carries that row in its own facts.
 */
export function StoryNoticeContent(props: {
  entry: CombatExperienceStoryExchange;
  showDescription?: boolean;
}): ReactElement {
  const { act, describeContext: context } = props.entry;
  const friends =
    act && context && act.body.case !== 'speech'
      ? throughFriends(act, context.viewerMember)
      : [];
  if (friends.length === 0) return <NoticeContent {...props} />;
  return (
    <>
      <NoticeContent {...props} />
      <dl className={styles.facts} data-testid="through-facts">
        <div>
          <dt>Through</dt>
          <dd>{friendNames(friends, context?.memberNames)}</dd>
        </div>
      </dl>
    </>
  );
}

function SpeechFacts({ act, context }: { act: Act; context: DescribeContext }) {
  if (act.body.case !== 'speech') return null;
  const speech = act.body.value;
  const senses = act.perceived?.senses ?? [];
  const saw = senses.includes(Sense.SIGHT);
  const heard = senses.includes(Sense.HEARING);
  const rows: [string, string][] = [
    [
      'Perceived',
      saw && heard
        ? 'Seen and heard'
        : saw
          ? 'Seen, not heard'
          : heard
            ? 'Heard, not seen'
            : 'Not stated',
    ],
    [
      'Speaker',
      speech.speaker?.id ? partyName(speech.speaker, context) : 'Not seen',
    ],
    [
      'Said to',
      speech.spokenTo?.id ? partyName(speech.spokenTo, context) : 'Not named',
    ],
    ['Words', speech.words !== undefined ? `“${speech.words}”` : 'Not caught'],
    ['Loudness', LOUDNESS_WORD[speech.loudness] ?? 'Spoken'],
  ];
  const where = hopsPhrase(speech.hops);
  if (!speech.speaker?.id && where) rows.push(['From', where]);
  const friends = throughFriends(act, context.viewerMember);
  if (friends.length)
    rows.push(['Through', friendNames(friends, context.memberNames)]);
  return (
    <dl className={styles.facts} data-testid="speech-facts">
      {rows.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
