import { Html } from '@react-three/drei';

export function NpcActivityUnavailable({
  activityRef,
}: {
  activityRef: string;
}) {
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
        Activity unavailable: {activityRef}
      </output>
    </Html>
  );
}
