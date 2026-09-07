import { clearAuth, getAuthDecision } from '@/api/auth';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordProvider } from './DiscordProvider';
import { useDiscord } from './hooks';

const sdkMocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  authenticate: vi.fn(),
  participants: vi.fn(),
  guildId: '123456789012345678' as string | null,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

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
      <button onClick={() => discord.clearAuthentication('signed out')}>
        sign out
      </button>
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
  vi.clearAllMocks();
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

  it('keeps a newer login when an older authorization succeeds late', async () => {
    const authorizationA = deferred<{ code: string }>();
    const authorizationB = deferred<{ code: string }>();
    sdkMocks.authorize
      .mockImplementationOnce(() => authorizationA.promise)
      .mockImplementationOnce(() => authorizationB.promise);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const code = JSON.parse(String(init?.body)).code as string;
        return {
          ok: true,
          json: async () => ({ access_token: `token-for-${code}` }),
        };
      })
    );
    sdkMocks.authenticate.mockImplementation(
      async ({ access_token }: { access_token: string }) => ({
        user: {
          id: access_token.endsWith('code-b') ? 'player-b' : 'player-a',
          username: 'player',
          discriminator: '0',
        },
        scopes: ['identify', 'applications.commands', 'guilds.members.read'],
      })
    );
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('ready').textContent).toBe('true')
    );

    fireEvent.click(screen.getByRole('button', { name: 'authenticate' }));
    fireEvent.click(screen.getByRole('button', { name: 'authenticate' }));
    expect(sdkMocks.authorize).toHaveBeenCalledTimes(2);

    await act(async () => {
      authorizationB.resolve({ code: 'code-b' });
    });
    await waitFor(() =>
      expect(getAuthDecision('production')).toEqual({
        kind: 'discord',
        playerId: 'player-b',
        guildId: '123456789012345678',
      })
    );

    await act(async () => {
      authorizationA.resolve({ code: 'code-a' });
    });
    expect(getAuthDecision('production')).toEqual({
      kind: 'discord',
      playerId: 'player-b',
      guildId: '123456789012345678',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sdkMocks.authenticate).toHaveBeenCalledTimes(1);
  });

  it('keeps a newer login when an older authorization fails late', async () => {
    const authorizationA = deferred<{ code: string }>();
    const authorizationB = deferred<{ code: string }>();
    sdkMocks.authorize
      .mockImplementationOnce(() => authorizationA.promise)
      .mockImplementationOnce(() => authorizationB.promise);
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('ready').textContent).toBe('true')
    );

    fireEvent.click(screen.getByRole('button', { name: 'authenticate' }));
    fireEvent.click(screen.getByRole('button', { name: 'authenticate' }));
    await act(async () => {
      authorizationB.resolve({ code: 'code-b' });
    });
    await waitFor(() =>
      expect(screen.getByTestId('authenticated').textContent).toBe('true')
    );

    await act(async () => {
      authorizationA.reject(new Error('late cancellation from A'));
    });
    expect(screen.getByTestId('authenticated').textContent).toBe('true');
    expect(screen.getByTestId('error').textContent).toBe('none');
    expect(getAuthDecision('production').kind).toBe('discord');
  });

  it('still clears the current login when its reauthorization fails', async () => {
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('ready').textContent).toBe('true')
    );
    fireEvent.click(screen.getByRole('button', { name: 'authenticate' }));
    await waitFor(() =>
      expect(screen.getByTestId('authenticated').textContent).toBe('true')
    );

    sdkMocks.authorize.mockRejectedValueOnce(new Error('current denied'));
    fireEvent.click(screen.getByRole('button', { name: 'authenticate' }));

    await waitFor(() =>
      expect(screen.getByTestId('error').textContent).toBe('current denied')
    );
    expect(screen.getByTestId('authenticated').textContent).toBe('false');
    expect(getAuthDecision('production')).toEqual({ kind: 'unauthenticated' });
  });

  it('does not resurrect an authentication invalidated while token exchange is pending', async () => {
    const tokenExchange = deferred<{
      ok: boolean;
      json(): Promise<{ access_token: string }>;
    }>();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => tokenExchange.promise)
    );
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('ready').textContent).toBe('true')
    );

    fireEvent.click(screen.getByRole('button', { name: 'authenticate' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'sign out' }));
    await act(async () => {
      tokenExchange.resolve({
        ok: true,
        json: async () => ({ access_token: 'late-token' }),
      });
    });
    expect(screen.getByTestId('authenticated').textContent).toBe('false');
    expect(screen.getByTestId('error').textContent).toBe('signed out');
    expect(getAuthDecision('production')).toEqual({ kind: 'unauthenticated' });
    expect(sdkMocks.authenticate).not.toHaveBeenCalled();
  });

  it('invalidates a pending authorization when the provider unmounts', async () => {
    const authorization = deferred<{ code: string }>();
    sdkMocks.authorize.mockImplementationOnce(() => authorization.promise);
    const view = renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('ready').textContent).toBe('true')
    );

    fireEvent.click(screen.getByRole('button', { name: 'authenticate' }));
    expect(sdkMocks.authorize).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => {
      authorization.resolve({ code: 'late-code' });
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(sdkMocks.authenticate).not.toHaveBeenCalled();
    expect(getAuthDecision('production')).toEqual({ kind: 'unauthenticated' });
  });

  it('clears authentication when the current consent is cancelled or denied', async () => {
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
