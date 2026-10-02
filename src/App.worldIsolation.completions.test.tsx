/**
 * Real-chain held-completion isolation across identity transitions
 * (web#522 / S6a).
 *
 * These tests use the REAL `LevelUpView`, the REAL toast store/provider (mounted
 * above the identity boundary exactly like `ApplicationRoot` does), the REAL
 * `useGetNextLevel`/`useLevelUp` hook chain and the REAL `GameIdentityBoundary`.
 * Only the transport client is mocked, so a completion can be held open and
 * released after the identity has moved on.
 *
 * They exist because the App-boundary suite mock-replaces `./api/hooks`
 * wholesale, which cannot observe a real post-await continuation.
 */
import { create } from '@bufbuild/protobuf';
import {
  GetNextLevelResponseSchema,
  LevelGainedSchema,
  LevelUpResponseSchema,
  type LevelUpResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Class } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App, { GameIdentityBoundary } from './App';
import { clearAuth, setAuth } from './api/auth';
import { resetDevWorldSelection } from './api/gameIdentity';
import { LevelUpView } from './character/level-up/LevelUpView';
import { ToastProvider } from './components/ui';

const WORLD_A = '123456789012345678';
const WORLD_B = '223456789012345678';
const ALLOWLIST = `${WORLD_A},${WORLD_B}`;
const REFUSAL_MESSAGE = 'engine refused this level';

const hoisted = vi.hoisted(() => ({
  getNextLevelFn: vi.fn(),
  levelUpFn: vi.fn<() => Promise<LevelUpResponse>>(),
  onComplete: vi.fn(),
  discord: {
    user: null as null | { id: string },
    isDiscord: false,
    isReady: true,
    isAuthenticated: false,
    error: null as string | null,
    guildId: null as string | null,
    grantedScopes: [] as string[],
    authSessionId: 0,
    authenticate: vi.fn(),
    clearAuthentication: vi.fn(),
    clearAuthenticationForSession: vi.fn(),
    isAuthenticationSessionCurrent: vi.fn((expected: number) => expected >= 0),
  },
}));

vi.mock('./discord', () => ({
  useDiscord: () => hoisted.discord,
  DiscordDebugPanel: () => null,
}));

// Only the transport is mocked: the hook chain, the view, the toast store and
// the identity boundary under test all stay real.
vi.mock('@/api/client', () => ({
  characterClient: {
    getNextLevel: hoisted.getNextLevelFn,
    levelUp: hoisted.levelUpFn,
  },
  characterV2Client: {},
  worldClient: {},
}));

