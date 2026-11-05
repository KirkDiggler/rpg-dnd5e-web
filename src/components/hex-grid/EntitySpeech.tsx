import { Html } from '@react-three/drei';
import styles from './EntitySpeech.module.css';

export interface EntitySpeechProps {
  entityId: string;
  name: string;
  line: string;
}

/** The line itself, as speech: read by a screen reader as who says what. */
export function SpeechLine({ entityId, name, line }: EntitySpeechProps) {
  return (
    <p
      className={styles.speech}
      data-entity-speech={entityId}
      aria-label={`${name} says: ${line}`}
    >
      {line}
    </p>
  );
}

/**
 * A line a creature is saying, drawn above it inside its moving group so it
 * follows the body (rpg-project#842, R2: the guard speaks at his cell, not in
 * a tooltip). It reads only the line it is handed; which lines show, and for
 * how long, is the story notices' (`speechAtSpeakers`).
 */
export function EntitySpeech(props: EntitySpeechProps) {
  return (
    <group name={`entity-speech-${props.entityId}`}>
      <Html
        position={[0, 2.6, 0]}
        center
        zIndexRange={[6, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <SpeechLine {...props} />
      </Html>
    </group>
  );
}
