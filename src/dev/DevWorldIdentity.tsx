import { type GameIdentity, parseDevWorldAllowlist } from '@/api/gameIdentity';

/**
 * Development-only world-selection surfaces (web#522 / S6a).
 *
 * Both are rendered by the App identity boundary and never reach production:
 * the badge only under `import.meta.env.MODE === 'development'`, the refusal
 * only for a development identity whose explicit Dev world selection was
 * invalid. They exist so an operator running two local tabs can see at a
 * glance which world a client believes it is in — there is deliberately no
 * production guild picker here.
 */

function allowedWorlds(): readonly string[] {
  return parseDevWorldAllowlist(import.meta.env.VITE_DEV_WORLD_IDS).ids;
}

function worldSwitchHref(worldId: string): string {
  const params = new URLSearchParams(window.location.search);
  params.set('worldId', worldId);
  return `?${params.toString()}`;
}

/**
 * One compact line naming the live identity: credential kind, player, world
 * and credential epoch, plus links to each explicitly allowed local world.
 * Purely informational; it authorizes nothing.
 */
export function DevWorldIdentityBadge({
  identity,
}: {
  identity: GameIdentity;
}) {
  const worlds = allowedWorlds();
  return (
    <div
      data-testid="dev-world-identity"
      className="fixed left-2 top-2 rounded border border-slate-500 bg-black/80 px-2 py-1 text-xs text-white"
      style={{ zIndex: 200 }}
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold uppercase tracking-wide opacity-70">
          dev identity
        </span>
        <span data-testid="dev-world-identity-kind">{identity.kind}</span>
        <span data-testid="dev-world-identity-player">
          {identity.playerId ?? 'anonymous'}
        </span>
        <span data-testid="dev-world-identity-world">
          {identity.worldId ?? 'no world'}
        </span>
        <span data-testid="dev-world-identity-epoch">
          epoch {identity.authSessionId}
        </span>
      </div>
      {worlds.length > 0 && (
        <div className="mt-1 flex items-center gap-2">
          {worlds.map((worldId) => (
            <a
              key={worldId}
              href={worldSwitchHref(worldId)}
              className={
                worldId === identity.worldId
                  ? 'underline font-semibold'
                  : 'underline opacity-70'
              }
              data-testid={`dev-world-identity-link-${worldId}`}
            >
              world {worldId}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Explicit refusal for an invalid development world selection. No gameplay
 * request was sent, and the client does not fall back to the default world:
 * the operator has to fix the selection or the configured allowlist.
 */
export function DevWorldSelectionRefusal({
  identity,
}: {
  identity: GameIdentity;
}) {
  const worlds = allowedWorlds();
  return (
    <div
      data-testid="dev-world-selection-refusal"
      className="min-h-screen p-8"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <h1
        className="mb-4 text-3xl font-bold"
        style={{ color: 'var(--text-primary)' }}
      >
        Development world selection refused
      </h1>
      <p className="mb-4" style={{ color: 'var(--text-muted)' }}>
        {identity.worldSelectionError ??
          'The requested development world is not valid.'}
      </p>
      <p className="mb-2" style={{ color: 'var(--text-muted)' }}>
        No gameplay request was sent. This client will not fall back to the
        default world.
      </p>
      {worlds.length > 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>
          Allowed local worlds:{' '}
          {worlds.map((worldId) => (
            <a
              key={worldId}
              href={worldSwitchHref(worldId)}
              className="mr-3 underline"
            >
              {worldId}
            </a>
          ))}
        </p>
      ) : (
        <p style={{ color: 'var(--text-muted)' }}>
          Set VITE_DEV_WORLD_IDS to a comma-separated allowlist and
          VITE_DEV_WORLD_ID to one of its entries.
        </p>
      )}
    </div>
  );
}
