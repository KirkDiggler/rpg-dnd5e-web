import { expect, it } from 'vitest';
import { CLICK_TO_ACT_DIAL } from './controlDials';
import { defaultDialValues, getDialSpec, validateDialValue } from './dials';

it('click-to-act ships on, as a placeholder default (rpg-project#872 D2)', () => {
  expect(defaultDialValues()[CLICK_TO_ACT_DIAL]).toBe('on');
});

it('accepts off and rejects anything else', () => {
  const spec = getDialSpec(CLICK_TO_ACT_DIAL)!;
  expect(validateDialValue(spec, 'off')).toBe('off');
  expect(validateDialValue(spec, 'sometimes')).toBe('on');
});
