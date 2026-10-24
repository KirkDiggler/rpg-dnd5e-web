import { Inspectable } from '@/components/ui/inspection/Inspectable';
import { ActionArt } from './ActionArt';
import type { PresentedCharacterData } from './characterPresentation';
import {
  characterStatusEntries,
  type CharacterStatusEntry,
  type CharacterStatusNote,
} from './characterStatusEntries';
import styles from './CharacterStatusRail.module.css';
import type { CombatExperienceProps } from './types';

const kindLabel = {
  feature: 'Owned feature',
  condition: 'Character effect',
  resource: 'Resource',
  status: 'Character status',
};
function StatusDetails({
  entry,
  memberNames,
  identity = true,
  notice,
}: {
  entry: CharacterStatusEntry;
  memberNames?: ReadonlyMap<string, string>;
  identity?: boolean;
  notice?: string;
}) {
  return (
    <div className={styles.details}>
      {identity && (
        <header>
          <span className={styles.detailArt} data-tone={entry.art.tone}>
            <ActionArt art={entry.art} label={entry.name} />
          </span>
          <div>
            <small>{kindLabel[entry.kind]}</small>
            <strong>{entry.name}</strong>
          </div>
        </header>
      )}
      {notice && <p className={styles.missing}>{notice}</p>}
      {entry.detail && <p>{entry.detail}</p>}
      {entry.resource && (
        <dl>
          <div>
            <dt>{entry.resource.name}</dt>
            <dd>
              {entry.resource.current}/{entry.resource.maximum}
            </dd>
          </div>
        </dl>
      )}
      {entry.resourceMissing && (
        <p className={styles.missing}>Resource details unavailable.</p>
      )}
      {entry.sourceMember && (
        <p className={styles.source}>
          Source: {memberNames?.get(entry.sourceMember) ?? 'Name unavailable'}
        </p>
      )}
      {!entry.detail && !entry.resource && !entry.resourceMissing && (
        <p className={styles.source}>No further details supplied.</p>
      )}
    </div>
  );
}
/** Inspection only. Never activates a feature or derives its applicability. */
export function CharacterStatusRail({
  character,
  notes,
  memberNames,
  privateStatus = 'ready',
}: {
  character: PresentedCharacterData;
  notes?: readonly CharacterStatusNote[];
  memberNames?: ReadonlyMap<string, string>;
  privateStatus?: CombatExperienceProps['privateStatus'];
}) {
  const entries = characterStatusEntries(character, notes);
  const notice =
    privateStatus === 'ready'
      ? undefined
      : `Last confirmed status · ${privateStatus === 'loading' ? 'Refreshing…' : privateStatus === 'stale' ? 'May be out of date' : 'Refresh unavailable'}`;
  if (!entries.length) return null;
  return (
    <section
      className={styles.rail}
      role="group"
      aria-label="Effects and resources"
    >
      <div className={styles.icons}>
        {entries.map((entry) => (
          <span
            key={entry.key}
            className={styles.slot}
            data-tone={entry.art.tone}
            data-status-tone={entry.tone}
          >
            <Inspectable
              label={entry.name}
              description={`${kindLabel[entry.kind]} · Inspection only`}
              triggerClassName={styles.icon}
              trigger={
                <>
                  <ActionArt art={entry.art} label={entry.name} />
                  {(entry.resource || entry.resourceMissing) && (
                    <span className={styles.count} aria-hidden="true">
                      {entry.resource?.current ?? '?'}
                    </span>
                  )}
                </>
              }
              summary={
                <StatusDetails
                  entry={entry}
                  memberNames={memberNames}
                  notice={notice}
                />
              }
              details={
                <StatusDetails
                  entry={entry}
                  memberNames={memberNames}
                  identity={false}
                  notice={notice}
                />
              }
            />
          </span>
        ))}
      </div>
    </section>
  );
}
