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
    // Restored unconditionally, unlike the two hooks above. Those can prove
    // ownership by identity — the function is still the one we installed — but
    // a boolean cannot, and the old test ("is it currently true?") answered a
    // different question. With `previousCheckShaderErrors === true` and someone
    // flipping it false mid-guard, that test skipped the restore and left the
    // renderer in a debug configuration nobody chose. This guard is what
    // changed the flag, so this guard puts it back (Copilot on #838).
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
