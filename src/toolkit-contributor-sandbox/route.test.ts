import { describe, expect, it } from 'vitest';
import { isToolkitContributorSandboxRoute } from './route';

describe('isToolkitContributorSandboxRoute', () => {
  it('requires the literal development mode and toolkitSandbox=1 query value', () => {
    expect(
      isToolkitContributorSandboxRoute('development', '?toolkitSandbox=1')
    ).toBe(true);
    expect(
      isToolkitContributorSandboxRoute('production', '?toolkitSandbox=1')
    ).toBe(false);
    expect(
      isToolkitContributorSandboxRoute('development', '?toolkitSandbox=0')
    ).toBe(false);
  });
});
