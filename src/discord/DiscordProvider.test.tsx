import { clearAuth, getAuthDecision } from '@/api/auth';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordProvider } from './DiscordProvider';
import { useDiscord } from './hooks';

const sdkMocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  authenticate: vi.fn(),
  participants: vi.fn(),
  guildId: '123456789012345678' as string | null,
}));

vi.mock('./sdk', () => ({
  isDiscordEnvironment: () => true,
  getEnvironmentInfo: () => ({
    instanceId: 'debug-instance',
    channelId: 'debug-channel',
    guildId: '999999999999999999',
  }),
  initializeDiscordSdk: async () => ({
    get guildId() {
      return sdkMocks.guildId;
    },
    commands: {
      authorize: sdkMocks.authorize,
      authenticate: sdkMocks.authenticate,
      getInstanceConnectedParticipants: sdkMocks.participants,
    },
  }),
}));

function Consumer() {
  const discord = useDiscord();
  return (
    <div>
      <span data-testid="ready">{String(discord.isReady)}</span>
      <span data-testid="authenticated">{String(discord.isAuthenticated)}</span>
      <span data-testid="guild">{discord.guildId ?? 'none'}</span>
      <span data-testid="scopes">{discord.grantedScopes.join(' ')}</span>
      <span data-testid="session">{discord.authSessionId}</span>
      <span data-testid="error">{discord.error ?? 'none'}</span>
      <button onClick={() => void discord.authenticate()}>authenticate</button>
      <button onClick={() => discord.clearAuthenticationForSession(0, 'old')}>
        clear-old
      </button>
      <button
        onClick={() =>
          discord.clearAuthenticationForSession(
            discord.authSessionId,
            'current expired'
          )
        }
      >
        clear-current
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <DiscordProvider>
      <Consumer />
    </DiscordProvider>
  );
}

beforeEach(() => {
  sdkMocks.guildId = '123456789012345678';
  sdkMocks.authorize.mockResolvedValue({ code: 'authorization-code' });
  sdkMocks.authenticate.mockResolvedValue({
    user: {
      id: 'player-1',
      username: 'player',
      discriminator: '0',
      avatar: null,
      global_name: 'Player',
    },
    scopes: ['identify', 'applications.commands', 'guilds.members.read'],
  });
  sdkMocks.participants.mockResolvedValue({ participants: [] });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: 'private-token' }),
    }))
  );
});

afterEach(() => {
  clearAuth();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DiscordProvider guild authorization', () => {
  it('requests membership consent without prompt and uses sdk.guildId', async () => {
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('ready').textContent).toBe('true')
    );

    fireEvent.click(screen.getByRole('button', { name: 'authenticate' }));

    await waitFor(() =>
      expect(screen.getByTestId('authenticated').textContent).toBe('true')
    );
    expect(sdkMocks.authorize).toHaveBeenCalledWith({
      client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
      response_type: 'code',
      state: '',
      scope: ['identify', 'applications.commands', 'guilds.members.read'],
    });
    expect(sdkMocks.authorize.mock.calls[0]![0]).not.toHaveProperty('prompt');
    expect(screen.getByTestId('guild').textContent).toBe('123456789012345678');
    expect(screen.getByTestId('scopes').textContent).toContain(
      'guilds.members.read'
    );
    expect(getAuthDecision('production')).toEqual({
      kind: 'discord',
      playerId: 'player-1',
      guildId: '123456789012345678',
    });
  });

  it('clears authentication when consent is cancelled or denied', async () => {
    sdkMocks.authorize.mockRejectedValue(new Error('consent cancelled'));
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('ready').textContent).toBe('true')
    );

    fireEvent.click(screen.getByRole('button', { name: 'authenticate' }));

    await waitFor(() =>
      expect(screen.getByTestId('error').textContent).toMatch(/cancelled/i)
    );
    expect(screen.getByTestId('authenticated').textContent).toBe('false');
    expect(getAuthDecision('production')).toEqual({ kind: 'unauthenticated' });
  });

  it('fails closed when the authenticated grant omits membership scope', async () => {
    sdkMocks.authenticate.mockResolvedValue({
      user: {
        id: 'player-1',
        username: 'player',
        discriminator: '0',
      },
      scopes: ['identify', 'applications.commands'],
    });
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('ready').textContent).toBe('true')
    );

    fireEvent.click(screen.getByRole('button', { name: 'authenticate' }));

    await waitFor(() =>
      expect(screen.getByTestId('error').textContent).toMatch(
        /membership access/i
      )
    );
    expect(screen.getByTestId('authenticated').textContent).toBe('false');
    expect(screen.getByTestId('scopes').textContent).toBe('');
    expect(getAuthDecision('production')).toEqual({ kind: 'unauthenticated' });
  });

  it('ignores stale session clears but clears the current session', async () => {
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('ready').textContent).toBe('true')
    );
    fireEvent.click(screen.getByRole('button', { name: 'authenticate' }));
    await waitFor(() =>
      expect(screen.getByTestId('session').textContent).toBe('1')
    );

    fireEvent.click(screen.getByRole('button', { name: 'clear-old' }));
    expect(screen.getByTestId('authenticated').textContent).toBe('true');
    expect(screen.getByTestId('error').textContent).toBe('none');

    fireEvent.click(screen.getByRole('button', { name: 'clear-current' }));
    expect(screen.getByTestId('authenticated').textContent).toBe('false');
    expect(screen.getByTestId('error').textContent).toBe('current expired');
    expect(screen.getByTestId('session').textContent).toBe('2');
  });
});
