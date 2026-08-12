import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  validateAttackDieSidecar,
  type AttackDieRuntimeSidecar,
} from './attackDieContract';
export interface AttackDieRuntimeSnapshot {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  sidecar?: AttackDieRuntimeSidecar;
  failureReason?: string;
}
const GLB_URL = '/models/synty/props/SM_Prop_D20_Lightning_01.glb';
const SIDECAR_URL =
  '/models/synty/props/SM_Prop_D20_Lightning_01.attack-die.json';
let snapshot: AttackDieRuntimeSnapshot = { status: 'idle' };
let owner: Promise<void> | undefined;
let cachedScene: Object3D | undefined;
export function getAttackDieRuntimeSnapshot(): AttackDieRuntimeSnapshot {
  return Object.freeze({ ...snapshot });
}
export function preloadAttackDieRuntime(): Promise<void> {
  if (owner) return owner;
  snapshot = { status: 'loading' };
  owner = (async () => {
    try {
      const [glbResponse, sidecarResponse] = await Promise.all([
        fetch(GLB_URL),
        fetch(SIDECAR_URL),
      ]);
      if (!glbResponse.ok || !sidecarResponse.ok)
        throw Error('asset load failed');
      const bytes = await glbResponse.arrayBuffer();
      const sidecarValue: unknown = await sidecarResponse.json();
      const checked = await validateAttackDieSidecar(sidecarValue);
      if (!checked.ok) throw Error(checked.reason);
      const digest = [
        ...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      ]
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('');
      if (digest !== checked.sidecar.asset.sha256)
        throw Error('GLB hash mismatch');
      if (checked.sidecar.state !== 'verified')
        throw Error('contract is not verified');
      cachedScene = await new Promise<Object3D>((resolve, reject) =>
        new GLTFLoader().parse(bytes, '', (gltf) => resolve(gltf.scene), reject)
      );
      snapshot = { status: 'ready', sidecar: checked.sidecar };
    } catch (e) {
      snapshot = {
        status: 'failed',
        failureReason: e instanceof Error ? e.message : 'runtime failure',
      };
      throw e;
    }
  })();
  return owner;
}
export interface AttackDieRendererLock {
  readonly renderer: '3d' | 'svg';
  readonly sidecar?: AttackDieRuntimeSidecar;
  fail(reason: string): AttackDieRendererLock;
}
const locks = new Map<
  number,
  { renderer: '3d' | 'svg'; sidecar?: AttackDieRuntimeSidecar; reason?: string }
>();
export function lockAttackDieRenderer(
  token: number,
  result: number,
  source = getAttackDieRuntimeSnapshot()
): AttackDieRendererLock {
  let state = locks.get(token);
  if (!state) {
    const mapped =
      source.status === 'ready' &&
      source.sidecar?.faces?.some((f) => f.result === result);
    state = {
      renderer: mapped ? '3d' : 'svg',
      sidecar: mapped ? source.sidecar : undefined,
    };
    locks.set(token, state);
  }
  const view: AttackDieRendererLock = {
    get renderer() {
      return state!.renderer;
    },
    get sidecar() {
      return state!.sidecar;
    },
    fail(reason) {
      state!.renderer = 'svg';
      state!.reason ??= reason;
      return view;
    },
  };
  return view;
}
export function getAttackDieRuntimeScene() {
  return cachedScene;
}
export function releaseAttackDieRenderer(token: number) {
  locks.delete(token);
}
export function __resetAttackDieRuntimeForTests() {
  snapshot = { status: 'idle' };
  owner = undefined;
  cachedScene = undefined;
  locks.clear();
}
