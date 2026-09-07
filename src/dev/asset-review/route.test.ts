import { describe, expect, it } from 'vitest';
import { isAssetReviewRoute } from './route';

describe('isAssetReviewRoute', () => {
  it.each([
    ['development', '127.0.0.1', '?assetReview=1', true],
    ['development', 'localhost', '?assetReview=1', true],
    ['development', '::1', '?assetReview=1', true],
    ['development', '[::1]', '?assetReview=1', true],
    ['production', '127.0.0.1', '?assetReview=1', false],
    ['development', 'review.example.test', '?assetReview=1', false],
    ['development', '127.0.0.1', '?assetReview=0', false],
  ])('%s %s %s', (mode, hostname, search, expected) => {
    expect(isAssetReviewRoute(mode, hostname, search)).toBe(expected);
  });

  it('requires the explicit assetReview value even beside other queries', () => {
    expect(
      isAssetReviewRoute(
        'development',
        'localhost',
        '?propCalibration=1&assetReview=1'
      )
    ).toBe(true);
    expect(
      isAssetReviewRoute('development', 'localhost', '?assetReview=true')
    ).toBe(false);
  });
});
