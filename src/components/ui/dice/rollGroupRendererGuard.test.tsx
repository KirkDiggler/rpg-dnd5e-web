import { render } from '@testing-library/react';
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RollGroupRenderBoundary } from './RollGroupRenderBoundary';
import { installRollGroupRendererGuard } from './rollGroupRendererGuard';

function rendererWith(renderImplementation: () => void) {
  const canvas = document.createElement('canvas');
  return {
    domElement: canvas,
    render: vi.fn(renderImplementation),
    compile: vi.fn(),
    debug: {
      checkShaderErrors: false,
      onShaderError: null,
    },
  } as unknown as WebGLRenderer;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('roll group renderer failure seams', () => {
  it('reports an actual guarded WebGL render exception and restores ownership', () => {
    const renderer = rendererWith(() => {
      throw Error('GPU reset');
    });
    const originalRender = renderer.render;
    const failure = vi.fn();
    const guard = installRollGroupRendererGuard(
      renderer,
      new Scene(),
      new PerspectiveCamera(),
      failure
    );

    expect(() => renderer.render(new Scene(), new PerspectiveCamera())).toThrow(
      'GPU reset'
    );
    expect(failure).toHaveBeenCalledWith('WebGL render failed: GPU reset');
    guard.dispose();
    expect(renderer.render).toBe(originalRender);
  });

  it('reports a real React child render error through the Canvas boundary', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = vi.fn();
    function BrokenCanvas(): null {
      throw Error('WebGL creation failed');
    }

    expect(() =>
      render(
        <RollGroupRenderBoundary onError={failure}>
          <BrokenCanvas />
        </RollGroupRenderBoundary>
      )
    ).not.toThrow();
    expect(failure).toHaveBeenCalledWith(
      'render failure: WebGL creation failed'
    );
  });

  it('puts checkShaderErrors back even if someone else moved it meanwhile', () => {
    // The old dispose asked "is it currently true?" as a stand-in for "do I
    // still own this". With a previous value of TRUE and anything flipping the
    // flag false while the guard was installed, that test skipped the restore
    // and left the renderer in a debug configuration nobody chose.
    const renderer = rendererWith(() => undefined);
    renderer.debug.checkShaderErrors = true;

    const guard = installRollGroupRendererGuard(
      renderer,
      new Scene(),
      new PerspectiveCamera(),
      vi.fn()
    );
    expect(renderer.debug.checkShaderErrors).toBe(true);

    // Another owner turns diagnostics off while we hold the guard.
    renderer.debug.checkShaderErrors = false;
    guard.dispose();

    expect(renderer.debug.checkShaderErrors).toBe(true);
  });

  it('restores a previously-false flag it turned on', () => {
    const renderer = rendererWith(() => undefined);
    expect(renderer.debug.checkShaderErrors).toBe(false);

    const guard = installRollGroupRendererGuard(
      renderer,
      new Scene(),
      new PerspectiveCamera(),
      vi.fn()
    );
    expect(renderer.debug.checkShaderErrors).toBe(true);

    guard.dispose();
    expect(renderer.debug.checkShaderErrors).toBe(false);
  });
});
