/**
 * LobbyFlow — GameView slice 2's party-assembly front end (#440), built on
 * the new `dnd5e.api.lobby.v1alpha1` LobbyService (rpg-api-protos#177,
 * rpg-api#630 — slice 1, merged). Create/join/ready/host-start on the
 * lobby's own StreamLobby snapshot-then-deltas, mirroring StreamEncounter's
 * proven pattern. On `encounter_started`, hands the encounterId up to
 * GameView and unmounts — no lobby state survives the handoff
 * (lobby-surface.md).
 *
 * This is a NEW component on a NEW proto package — distinct from the
 * v1alpha1 LobbyScreen/WaitingRoom in src/components/lobby/, which
 * LobbyView still uses and which this slice does not touch or reuse
 * (design.md: clean-slate rebuild, no shim).
 */

import type { LobbyMember } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/types_pb';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCreateLobby } from '../../api/useCreateLobby';
import { useJoinLobby } from '../../api/useJoinLobby';
import { useLobbyStream } from '../../api/useLobbyStream';
import { useSetLobbyReady } from '../../api/useSetLobbyReady';
import { useStartLobbyEncounter } from '../../api/useStartLobbyEncounter';
import { errorMessage } from '../../utils/combatFormat';
import { PartyRoster } from './PartyRoster';

/**
 * Placeholder campaign scope — CreateLobbyRequest.campaign_id is
 * validated-but-otherwise-opaque today (lobby-surface.md: "mirrors
 * CreateEncounterRequest's campaign_id, unused"). No campaign concept
 * exists in the UI yet; a single constant keeps every dev lobby in the same
 * (currently meaningless) scope until one does.
 */
const DEV_CAMPAIGN_ID = 'default-campaign';

export interface LobbyFlowProps {
  /** The character selected on the home screen — bound to this player's lobby seat. */
  characterId: string;
  playerId: string;
  onEncounterStarted: (encounterId: string) => void;
  onBack: () => void;
}

