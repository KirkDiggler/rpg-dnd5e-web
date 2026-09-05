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
