import { AttackOutcome } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import type { ReactElement } from 'react';
import { damageWord, partyName } from './describeAct';
import { RecentEventSummary } from './RecentEventSummary';
import styles from './StoryNotices.module.css';
import type { CombatExperienceStoryExchange } from './types';

/** Applied amounts and roll components are distinct provider facts, never a client sum. */
export function StoryNoticeContent({
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
      <RecentEventSummary entry={entry} showDescription={showDescription} />
    </div>
  );
}
