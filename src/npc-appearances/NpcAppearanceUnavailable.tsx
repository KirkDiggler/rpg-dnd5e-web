import { Html } from '@react-three/drei';

/** Non-model diagnostic: the pick proxy remains owned by the surrounding actor. */
export function NpcAppearanceUnavailable({
  appearanceRef,
}: {
  appearanceRef: string;
}): React.JSX.Element {
  return (
    <Html center style={{ pointerEvents: 'none' }}>
      <output
        role="status"
        style={{
          background: '#3f0b14',
          color: '#fff',
          padding: '4px 8px',
          maxWidth: '18rem',
          overflowWrap: 'anywhere',
          display: 'block',
        }}
      >
        Appearance unavailable: {appearanceRef}
      </output>
    </Html>
  );
}
