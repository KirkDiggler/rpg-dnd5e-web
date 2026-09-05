import { describe, expect, it } from 'vitest';
import { formatMoney } from './money';

describe('formatMoney', () => {
  it('renders a zero amount as "0 cp" rather than an empty string', () => {
    expect(formatMoney(0)).toBe('0 cp');
  });

  it('renders a copper-only amount', () => {
    expect(formatMoney(7)).toBe('7 cp');
  });

  it('renders a round gold amount with no smaller denominations', () => {
    expect(formatMoney(500)).toBe('5 gp');
  });

  it('breaks a mixed amount into gold, silver, and copper', () => {
    expect(formatMoney(247)).toBe('2 gp 4 sp 7 cp');
  });

  it('carries platinum and electrum through the same breakdown', () => {
    expect(formatMoney(1247)).toBe('1 pp 2 gp 4 sp 7 cp');
    expect(formatMoney(50)).toBe('1 ep');
  });
});
