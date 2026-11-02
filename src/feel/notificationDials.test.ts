import { expect, it } from 'vitest';
import { defaultDialValues, getDialSpec, validateDialValue } from './dials';
it('defaults to normal notification duration and playback continuing', () => {
  expect(defaultDialValues().notificationDuration).toBe(1);
  expect(defaultDialValues().notificationPausePlayback).toBe('off');
});
it('bounds duration and rejects invalid playback choices', () => {
  expect(validateDialValue(getDialSpec('notificationDuration')!, 20)).toBe(3);
  expect(
    validateDialValue(getDialSpec('notificationPausePlayback')!, 'other')
  ).toBe('off');
});
