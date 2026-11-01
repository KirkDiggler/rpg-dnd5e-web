import { expect, it } from 'vitest';
import { NOTIFICATION_SAMPLES } from './fixtures';

it('uses the production toast policy for concept speech and heard cues', () => {
  expect(NOTIFICATION_SAMPLES.speech.toastRule?.case).toBe('speech-to-you');
  expect(NOTIFICATION_SAMPLES.sound.toastRule?.case).toBe('heard-sound');
});
