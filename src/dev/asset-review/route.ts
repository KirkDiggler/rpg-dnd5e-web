export const LOOPBACK_HOSTS = new Set([
  '127.0.0.1',
  'localhost',
  '::1',
  '[::1]',
]);

export function isAssetReviewRoute(
  mode: string,
  hostname: string,
  search: string
): boolean {
  return (
    mode === 'development' &&
    LOOPBACK_HOSTS.has(hostname) &&
    new URLSearchParams(search).get('assetReview') === '1'
  );
}
