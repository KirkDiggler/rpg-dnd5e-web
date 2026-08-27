import type { Camera, Scene, WebGLRenderer } from 'three';

export interface RollGroupRendererGuard {
  readonly dispose: () => void;
}

export function installRollGroupRendererGuard(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  onFailure: (reason: string) => void
): RollGroupRendererGuard {
  const previousRender = renderer.render;
  const previousShaderError = renderer.debug.onShaderError;
  const previousCheckShaderErrors = renderer.debug.checkShaderErrors;
  let disposed = false;
  let failed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    renderer.domElement.removeEventListener('webglcontextlost', contextLost);
    if (renderer.render === guardedRender) renderer.render = previousRender;
    if (renderer.debug.onShaderError === shaderError)
      renderer.debug.onShaderError = previousShaderError;
    if (renderer.debug.checkShaderErrors)
      renderer.debug.checkShaderErrors = previousCheckShaderErrors;
  };
  const fail = (reason: string) => {
    if (failed) return;
    failed = true;
    onFailure(reason);
  };
  const contextLost: EventListener = (event) => {
    event.preventDefault();
    fail('WebGL context lost');
  };
  const shaderError: NonNullable<WebGLRenderer['debug']['onShaderError']> = (
    ...args
  ) => {
    fail('WebGL shader diagnostic/link failure');
    previousShaderError?.(...args);
  };
  const guardedRender: WebGLRenderer['render'] = function (
    sceneArg,
    cameraArg
  ) {
    try {
      previousRender.call(renderer, sceneArg, cameraArg);
    } catch (error) {
      fail(
        `WebGL render failed: ${error instanceof Error ? error.message : 'unknown'}`
      );
      throw error;
    }
  };

  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  renderer.debug.checkShaderErrors = true;
  renderer.debug.onShaderError = shaderError;
  renderer.render = guardedRender;
  try {
    renderer.compile(scene, camera);
  } catch (error) {
    fail(
      `WebGL compile failed: ${error instanceof Error ? error.message : 'unknown'}`
    );
  }

  return Object.freeze({ dispose });
}
