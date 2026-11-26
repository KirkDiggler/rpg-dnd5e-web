import { describe, expect, it } from 'vitest';
import { siteNamesOf } from './siteNames';
import type { SiteScope } from './siteScope';

const scopeWith = (statuses: unknown) =>
  ({ unread: { statuses } }) as unknown as SiteScope;

describe('siteNamesOf statuses', () => {
  it('lists the statuses with their names in file order', () => {
    const names = siteNamesOf(
      scopeWith({
        zeta: { name: 'Zeta Glow' },
        alpha: { changes: [] },
        beta: { name: 7 },
      }),
      {}
    );
    expect(names.statuses).toEqual([
      { id: 'zeta', name: 'Zeta Glow' },
      { id: 'alpha', name: 'alpha' },
      { id: 'beta', name: 'beta' },
    ]);
  });

  it('gives an empty list, and does not throw, when statuses is text', () => {
    expect(siteNamesOf(scopeWith('oops'), {}).statuses).toEqual([]);
    expect(siteNamesOf(scopeWith(['a']), {}).statuses).toEqual([]);
    expect(siteNamesOf({} as SiteScope, {}).statuses).toEqual([]);
  });
});
