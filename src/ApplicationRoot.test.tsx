import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationRoot } from './ApplicationRoot';

vi.mock('./App', () => ({ default: () => <div>Application</div> }));
vi.mock('./discord', () => ({
  DiscordProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="discord-provider">{children}</div>
  ),
}));
vi.mock('./components/ui', () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="toast-provider">{children}</div>
  ),
}));

describe('ApplicationRoot', () => {
  it('renders the loopback calibration tool outside application providers and StrictMode', () => {
    render(
      <ApplicationRoot
        mode="development"
        hostname="127.0.0.1"
        search="?propCalibration=1"
      />
    );

    expect(screen.getByText('Application')).toBeTruthy();
    expect(screen.queryByTestId('discord-provider')).toBeNull();
    expect(screen.queryByTestId('toast-provider')).toBeNull();
  });

  it('keeps the ordinary application inside its providers', () => {
    render(
      <ApplicationRoot mode="development" hostname="127.0.0.1" search="" />
    );

    expect(screen.getByTestId('discord-provider')).toBeTruthy();
    expect(screen.getByTestId('toast-provider')).toBeTruthy();
  });
});
