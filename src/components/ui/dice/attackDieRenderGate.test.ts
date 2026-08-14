import type { WebGLRenderer } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { installAttackDieRenderGate } from './attackDieRenderGate';

function renderer() {
  const render = vi.fn();
  const onShaderError = vi.fn();
  return {
    originalRender: render,
    originalShaderError: onShaderError,
    gl: {
      render,
      compile: vi.fn(),
      debug: { onShaderError, checkShaderErrors: false },
    } as unknown as WebGLRenderer,
  };
}

describe('installAttackDieRenderGate', () => {
  it('keeps a newer overlapping lease installed when the older lease restores, then restores the exact originals', () => {
    const { gl, originalRender, originalShaderError } = renderer();
    const olderReady = vi.fn();
    const newerReady = vi.fn();
    const older = installAttackDieRenderGate(gl, {} as never, {} as never, {
      isActive: () => true,
      isPoseValidated: () => true,
      onReady: olderReady,
      onFailure: vi.fn(),
    });
    const olderRender = gl.render;
    const olderShaderError = gl.debug.onShaderError;
    expect(gl.debug.checkShaderErrors).toBe(true);
    const newer = installAttackDieRenderGate(gl, {} as never, {} as never, {
      isActive: () => true,
      isPoseValidated: () => true,
      onReady: newerReady,
      onFailure: vi.fn(),
    });
    const newerRender = gl.render;
    const newerShaderError = gl.debug.onShaderError;
    expect(newerRender).not.toBe(olderRender);
    expect(newerShaderError).not.toBe(olderShaderError);
    expect(gl.debug.checkShaderErrors).toBe(true);
    const staleOlderRender = olderRender;

    older.dispose();
    expect(gl.render).toBe(newerRender);
    expect(gl.debug.onShaderError).toBe(newerShaderError);
    expect(gl.debug.checkShaderErrors).toBe(true);
    staleOlderRender({} as never, {} as never);
    expect(originalRender).toHaveBeenCalledTimes(1);
    expect(olderReady).not.toHaveBeenCalled();
    olderShaderError?.({} as never, {} as never, {} as never, {} as never);
    expect(gl.render).toBe(newerRender);
    expect(gl.debug.onShaderError).toBe(newerShaderError);
    expect(gl.debug.checkShaderErrors).toBe(true);
    gl.render({} as never, {} as never);
    expect(originalRender).toHaveBeenCalledTimes(2);
    expect(newerReady).toHaveBeenCalledTimes(1);
    expect(olderReady).not.toHaveBeenCalled();
    expect(gl.render).toBe(originalRender);
    expect(gl.debug.onShaderError).toBe(originalShaderError);
    expect(gl.debug.checkShaderErrors).toBe(false);

    newer.dispose();
    expect(gl.render).toBe(originalRender);
    expect(gl.debug.onShaderError).toBe(originalShaderError);
    expect(gl.debug.checkShaderErrors).toBe(false);
  });

  it('ignores stale token callbacks while still forwarding the underlying render', () => {
    const { gl, originalRender } = renderer();
    const onReady = vi.fn();
    const onFailure = vi.fn();
    const gate = installAttackDieRenderGate(gl, {} as never, {} as never, {
      isActive: () => false,
      isPoseValidated: () => true,
      onReady,
      onFailure,
    });
    const wrappedRender = gl.render;
    wrappedRender({} as never, {} as never);
    expect(originalRender).toHaveBeenCalledTimes(1);
    expect(onReady).not.toHaveBeenCalled();
    gl.debug.onShaderError?.(
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
    expect(onFailure).not.toHaveBeenCalled();
    gate.dispose();
    expect(gl.render).toBe(originalRender);
  });
});

it('drives the shader failure seam through the shader readiness gate', () => {
  const { gl } = renderer();
  const failed = vi.fn();
  expect(() =>
    installAttackDieRenderGate(gl, {} as never, {} as never, {
      isActive: () => true,
      isPoseValidated: () => true,
      onReady: vi.fn(),
      onFailure: failed,
      forceShaderFailure: true,
    })
  ).toThrow(/forced shader/);
  expect(failed).toHaveBeenCalledWith(
    expect.stringMatching(/shader readiness failed.*forced shader/)
  );
});
