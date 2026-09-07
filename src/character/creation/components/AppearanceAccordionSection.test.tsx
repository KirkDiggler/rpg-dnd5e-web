import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AppearanceAccordionSection } from './AppearanceAccordionSection';

it('reports the single controlled expanded section through accessible button and region wiring', async () => {
  const onOpen = vi.fn();
  const { rerender } = render(
    <AppearanceAccordionSection
      section="hair"
      title="Hair"
      openSection="hair"
      onOpenSection={onOpen}
      summary="Default"
    >
      Hair controls
    </AppearanceAccordionSection>
  );
  const trigger = screen.getByRole('button', { name: /Hair/ });
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('region', { name: 'Hair' }).textContent).toContain(
    'Hair controls'
  );

  fireEvent.click(trigger);
  expect(onOpen).toHaveBeenCalledWith('hair');
  rerender(
    <AppearanceAccordionSection
      section="hair"
      title="Hair"
      openSection="gear"
      onOpenSection={onOpen}
      summary="Default"
    >
      Hair controls
    </AppearanceAccordionSection>
  );
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('region', { name: 'Hair' })).toBeNull();
});
