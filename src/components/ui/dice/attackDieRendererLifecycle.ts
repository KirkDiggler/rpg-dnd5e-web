import type { WebGLRenderer } from 'three';
import type { AttackDieRendererInfo } from './AttackDie3D';
export const ATTACK_DIE_RELEASE_TIMEOUT_MS = 6000;
const diagnostic = (renderer: WebGLRenderer) => ({
  calls: Number.isFinite(renderer.info.render.calls)
    ? renderer.info.render.calls
    : null,
  triangles: Number.isFinite(renderer.info.render.triangles)
    ? renderer.info.render.triangles
    : null,
  geometries: Number.isFinite(renderer.info.memory.geometries)
    ? renderer.info.memory.geometries
    : null,
  textures: Number.isFinite(renderer.info.memory.textures)
    ? renderer.info.memory.textures
    : null,
  programs: renderer.info.programs ? renderer.info.programs.length : null,
});
export function ownAttackDieRendererLifecycle(input: {
  renderer: WebGLRenderer;
  contextId: number;
  sink?: (info: AttackDieRendererInfo) => void;
  onUnexpectedLoss: () => void;
  timeoutMs?: number;
}) {
  const { renderer, contextId, sink } = input;
  const canvas = renderer.domElement;
  let releaseRequested = false,
    terminal = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const emit = (lifecycle: AttackDieRendererInfo['lifecycle']) =>
    sink?.({ ...diagnostic(renderer), lifecycle, contextId });
  const remove = () => {
    canvas.removeEventListener('webglcontextlost', lost);
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  const lost: EventListener = (event) => {
    event.preventDefault();
    if (terminal) return;
    terminal = true;
    if (releaseRequested) emit('release-observed');
    else {
      emit('unexpected-loss');
      input.onUnexpectedLoss();
    }
    remove();
  };
  canvas.addEventListener('webglcontextlost', lost);
  emit('created');
  return {
    sampled: () => {
      if (!terminal && !releaseRequested) emit('sampled');
    },
    requestRelease: () => {
      if (terminal || releaseRequested) return;
      releaseRequested = true;
      emit('release-requested');
      renderer.dispose();
      renderer.forceContextLoss();
      timer = setTimeout(() => {
        if (terminal) return;
        terminal = true;
        emit('release-timeout');
        remove();
      }, input.timeoutMs ?? ATTACK_DIE_RELEASE_TIMEOUT_MS);
    },
    cancel: () => {
      terminal = true;
      remove();
    },
  };
}
