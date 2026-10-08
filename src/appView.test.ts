// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { APP_VIEWS, shouldRenderGlobalDevTools, type AppView } from './appView';

const OTHER_APP_VIEWS = APP_VIEWS.filter(
  (view): view is Exclude<AppView, 'concepts' | 'encounter-studio'> =>
    view !== 'concepts' && view !== 'encounter-studio'
);

describe('global development tools visibility', () => {
  it('hides the controls and an already-open debug panel in Concepts, then restores the preserved panel state on return', () => {
    const debugPanelRequested = true;

    expect(shouldRenderGlobalDevTools('development', 'concepts')).toBe(false);
    expect(
      debugPanelRequested &&
        shouldRenderGlobalDevTools('development', 'concepts')
    ).toBe(false);
    expect(
      debugPanelRequested && shouldRenderGlobalDevTools('development', 'home')
    ).toBe(true);
  });

  it('registers Studio and leaves its full-window canvas free of global dev tools', () => {
    expect(APP_VIEWS).toContain('encounter-studio');
    expect(shouldRenderGlobalDevTools('development', 'encounter-studio')).toBe(
      false
    );
  });

  it.each(OTHER_APP_VIEWS)(
    'shows the controls in development %s view',
    (view) => {
      expect(shouldRenderGlobalDevTools('development', view)).toBe(true);
    }
  );

  it.each(APP_VIEWS)('hides the controls in production %s view', (view) => {
    expect(shouldRenderGlobalDevTools('production', view)).toBe(false);
  });
});
