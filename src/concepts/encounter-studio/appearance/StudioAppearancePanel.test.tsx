import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAppearanceSheet } from './appearanceSheet';
import {
  appearanceFixture,
  groupFixtureAppearances,
} from './appearanceTestFixtures';
import { StudioAppearancePanel } from './StudioAppearancePanel';

afterEach(cleanup);
describe('provider-grouped appearance controls', () => {
  it('shows a single Original appearance without a no-op dropdown', () => {
    const { input } = appearanceFixture();
    const onChange = vi.fn();
    const sheet = buildAppearanceSheet(groupFixtureAppearances(input));
    render(<StudioAppearancePanel sheet={sheet} onChange={onChange} />);
    expect(screen.queryByRole('combobox', { name: 'Texture pack' })).toBeNull();
    expect(screen.getByLabelText('Texture pack').textContent).toBe('Original');
    expect(screen.getByText(/Only one distinct appearance/)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps an equivalent saved alias and offers only an explicit reset', () => {
    const { input } = appearanceFixture();
    const grouped = groupFixtureAppearances(input);
    const ref = grouped.catalog.atlas!.materials[1]!.ref;
    const draft = {
      materialOverrides: [{ surfaceId: 'atlas', materialRef: ref }],
    };
    const before = structuredClone(draft);
    const onChange = vi.fn();
    render(
      <StudioAppearancePanel
        sheet={buildAppearanceSheet({ ...grouped, draft })}
        onChange={onChange}
      />
    );
    expect(screen.queryByRole('combobox', { name: 'Texture pack' })).toBeNull();
    expect(draft).toEqual(before);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset Texture pack' }));
    expect(onChange).toHaveBeenCalledWith({
      kind: 'atlas-pack',
      surfaceId: 'atlas',
      value: '',
    });
    expect(draft).toEqual(before);
  });
});
