import { SHARING_STOPS } from '@/concepts/world-building/partySharing';
import { PartySharing } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useId, useState } from 'react';
import styles from './CombatExperience.module.css';

const STOP_FOR: Partial<Record<PartySharing, string>> = {
  [PartySharing.OWN]: 'own',
  [PartySharing.VIEW]: 'view',
  [PartySharing.KNOWLEDGE]: 'knowledge',
};

/**
 * The run's sharing mode, once (rpg-project#935): "Each their own",
 * "Shared view" or "Shared knowledge", with what it means in the studio's
 * own words (`SHARING_STOPS`, one source). A hover shows the meaning; a tap
 * or Enter shows it too. Nothing at all when the server does not report a
 * mode — never a guess.
 */
export function SharingMode({ sharing }: { sharing?: PartySharing }) {
  const [open, setOpen] = useState(false);
  const meaningId = useId();
  const word = sharing === undefined ? undefined : STOP_FOR[sharing];
  const stop = SHARING_STOPS.find((s) => s.word === word);
  if (!stop) return null;
  const label = `${stop.name.charAt(0).toUpperCase()}${stop.name.slice(1)}`;
  return (
    <span className={styles.sharingMode} data-testid="sharing-mode">
      <button
        type="button"
        title={stop.means}
        aria-expanded={open}
        aria-describedby={meaningId}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      <span id={meaningId} hidden={!open} role="note">
        {stop.means}
      </span>
    </span>
  );
}
