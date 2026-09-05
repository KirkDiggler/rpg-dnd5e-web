const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** The prop calibration surface is intentionally unavailable outside a local
 * Vite development session. */
export function isPropCalibrationRoute(
  mode: string,
  hostname: string,
  search: string
): boolean {
  if (mode !== 'development' || !LOOPBACK_HOSTS.has(hostname)) return false;
  return new URLSearchParams(search).get('propCalibration') === '1';
}
