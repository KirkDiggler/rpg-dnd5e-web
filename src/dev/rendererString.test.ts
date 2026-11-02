import { describe, expect, it } from 'vitest';
import { readRendererString } from './rendererString';

const RENDERER = 0x1f01;
const UNMASKED_RENDERER_WEBGL = 0x9246;

describe('readRendererString', () => {
  it('reads the unmasked renderer when the debug extension exists', () => {
    const context = {
      RENDERER,
      getExtension: (name: string) =>
        name === 'WEBGL_debug_renderer_info'
          ? { UNMASKED_RENDERER_WEBGL }
          : null,
      getParameter: (pname: number) =>
        pname === UNMASKED_RENDERER_WEBGL
          ? 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070)'
          : 'WebKit WebGL',
    };
    expect(readRendererString(context)).toBe(
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070)'
    );
  });

  it('falls back to the masked renderer without the extension', () => {
    const context = {
      RENDERER,
      getExtension: () => null,
      getParameter: (pname: number) =>
        pname === RENDERER ? 'WebKit WebGL' : null,
    };
    expect(readRendererString(context)).toBe('WebKit WebGL');
  });

  it('answers null for no context or a throwing one', () => {
    expect(readRendererString(null)).toBeNull();
    expect(
      readRendererString({
        RENDERER,
        getExtension: () => {
          throw new Error('lost');
        },
        getParameter: () => null,
      })
    ).toBeNull();
  });
});
