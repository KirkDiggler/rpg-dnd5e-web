import { Html } from '@react-three/drei';
import styles from './EntityTargetMarker.module.css';

export interface EntityTargetMarkerState {
  selected: boolean;
  order?: number;
}
export interface EntityTargetLabelProps extends EntityTargetMarkerState {
  entityId: string;
  name: string;
  onChoose: () => void;
  onHover: () => void;
  onLeave: () => void;
}

export function EntityTargetLabel({
  entityId,
  name,
  selected,
  order,
  onChoose,
  onHover,
  onLeave,
}: EntityTargetLabelProps) {
  return (
    <button
      type="button"
      tabIndex={-1}
      className={styles.marker}
      data-target-marker={entityId}
      data-selected={selected}
      aria-label={`${selected ? 'Deselect' : 'Select'} ${name}`}
      aria-pressed={selected}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerEnter={onHover}
      onPointerLeave={onLeave}
      onClick={(event) => {
        event.stopPropagation();
        onChoose();
      }}
    >
      {selected && (
        <span className={styles.check} aria-hidden="true">
          ✓ {order}
        </span>
      )}
      <span className={styles.name}>{name}</span>
    </button>
  );
}
/** Local to HexEntity's moving group; supplied selection facts, not target rules. */
export function EntityTargetMarker({
  entityId,
  name,
  hexSize,
  selected,
  order,
  onChoose,
  onHover,
  onLeave,
}: EntityTargetMarkerState & {
  entityId: string;
  name: string;
  hexSize: number;
  onChoose: () => void;
  onHover: () => void;
  onLeave: () => void;
}) {
  return (
    <group
      name={`member-target-marker-${entityId}`}
      userData={{ selected, order }}
    >
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.025, 0]}
        raycast={() => undefined}
      >
        <ringGeometry
          args={[hexSize * (selected ? 0.62 : 0.66), hexSize * 0.72, 48]}
        />
        <meshBasicMaterial
          color={selected ? '#f3d17c' : '#81c6cc'}
          transparent
          opacity={selected ? 0.95 : 0.48}
          depthWrite={false}
        />
      </mesh>
      <Html position={[0, 2, 0]} center zIndexRange={[4, 0]}>
        <EntityTargetLabel
          entityId={entityId}
          name={name}
          selected={selected}
          order={order}
          onChoose={onChoose}
          onHover={onHover}
          onLeave={onLeave}
        />
      </Html>
    </group>
  );
}
