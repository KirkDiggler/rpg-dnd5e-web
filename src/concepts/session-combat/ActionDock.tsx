import styles from './SessionCombatConcept.module.css';
import type { SessionCombatOffer } from './sessionCombatTypes';

function CostBadge({ cost }: { cost: SessionCombatOffer['cost'] }) {
  return (
    <span className={styles.costBadge} data-cost={cost.toLowerCase()}>
      {cost === 'Bonus'
        ? 'B'
        : cost === 'Reaction'
          ? 'R'
          : cost === 'Free'
            ? '◇'
            : 'A'}
    </span>
  );
}

function ActionOffer({
  offer,
  armed,
  onSelect,
}: {
  offer: SessionCombatOffer;
  armed: boolean;
  onSelect: (offerId: string) => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.actionOffer} ${armed ? styles.actionOfferArmed : ''}`}
      disabled={!offer.available}
      title={offer.unavailableReason ?? `${offer.cost} · ${offer.ref}`}
      aria-pressed={armed}
      onClick={() => onSelect(offer.id)}
    >
      <span className={styles.actionIcon} aria-hidden="true">
        {offer.icon}
      </span>
      <span className={styles.actionLabel}>{offer.label}</span>
      <CostBadge cost={offer.cost} />
    </button>
  );
}

function OfferGroup({
  label,
  offers,
  armedOfferId,
  onSelectOffer,
}: {
  label: SessionCombatOffer['source'];
  offers: SessionCombatOffer[];
  armedOfferId?: string;
  onSelectOffer: (offerId: string) => void;
}) {
  if (offers.length === 0) return null;
  return (
    <div className={styles.actionGroup}>
      <span className={styles.groupLabel}>{label}</span>
      {offers.map((offer) => (
        <ActionOffer
          key={offer.id}
          offer={offer}
          armed={armedOfferId === offer.id}
          onSelect={onSelectOffer}
        />
      ))}
    </div>
  );
}

export interface ActionDockProps {
  offers: SessionCombatOffer[];
  mode: 'turn' | 'free-roam';
  isViewerTurn: boolean;
  activeParticipantName: string | null;
  armedOfferId?: string;
  onSelectOffer: (offerId: string) => void;
}

export function ActionDock({
  offers,
  mode,
  isViewerTurn,
  activeParticipantName,
  armedOfferId,
  onSelectOffer,
}: ActionDockProps) {
  if (mode === 'free-roam') {
    return (
      <div className={styles.passiveActionRow}>
        <span>Exploration</span>
        <strong>Click the floor to move</strong>
        <small>No turn economy on the world clock.</small>
      </div>
    );
  }

  if (!isViewerTurn) {
    return (
      <div className={styles.passiveActionRow}>
        <span>Watching</span>
        <strong>{activeParticipantName ?? 'Another participant'}’s turn</strong>
        <small>Your commands return when the initiative reaches you.</small>
      </div>
    );
  }

  const groups = (['Core', 'Features', 'Spells', 'Items'] as const)
    .map((source) => ({
      source,
      offers: offers.filter((offer) => offer.source === source),
    }))
    .filter((group) => group.offers.length > 0);

  return (
    <div className={styles.actionRow}>
      {groups.map((group, index) => (
        <div key={group.source} className={styles.actionGroupWithDivider}>
          {index > 0 && (
            <div className={styles.actionDivider} aria-hidden="true" />
          )}
          <OfferGroup
            label={group.source}
            offers={group.offers}
            armedOfferId={armedOfferId}
            onSelectOffer={onSelectOffer}
          />
        </div>
      ))}
      <button type="button" className={styles.endTurn}>
        End turn
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