export function LobbyFlow({
  characterId,
  playerId,
  onEncounterStarted,
  onBack,
}: LobbyFlowProps) {
  const [lobbyId, setLobbyId] = useState<string | null>(null);
  const [joinRef, setJoinRef] = useState<string | null>(null);
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null);
  const [members, setMembers] = useState<LobbyMember[]>([]);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { createLobby, loading: createLoading } = useCreateLobby();
  const { joinLobby, loading: joinLoading } = useJoinLobby();
  const { setReady, loading: readyLoading } = useSetLobbyReady();
  const { startEncounter, loading: startLoading } = useStartLobbyEncounter();

  // Dev join-ref carrier (lobby-surface.md Decision 2): a URL param supplies
  // the same opaque join_ref the Discord Activity carrier will supply
  // automatically later. Read once — this component doesn't react to the
  // URL changing after mount.
  const urlJoinRef = useMemo(
    () => new URLSearchParams(window.location.search).get('joinRef'),
    []
  );
  const attemptedAutoJoinRef = useRef(false);

  const handleJoin = async (ref: string) => {
    const trimmed = ref.trim();
    if (!trimmed) return;
    setError(null);
    try {
      const resp = await joinLobby({ joinRef: trimmed, characterId });
      setLobbyId(resp.lobbyId);
      setMembers(resp.members);
      setJoinRef(trimmed);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  useEffect(() => {
    if (urlJoinRef && !lobbyId && !attemptedAutoJoinRef.current) {
      attemptedAutoJoinRef.current = true;
      void handleJoin(urlJoinRef);
    }
    // handleJoin is stable enough for this one-shot mount effect; including
    // it would re-run on every render since it's not memoized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlJoinRef, lobbyId]);

  const stream = useLobbyStream(lobbyId, {
    onSnapshot: (e) => setMembers(e.members),
    onMemberJoined: (e) => {
      if (!e.member) return;
      const joined = e.member;
      setMembers((prev) => [
        ...prev.filter((m) => m.playerId !== joined.playerId),
        joined,
      ]);
    },
    onMemberLeft: (e) =>
      setMembers((prev) => prev.filter((m) => m.playerId !== e.playerId)),
    onMemberReady: (e) =>
      setMembers((prev) =>
        prev.map((m) =>
          m.playerId === e.playerId ? { ...m, isReady: e.ready } : m
        )
      ),
    onMemberConnectionChanged: (e) =>
      setMembers((prev) =>
        prev.map((m) =>
          m.playerId === e.playerId ? { ...m, isConnected: e.connected } : m
        )
      ),
    onHostChanged: (e) => {
      setHostPlayerId(e.playerId);
      setMembers((prev) =>
        prev.map((m) => ({ ...m, isHost: m.playerId === e.playerId }))
      );
    },
    onEncounterStarted: (e) => {
      setLobbyId(null); // drop the lobby stream — encounter_started is terminal
      onEncounterStarted(e.encounterId);
    },
  });

  const handleCreate = async () => {
    setError(null);
    try {
      const resp = await createLobby({
        campaignId: DEV_CAMPAIGN_ID,
        characterId,
      });
      setLobbyId(resp.lobbyId);
      setJoinRef(resp.joinRef);
      setHostPlayerId(resp.hostPlayerId);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleToggleReady = async () => {
    if (!lobbyId) return;
    const me = members.find((m) => m.playerId === playerId);
    const nextReady = !(me?.isReady ?? false);
    setError(null);
    try {
      await setReady({ lobbyId, ready: nextReady });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleStart = async () => {
    if (!lobbyId) return;
    setError(null);
    try {
      const resp = await startEncounter({ lobbyId });
      // Belt-and-suspenders: also drive off the RPC response directly in
      // case the caller's own StreamLobby delta races the response (the
      // broadcast should reach every member including the host, but the
      // host doesn't need to wait for its own echo).
      setLobbyId(null);
      onEncounterStarted(resp.encounterId);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const isHost =
    members.length > 0
      ? members.some((m) => m.playerId === playerId && m.isHost)
      : hostPlayerId === playerId;
  const allReady = members.length > 0 && members.every((m) => m.isReady);
  const me = members.find((m) => m.playerId === playerId);

  if (!lobbyId) {
    return (
      <div
        data-testid="lobby-flow-entry"
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <h2>Party up</h2>
        <button onClick={() => void handleCreate()} disabled={createLoading}>
          {createLoading ? 'Creating…' : 'Create lobby'}
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label>
            Join code{' '}
            <input
              type="text"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              placeholder="paste a join code"
              aria-label="join code"
            />
          </label>
          <button
            onClick={() => void handleJoin(joinCodeInput)}
            disabled={joinLoading || !joinCodeInput.trim()}
          >
            {joinLoading ? 'Joining…' : 'Join'}
          </button>
        </div>
        {error && <div style={{ color: '#f88' }}>{error}</div>}
        <button onClick={onBack}>Back</button>
      </div>
    );
  }

  return (
    <div
      data-testid="lobby-flow-roster"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <h2>Lobby</h2>
      <div style={{ fontSize: 12, opacity: 0.6 }}>
        connection: {stream.connectionState}
      </div>
      {joinRef && (
        <div data-testid="join-code-display" style={{ fontSize: 13 }}>
          Join code: <code>{joinRef}</code>
        </div>
      )}
      <PartyRoster members={members} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => void handleToggleReady()}
          disabled={readyLoading}
        >
          {me?.isReady ? 'Unready' : 'Ready up'}
        </button>
        {isHost && (
          <button
            data-testid="start-encounter-button"
            onClick={() => void handleStart()}
            disabled={!allReady || startLoading}
            title={
              allReady
                ? 'Start the encounter'
                : 'Waiting for everyone to ready up'
            }
          >
            {startLoading ? 'Starting…' : 'Start'}
          </button>
        )}
      </div>
      {error && <div style={{ color: '#f88' }}>{error}</div>}
      <button onClick={onBack}>Back</button>
    </div>
  );
}
