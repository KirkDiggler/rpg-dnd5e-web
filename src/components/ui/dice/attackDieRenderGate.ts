import type { WebGLRenderer } from 'three';

interface AttackDieRenderGateOptions {
  isActive: () => boolean;
  isPoseValidated: () => boolean;
  onReady: () => void;
  onFailure: (reason: string) => void;
}

export function installAttackDieRenderGate(
  gl: WebGLRenderer,
  scene: Parameters<WebGLRenderer['render']>[0],
  camera: Parameters<WebGLRenderer['render']>[1],
  options: AttackDieRenderGateOptions
) {
  const originalRender = gl.render;
  const originalShaderError = gl.debug.onShaderError;
  const originalCheckShaderErrors = gl.debug.checkShaderErrors;
  let diagnostic: string | undefined;
  let ready = false;
  let disposed = false;

  const restore = () => {
    if (disposed) return;
    disposed = true;
    if (gl.render === wrappedRender) gl.render = originalRender;
    if (gl.debug.onShaderError === onShaderError)
      gl.debug.onShaderError = originalShaderError;
    gl.debug.checkShaderErrors = originalCheckShaderErrors;
  };
  const fail = (reason: string) => {
    if (options.isActive()) options.onFailure(reason);
    restore();
  };
  const onShaderError: NonNullable<
    WebGLRenderer['debug']['onShaderError']
  > = () => {
    diagnostic = 'shader diagnostic/link failure';
    fail(diagnostic);
  };
  const wrappedRender: WebGLRenderer['render'] = function (
    sceneArg,
    cameraArg
  ) {
    if (disposed) return originalRender.call(gl, sceneArg, cameraArg);
    try {
      originalRender.call(gl, sceneArg, cameraArg);
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

  gl.debug.checkShaderErrors = true;
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
