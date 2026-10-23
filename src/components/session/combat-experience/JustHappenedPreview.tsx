import '@/components/ui/inspection/inspection.css';
import { useHoverCardDismiss } from '@/components/ui/inspection/useHoverCardDismiss';
import { useHoverCardWheel } from '@/components/ui/inspection/useHoverCardWheel';
import * as Tooltip from '@radix-ui/react-tooltip';
import { CircleHelp } from 'lucide-react';
import { useRef, useState } from 'react';
import styles from './CombatExperience.module.css';
import { describeAct } from './describeAct';
import { FormShell } from './forms/FormShell';
import { recentEventIdentity } from './recentEventIdentity';
import { RECENT_DEFAULT, selectRecent } from './recentSelection';
import type { CombatExperienceStoryExchange } from './types';

function RecentReminder({
  entry,
  onSelect,
}: {
  entry: CombatExperienceStoryExchange;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    card = useRef<HTMLDivElement>(null);
  useHoverCardWheel(open, trigger, card);
  useHoverCardDismiss(open, trigger, card, setOpen);
  const identity =
    entry.act && entry.describeContext
      ? recentEventIdentity(entry.act, entry.describeContext)
      : { what: 'Event', who: 'Unknown actor', icon: CircleHelp };
  const description =
    entry.act && entry.describeContext
      ? describeAct(entry.act, entry.describeContext)
      : null;
  const Icon = identity.icon;
  return (
    <Tooltip.Root open={open} onOpenChange={setOpen}>
      <Tooltip.Trigger asChild>
        <button
          ref={trigger}
          type="button"
          data-recent-id={entry.id}
          data-tone={entry.tone}
          aria-label={`Read ${identity.what}: ${identity.who} in history`}
          onClick={() => onSelect(entry.id)}
        >
          <span
            className={styles.hudRecentIcon}
            role="img"
            aria-label={identity.what}
          >
            <Icon size={17} aria-hidden="true" />
          </span>
          <strong className={styles.hudRecentWho}>{identity.who}</strong>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          ref={card}
          className={`inspection-summary ${styles.hudRecentSummary}`}
          side="right"
          align="start"
          sideOffset={10}
          collisionPadding={12}
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          <FormShell
            size="log"
            kind="recent-summary"
            lines={{
              eyebrow: description?.eyebrow ?? entry.eyebrow,
              headline: description?.headline ?? entry.headline,
              outcome: description?.outcome ?? entry.detail,
            }}
          />
          <div className="inspection-summary-hint">
            Click or press Enter for history
          </div>
          <Tooltip.Arrow className="inspection-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
/** A reminder from released story: what/who, then hover context, then history. */
export function JustHappenedPreview({
  story,
  onSelect,
}: {
  story: readonly CombatExperienceStoryExchange[];
  onSelect: (id: string) => void;
}) {
  const recent = selectRecent(story, RECENT_DEFAULT, 3);
  return (
    <section className={styles.hudRecent} aria-label="Recent outcomes">
      {recent.length === 0 ? (
        <p>No recent events yet.</p>
      ) : (
        <Tooltip.Provider delayDuration={250}>
          {recent.map((entry) => (
            <RecentReminder key={entry.id} entry={entry} onSelect={onSelect} />
          ))}
        </Tooltip.Provider>
      )}
    </section>
  );
}
