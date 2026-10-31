/** The slice of a WebGL context `readRendererString` needs. */
export interface RendererStringSource {
  getExtension(name: string): unknown;
  getParameter(pname: number): unknown;
  readonly RENDERER: number;
}

/** Read the unmasked renderer string; never throws. */
export function readRendererString(
  context: RendererStringSource | null | undefined
): string | null {
  if (!context) return null;
  try {
    const ext = context.getExtension('WEBGL_debug_renderer_info') as {
      UNMASKED_RENDERER_WEBGL: number;
    } | null;
    const value = ext
      ? context.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : context.getParameter(context.RENDERER);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}
