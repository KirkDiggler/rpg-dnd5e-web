import type { WebGLRenderer } from 'three';

interface AttackDieRenderGateOptions {
  isActive: () => boolean;
  isPoseValidated: () => boolean;
  onReady: () => void;
  onFailure: (reason: string) => void;
}

interface AttackDieRenderLease {
  render: WebGLRenderer['render'];
  onShaderError: WebGLRenderer['debug']['onShaderError'];
  checkShaderErrors: boolean;
  disposed: boolean;
  predecessor?: AttackDieRenderLease;
  previous: {
    render: WebGLRenderer['render'];
    onShaderError: WebGLRenderer['debug']['onShaderError'];
    checkShaderErrors: boolean;
  };
}

const activeLeases = new WeakMap<WebGLRenderer, AttackDieRenderLease>();

function restoreLease(gl: WebGLRenderer, lease: AttackDieRenderLease) {
  if (gl.render === lease.render) gl.render = lease.previous.render;
  if (gl.debug.onShaderError === lease.onShaderError)
    gl.debug.onShaderError = lease.previous.onShaderError;
  if (gl.debug.checkShaderErrors === lease.checkShaderErrors)
    gl.debug.checkShaderErrors = lease.previous.checkShaderErrors;
}

export function installAttackDieRenderGate(
  gl: WebGLRenderer,
  scene: Parameters<WebGLRenderer['render']>[0],
  camera: Parameters<WebGLRenderer['render']>[1],
  options: AttackDieRenderGateOptions
) {
  const predecessor = activeLeases.get(gl);
  let diagnostic: string | undefined;
  let ready = false;
  const lease: AttackDieRenderLease = {
    render: undefined as unknown as WebGLRenderer['render'],
    onShaderError: null,
    checkShaderErrors: true,
    disposed: false,
    predecessor,
    previous: {
      render: gl.render,
      onShaderError: gl.debug.onShaderError,
      checkShaderErrors: gl.debug.checkShaderErrors,
    },
  };
  const restore = () => {
    if (lease.disposed) return;
    lease.disposed = true;
    if (activeLeases.get(gl) !== lease) return;
    activeLeases.delete(gl);
    restoreLease(gl, lease);
    let previous = predecessor;
    while (previous?.disposed) {
      restoreLease(gl, previous);
      previous = previous.predecessor;
    }
    if (previous) activeLeases.set(gl, previous);
  };
  const fail = (reason: string) => {
    if (options.isActive()) options.onFailure(reason);
    restore();
  };
  const onShaderError: NonNullable<WebGLRenderer['debug']['onShaderError']> = (
    ...args
  ) => {
    diagnostic = 'shader diagnostic/link failure';
    const currentOwner = activeLeases.get(gl);
    if (currentOwner === lease) fail(diagnostic);
    else lease.previous.onShaderError?.(...args);
  };
  const wrappedRender: WebGLRenderer['render'] = function (
    sceneArg,
    cameraArg
  ) {
    if (lease.disposed)
      return lease.previous.render.call(gl, sceneArg, cameraArg);
    try {
      lease.previous.render.call(gl, sceneArg, cameraArg);
      if (diagnostic) return;
      if (options.isActive() && options.isPoseValidated() && !ready) {
        ready = true;
        options.onReady();
        restore();
      }
    } catch (error) {
      fail(
        `WebGL render failed: ${error instanceof Error ? error.message : 'unknown'}`
      );
      throw error;
    }
  };
  lease.render = wrappedRender;
  lease.onShaderError = onShaderError;

  activeLeases.set(gl, lease);
  gl.debug.checkShaderErrors = lease.checkShaderErrors;
  gl.debug.onShaderError = onShaderError;
  gl.render = wrappedRender;
  try {
    gl.compile(scene, camera);
  } catch (error) {
    fail(
      `shader readiness failed: ${error instanceof Error ? error.message : 'unknown'}`
    );
    throw error;
  }
  return { dispose: restore, fail };
}
