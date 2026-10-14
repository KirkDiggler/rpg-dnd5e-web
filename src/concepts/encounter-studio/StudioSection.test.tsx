import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StudioSection } from './StudioSection';

describe('StudioSection', () => {
  it('renders a labelled section with an h3 or h4', () => {
    render(
      <>
        <StudioSection title="Placement" level="section">
          <p>Body</p>
        </StudioSection>
        <StudioSection title="Inherits" level="subsection">
          <p>Inherited</p>
        </StudioSection>
      </>
    );
    const placement = screen.getByRole('region', { name: 'Placement' });
    expect(
      within(placement).getByRole('heading', { level: 3, name: 'Placement' })
    ).toBeTruthy();
    expect(within(placement).getByText('Body')).toBeTruthy();
    const inherits = screen.getByRole('region', { name: 'Inherits' });
    expect(
      within(inherits).getByRole('heading', { level: 4, name: 'Inherits' })
    ).toBeTruthy();
  });
});
