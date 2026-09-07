/**
 * Concept-local authoring types for web#935. These intentionally carry
 * continuous transforms and stable author identities that today's dungeon
 * wire does not. See CONTRACT.md before treating this as a server contract.
 */
export interface WorldTransform {
  x: number;
  /** Height above the shared dungeon floor surface. */
  y: number;
  z: number;
  rotationY: number;
}

/**
 * An explicitly authored visual point light on one prop. Offset and range use
 * the scene-coordinate units used by WorldTransform. Intensity is a renderer
 * control only, not physical illumination or a D&D bright/dim distance.
 */
export interface WorldPointLight {
  enabled: boolean;
  /** Position relative to the prop, rotated by the prop's authored yaw. */
  offset: { x: number; y: number; z: number };
  /** Six-digit CSS hex color. */
  color: string;
  intensity: number;
  range: number;
}

export interface WorldProp {
  id: string;
  kind: 'prop';
  assetRef: string;
  label: string;
  transform: WorldTransform;
  /** Optional author grouping; it never replaces or flattens this prop. */
  parentId?: string;
  /** Optional surface attachment. Moving/rotating the support carries this prop. */
  supportId?: string;
  /** Optional, explicitly authored visual emission; never inferred from assetRef. */
  pointLight?: WorldPointLight;
}

export interface WorldGroup {
  id: string;
  kind: 'group';
  label: string;
  transform: WorldTransform;
  parentId?: string;
}

export interface WorldScene {
  version: 1;
  id: string;
  name: string;
  items: WorldProp[];
  groups: WorldGroup[];
}

export interface Arrangement {
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  /** X/Z pivot-local, Y floor-relative copies. Template IDs remap on stamp. */
  items: WorldProp[];
  groups: WorldGroup[];
}

export interface ArrangementLibrary {
  version: 1;
  arrangements: Arrangement[];
}

export interface SceneHistory {
  past: WorldScene[];
  present: WorldScene;
  future: WorldScene[];
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type IdFactory = () => string;

export interface WorldPoint {
  x: number;
  z: number;
}
