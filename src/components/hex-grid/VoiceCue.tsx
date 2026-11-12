import { worldPositionOf } from '@/components/session/positionBridge';
import { Html } from '@react-three/drei';
import styles from './EntitySpeech.module.css';

export interface VoiceCueProps {
  /** The cell the voice came from, axial like every wire position. */
  x: number;
  y: number;
  /** The words if caught, else how it sounded ("a voice shouting"). */
  line: string;
  hexSize: number;
}

/**
 * A voice from someone the viewer did not see, drawn at the place it came
 * from (rpg-project#934). It names nobody: who spoke is exactly what the
 * viewer does not know. Which voices show, and for how long, is the story
 * notices' (`voicesAtPlaces`).
 */
export function VoiceCue({ x, y, line, hexSize }: VoiceCueProps) {
  const at = worldPositionOf({ x, y }, hexSize);
  return (
    <group name={`voice-cue-${x}-${y}`} position={[at.x, 0, at.z]}>
      <Html
        position={[0, 2.2, 0]}
        center
        zIndexRange={[6, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <p
          className={styles.voice}
          data-voice-cue={`${x},${y}`}
          aria-label={`A voice: ${line}`}
        >
          {line}
        </p>
      </Html>
    </group>
  );
}
