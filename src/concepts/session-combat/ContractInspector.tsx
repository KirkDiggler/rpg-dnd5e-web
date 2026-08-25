import styles from '@/components/session/combat-experience/CombatExperience.module.css';
import type { SessionCombatFieldSource } from './sessionCombatTypes';

const SOURCE_LABEL: Record<SessionCombatFieldSource, string> = {
  'session-wire': 'Session wire',
  'existing-other-wire': 'Existing character wire',
  presentation: 'Presentation only',
};

export interface ContractInspectorProps {
  fields: Record<string, SessionCombatFieldSource>;
  onClose: () => void;
}

export function ContractInspector({ fields, onClose }: ContractInspectorProps) {
  return (
    <section
      className={styles.contractInspector}
      aria-label="Contract inspector"
    >
      <header>
        <div>
          <span className={styles.eyebrow}>Concept contract</span>
          <strong>Where each displayed fact comes from</strong>
        </div>
        <button type="button" onClick={onClose}>
          Hide contract
        </button>
      </header>
      <div className={styles.contractFields}>
        {Object.entries(fields).map(([field, source]) => (
          <div key={field} data-source={source}>
            <code>{field}</code>
            <span>{SOURCE_LABEL[source]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
