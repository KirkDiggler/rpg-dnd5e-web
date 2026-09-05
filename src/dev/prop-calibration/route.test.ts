import { describe, expect, it } from 'vitest';
import { isPropCalibrationRoute } from './route';

describe('isPropCalibrationRoute', () => {
  it.each([
    ['development', '127.0.0.1', '?propCalibration=1', true],
    ['development', 'localhost', '?propCalibration=1', true],
    ['development', '::1', '?propCalibration=1', true],
    ['development', '[::1]', '?propCalibration=1', true],
    ['production', '127.0.0.1', '?propCalibration=1', false],
    ['development', 'dev.example.test', '?propCalibration=1', false],
    ['development', '127.0.0.1', '', false],
    ['development', '127.0.0.1', '?propCalibration=0', false],
  ])(
    'mode=%s hostname=%s search=%s returns %s',
    (mode, hostname, search, expected) => {
      expect(isPropCalibrationRoute(mode, hostname, search)).toBe(expected);
    }
  );
});