vi.mock('./author/AuthorView', () => ({ AuthorView: () => null }));
vi.mock('./author/DungeonBuilderHomeButton', () => ({
  DungeonBuilderHomeButton: () => null,
}));
vi.mock('./character/creation/InteractiveCharacterSheet', () => ({
  InteractiveCharacterSheet: () => null,
}));
vi.mock('./character/sheet/CharacterSheet', () => ({
  CharacterSheet: () => null,
}));
vi.mock('./components/ThemeSelector', () => ({
  ThemeSelector: () => null,
}));
vi.mock('./concepts/ConceptsView', () => ({ ConceptsView: () => null }));
vi.mock('./concepts/world-building/WorldBuilderWorkspace', () => ({
  WorldBuilderWorkspace: () => null,
}));
vi.mock('./components/home', () => ({
  CharacterCarousel: () => null,
  SelectedCharacterPanel: () => null,
}));
vi.mock('./components/game/GameView', () => ({ GameView: () => null }));
vi.mock('./world/WorldAccessSettings', () => ({
  WorldAccessSettings: () => null,
}));
vi.mock('./toolkit-contributor-sandbox/route', () => ({
  isToolkitContributorSandboxRoute: () => false,
}));
vi.mock('./dev/attackDiePerfRoute', () => ({
  selectAttackDieDevRoute: () => ({ kind: 'normal' }),
}));
vi.mock('./dev/prop-calibration/route', () => ({
  isPropCalibrationRoute: () => false,
}));
vi.mock('./dev/asset-review/route', () => ({
  isAssetReviewRoute: () => false,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Toast nodes matching a message (AnimatePresence can retain an exiting one). */
function toastMessages(message: string) {
  return screen.queryAllByText(message);
}

function setSearch(search: string): void {
  window.history.replaceState({}, '', search);
}

function developmentWorldConfig(): void {
  vi.stubEnv('MODE', 'development');
  vi.stubEnv('VITE_DEV_WORLD_IDS', ALLOWLIST);
  vi.stubEnv('VITE_DEV_WORLD_ID', WORLD_A);
  vi.stubEnv('VITE_DEV_PLAYER_ID', 'player-P');
}

/** One level that asks nothing, so the confirm is a single click away. */
function nextLevelResponse() {
  return create(GetNextLevelResponseSchema, {
    level: 2,
    class: Class.FIGHTER,
    choices: [],
    features: [],
    hitDie: 10,
  });
}

/** ApplicationRoot's real shape: the toast store lives ABOVE App. */
function boundaryApp() {
  return (
    <ToastProvider>
      <GameIdentityBoundary>
        {() => (
          <LevelUpView
            characterId="char-1"
            onCancel={() => {}}
            onComplete={hoisted.onComplete}
          />
        )}
      </GameIdentityBoundary>
    </ToastProvider>
  );
}

async function openLevelUpAndHoldConfirm() {
  fireEvent.click(await screen.findByTestId('hit-point-method-average'));
  fireEvent.click(screen.getByTestId('level-up-confirm'));
  await waitFor(() => expect(hoisted.levelUpFn).toHaveBeenCalledTimes(1));
}

beforeEach(() => {
  hoisted.getNextLevelFn.mockReset();
  hoisted.getNextLevelFn.mockResolvedValue(nextLevelResponse());
  hoisted.levelUpFn.mockReset();
  hoisted.onComplete.mockReset();
  hoisted.discord.user = null;
  hoisted.discord.isDiscord = false;
  hoisted.discord.isReady = true;
  hoisted.discord.isAuthenticated = false;
  hoisted.discord.error = null;
  hoisted.discord.guildId = null;
  hoisted.discord.grantedScopes = [];
  hoisted.discord.authSessionId = 0;
  clearAuth();
  resetDevWorldSelection();
  setSearch('/');
});

afterEach(() => {
  clearAuth();
  resetDevWorldSelection();
  vi.unstubAllEnvs();
  setSearch('/');
});

// The App default export is imported so this suite proves the boundary is part
// of the real app module, not a copy.
void App;

describe('held level-up completion across an identity transition', () => {
  it('shows no world-A toast when a held world-A level-up rejection lands under world B', async () => {
    developmentWorldConfig();
    setSearch(`/?worldId=${WORLD_A}`);
    const held = deferred<LevelUpResponse>();
    hoisted.levelUpFn.mockReturnValueOnce(held.promise);

    const view = render(boundaryApp());
    await openLevelUpAndHoldConfirm();

    // The identity moves on before the engine answers.
    setSearch(`/?worldId=${WORLD_B}`);
    view.rerender(boundaryApp());
    await waitFor(() =>
      expect(hoisted.getNextLevelFn).toHaveBeenCalledTimes(2)
    );
    expect(screen.queryByText(REFUSAL_MESSAGE)).toBeNull();

    await act(async () => {
      held.reject(new Error(REFUSAL_MESSAGE));
      await held.promise.catch(() => undefined);
    });

    // The unmounted world-A continuation may not re-add its error as a toast
    // under world B, and must not fire another level-up or a follow-up read.
    expect(toastMessages(REFUSAL_MESSAGE)).toHaveLength(0);
    expect(hoisted.levelUpFn).toHaveBeenCalledTimes(1);
    expect(hoisted.onComplete).not.toHaveBeenCalled();
  });

  it('removes a world-A toast that was already visible when the identity changes', async () => {
    developmentWorldConfig();
    setSearch(`/?worldId=${WORLD_A}`);
    hoisted.levelUpFn.mockRejectedValueOnce(new Error(REFUSAL_MESSAGE));

    const view = render(boundaryApp());
    await openLevelUpAndHoldConfirm();

    // A's own failure is legitimately shown while A is still mounted.
    await waitFor(() =>
      expect(toastMessages(REFUSAL_MESSAGE).length).toBeGreaterThan(0)
    );

    setSearch(`/?worldId=${WORLD_B}`);
    view.rerender(boundaryApp());
    await waitFor(() =>
      expect(hoisted.getNextLevelFn).toHaveBeenCalledTimes(2)
    );

    // Nothing raised by world A may remain on screen under world B.
    await waitFor(() => expect(toastMessages(REFUSAL_MESSAGE)).toHaveLength(0));
  });

  it('holds a world-A level-up success without a gained panel or navigation under world B', async () => {
    developmentWorldConfig();
    setSearch(`/?worldId=${WORLD_A}`);
    const held = deferred<LevelUpResponse>();
    hoisted.levelUpFn.mockReturnValueOnce(held.promise);

    const view = render(boundaryApp());
    await openLevelUpAndHoldConfirm();

    setSearch(`/?worldId=${WORLD_B}`);
    view.rerender(boundaryApp());
    await waitFor(() =>
      expect(hoisted.getNextLevelFn).toHaveBeenCalledTimes(2)
    );

    await act(async () => {
      held.resolve(
        create(LevelUpResponseSchema, {
          gained: create(LevelGainedSchema, {
            level: 2,
            hitPointsGained: 7,
          }),
        })
      );
      await held.promise;
    });

    // World A's level was reported; world B must not show its gain panel, must
    // not navigate, and must not claim the level was taken here.
    expect(screen.queryByTestId('level-gained')).toBeNull();
    expect(hoisted.onComplete).not.toHaveBeenCalled();
    expect(hoisted.levelUpFn).toHaveBeenCalledTimes(1);
  });

  it('shows no world-A toast after sign-out and after same-world re-authentication', async () => {
    developmentWorldConfig();
    setSearch('/');
    // Real Discord credential in world A (the SDK guild is the world).
    setAuth('private-token', 'player-D', WORLD_A);
    hoisted.discord.user = { id: 'player-D' };
    hoisted.discord.isDiscord = true;
    hoisted.discord.isAuthenticated = true;
    hoisted.discord.authSessionId = 5;
    const held = deferred<LevelUpResponse>();
    hoisted.levelUpFn.mockReturnValueOnce(held.promise);

    const view = render(boundaryApp());
    await openLevelUpAndHoldConfirm();

    // Sign out: the credential epoch advances and the token/player are cleared.
    clearAuth();
    hoisted.discord.user = null;
    hoisted.discord.isAuthenticated = false;
    hoisted.discord.authSessionId = 6;
    view.rerender(boundaryApp());

    await act(async () => {
      held.reject(new Error(REFUSAL_MESSAGE));
      await held.promise.catch(() => undefined);
    });
    expect(toastMessages(REFUSAL_MESSAGE)).toHaveLength(0);

    // Re-authenticate in the SAME world with a new epoch: still nothing from
    // the retired session may surface.
    setAuth('private-token-2', 'player-D', WORLD_A);
    hoisted.discord.user = { id: 'player-D' };
    hoisted.discord.isAuthenticated = true;
    hoisted.discord.authSessionId = 7;
    view.rerender(boundaryApp());
    await waitFor(() => expect(hoisted.getNextLevelFn).toHaveBeenCalled());

    expect(toastMessages(REFUSAL_MESSAGE)).toHaveLength(0);
    expect(hoisted.onComplete).not.toHaveBeenCalled();
  });
});
