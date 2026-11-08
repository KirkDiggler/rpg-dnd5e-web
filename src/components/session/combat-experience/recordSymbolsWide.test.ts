import { describe, expect, it } from 'vitest';
import { isRecordObject, parseRecordJSON } from '../recordCapture';
import { answeredOf, readAnswer } from './recordSymbols';

describe('captured picker numeric evidence', () => {
  it('renders the recorded wide roll and loads without converting them to zero or rounding', () => {
    const fields = parseRecordJSON(
      '{"creature":"guard","key":"big","entry":0,"roll":9007199254740993,"of":900719925474099300,"rows":[{"entry":0,"held":true,"affordable":true,"weight":9007199254740993,"percent":100,"loaded":900719925474099300}]}'
    );
    expect(isRecordObject(fields)).toBe(true);
    const answer = answeredOf(fields as Record<string, unknown>);
    expect(answer).toBeDefined();
    const reading = readAnswer(answer!, undefined);
    expect(reading.sentence).toContain(
      'rolled 9007199254740993 of 900719925474099300'
    );
    expect(reading.lines[0]).toContain(
      '9007199254740993 × 100% = 900719925474099300'
    );
  });
});
