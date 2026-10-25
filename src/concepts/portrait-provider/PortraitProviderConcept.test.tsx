import type { PortraitCaptureProps } from '@/portraits/PortraitCapture';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { PortraitProviderConcept } from './PortraitProviderConcept';
vi.mock('@/portraits/PortraitCapture', () => ({
  PortraitCapture: ({ source, onComplete }: PortraitCaptureProps) => {
    useEffect(
      () => onComplete(source.key, `data:image/png;base64,${btoa(source.key)}`),
      [source, onComplete]
    );
    return null;
  },
}));
afterEach(cleanup);
it('offers the real HUD consumer view with shared player images and named missing fallback', async () => {
  render(<PortraitProviderConcept />);
  fireEvent.click(screen.getByRole('button', { name: 'Show HUD integration' }));
  await waitFor(() =>
    expect(screen.getAllByAltText('Customized fighter portrait')).toHaveLength(
      2
    )
  );
  expect(
    screen
      .getAllByAltText('Customized fighter portrait')
      .map((image) => image.getAttribute('src'))[0]
  ).toBe(
    screen.getAllByAltText('Customized fighter portrait')[1].getAttribute('src')
  );
  expect(
    await screen.findByRole('img', { name: 'World NPC portrait' })
  ).toBeTruthy();
  expect(
    await screen.findByRole('img', { name: 'Legacy skeleton portrait' })
  ).toBeTruthy();
  expect(
    screen.getByRole('img', {
      name: 'Missing explicit appearance portrait unavailable',
    })
  ).toBeTruthy();
});
it('consumes produced images twice and replaces a changed appearance without inventing missing art', async () => {
  render(<PortraitProviderConcept />);
  await waitFor(() =>
    expect(screen.getAllByAltText('Customized fighter portrait')).toHaveLength(
      2
    )
  );
  const first = screen
    .getAllByAltText('Customized fighter portrait')[0]
    .getAttribute('src');
  expect(
    screen.getAllByAltText('Customized fighter portrait')[1].getAttribute('src')
  ).toBe(first);
  expect(
    screen.getByText(/Appearance unavailable: missing:portrait/)
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: 'Change confirmed appearance' })
  );
  await waitFor(() =>
    expect(
      screen
        .getAllByAltText('Customized fighter portrait')[0]
        .getAttribute('src')
    ).not.toBe(first)
  );
});
