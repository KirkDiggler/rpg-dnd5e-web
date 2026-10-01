import { Code, ConnectError } from '@connectrpc/connect';
import type { World } from '@kirkdiggler/rpg-api-protos/gen/ts/api/world/v1alpha1/service_pb';
import { useEffect, useRef, useState } from 'react';
import { worldClient } from '../api/client';

interface Props {
  worldId: string | null;
  onBack: () => void;
}

/** Configuration UI submits references only. Discord/API determine authority. */
export function WorldAccessSettings({ worldId, onBack }: Props) {
  const [adminRoleId, setAdminRoleId] = useState('');
  const [builderRoleId, setBuilderRoleId] = useState('');
  const [playerRoleId, setPlayerRoleId] = useState('');
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [canRead, setCanRead] = useState(false);
  const epoch = useRef(0);

  function acceptWorld(world: World | undefined) {
    if (!world || world.worldId !== worldId || !world.roles) {
      throw new Error('The server returned an invalid world configuration.');
    }
    setAdminRoleId(world.roles.adminRoleId);
    setBuilderRoleId(world.roles.builderRoleId);
    setPlayerRoleId(world.roles.playerRoleId);
    setConfigured(true);
  }

  useEffect(() => {
    const current = ++epoch.current;
    setLoading(true);
    setSaving(false);
    setConfigured(false);
    setAdminRoleId('');
    setBuilderRoleId('');
    setPlayerRoleId('');
    setError(null);
    setMessage(null);
    setCanRead(false);
    if (!worldId) {
      setLoading(false);
      return;
    }
    void worldClient.getWorld({ worldId }).then(
      ({ world }) => {
        if (epoch.current !== current) return;
        if (!world || world.worldId !== worldId || !world.roles) {
          setError('The server returned an invalid world configuration.');
          setLoading(false);
          return;
        }
        setAdminRoleId(world.roles.adminRoleId);
        setBuilderRoleId(world.roles.builderRoleId);
        setPlayerRoleId(world.roles.playerRoleId);
        setConfigured(true);
        setCanRead(true);
        setLoading(false);
      },
      (failure: unknown) => {
        if (epoch.current !== current) return;
        const rpcError = ConnectError.from(failure);
        if (rpcError.code === Code.NotFound) {
          setConfigured(false);
          setCanRead(true);
          setMessage(
            'This server has no configured world access yet. Its owner must complete setup.'
          );
        } else {
          setError(rpcError.rawMessage);
        }
        setLoading(false);
      }
    );
    return () => {
      epoch.current += 1;
    };
  }, [worldId]);

  async function save(allRoles: boolean) {
    if (!worldId || loading || saving) return;
    const current = ++epoch.current;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = allRoles
        ? await worldClient.setWorldRoles({
            worldId,
            roles: { adminRoleId, builderRoleId, playerRoleId },
          })
        : await worldClient.setWorldMemberRoles({
            worldId,
            builderRoleId,
            playerRoleId,
          });
      if (epoch.current !== current) return;
      acceptWorld(result.world);
      setMessage(
        allRoles
          ? 'Server access saved.'
          : 'Builder and player access saved. Admin authority is unchanged.'
      );
    } catch (failure) {
      if (epoch.current === current)
        setError(ConnectError.from(failure).rawMessage);
    } finally {
      if (epoch.current === current) setSaving(false);
    }
  }

  const inputClass =
    'w-full rounded border border-slate-500 bg-slate-900 px-3 py-2 text-white';
  return (
    <section className="mx-auto max-w-2xl rounded-xl border border-slate-600 bg-slate-800 p-6 text-slate-100">
      <button type="button" onClick={onBack} className="mb-4 underline">
        Back to game
      </button>
      <h1 className="text-2xl font-bold">Server access</h1>
      <p className="mt-2 text-slate-300">
        Configure the Discord roles for this server’s world. Admins can build
        and play; world builders can play.
      </p>
      {worldId ? (
        <p className="mt-2 text-sm text-slate-400">
          World / Discord server: {worldId}
        </p>
      ) : (
        <p role="alert" className="mt-4">
          Open this Activity in a Discord server to configure its world.
        </p>
      )}
      {loading && worldId && (
        <p role="status" className="mt-4">
          Loading server access…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-red-300">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-4 text-emerald-300">
          {message}
        </p>
      )}
      {worldId && !loading && canRead && (
        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save(true);
          }}
        >
          <p className="text-sm text-slate-300">
            In Discord, enable Developer Mode, then right-click a role and
            choose Copy Role ID. Discord controls who receives each role.
          </p>
          <label className="block">
            World admin role ID
            <input
              name="adminRoleId"
              value={adminRoleId}
              onChange={(event) => setAdminRoleId(event.target.value)}
              required
              pattern="[1-9][0-9]*"
              inputMode="numeric"
              disabled={saving}
              className={inputClass}
            />
          </label>
          <label className="block">
            World builder role ID
            <input
              name="builderRoleId"
              value={builderRoleId}
              onChange={(event) => setBuilderRoleId(event.target.value)}
              required
              pattern="[1-9][0-9]*"
              inputMode="numeric"
              disabled={saving}
              className={inputClass}
            />
          </label>
          <label className="block">
            Player role ID
            <input
              name="playerRoleId"
              value={playerRoleId}
              onChange={(event) => setPlayerRoleId(event.target.value)}
              required
              pattern="[1-9][0-9]*"
              inputMode="numeric"
              disabled={saving}
              className={inputClass}
            />
          </label>
          <p className="text-sm text-slate-300">
            Only the verified Discord server owner can perform initial setup or
            change the admin role. World admins can save builder/player changes
            only.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-indigo-600 px-4 py-2 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save all roles (server owner)'}
            </button>
            {configured && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(false)}
                className="rounded bg-slate-600 px-4 py-2 disabled:opacity-50"
              >
                Save builder/player roles
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
