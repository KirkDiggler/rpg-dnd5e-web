import { create } from '@bufbuild/protobuf';
import { EntityStateSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { EntityType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { useState } from 'react';
import { v2PositionToV1 } from '../../api/positionConvert';
import { useDevPlayerIdAuth } from '../../api/useDevPlayerIdAuth';
import { useEncounterStream2 } from '../../api/useEncounterStream2';
import { useMoveEntityV2 } from '../../api/useMoveEntityV2';
import { useEncounterState } from '../../hooks/useEncounterState';
import { protoPositionToHex } from '../../utils/hexCoord';

function formatTime(d: Date): string {
  return d.toTimeString().slice(0, 8);
}

/**
 * Dev-only playtest verification harness for wave-2.5 slice 2.
 * Renders at ?encounterId=<id>&playerId=<id> in development mode.
 * Uses ONLY the v2 path (useEncounterStream2 + useMoveEntityV2).
 * DELETE in slice 3 cleanup.
 */
export function PlaytestHarness() {
  const params = new URLSearchParams(window.location.search);
  const encounterId = params.get('encounterId') || 'dev-encounter';
  const playerId = params.get('playerId');

  // Sync dev playerId override into the gRPC auth store before stream mounts.
  // useLayoutEffect fires before any child useEffect, preventing a race where
  // the first request goes out without the override applied.
  useDevPlayerIdAuth(playerId);

  const entityId = playerId ? `char-${playerId}` : '';

  const [log, setLog] = useState<string[]>([]);
  const [targetQ, setTargetQ] = useState(0);
  const [targetR, setTargetR] = useState(0);
  const [targetS, setTargetS] = useState(0);

  const encounterState = useEncounterState();
  const {
    moveEntity,
    loading: moveLoading,
    error: moveError,
  } = useMoveEntityV2();

  const addLog = (msg: string) => {
    const entry = `[${formatTime(new Date())}] ${msg}`;
    setLog((prev) => [entry, ...prev].slice(0, 30));
  };

  const stream = useEncounterStream2(
    playerId ? encounterId : null,
    playerId ?? '',
    {
      onSnapshotDelivered: () => {
        addLog('SnapshotDelivered (stream up)');
      },
      onEntityMoved: (e) => {
        const last = e.actualPath[e.actualPath.length - 1];
        if (last) {
          encounterState.applyEntityPositionUpdate(
            e.entityId,
            v2PositionToV1(last)
          );
        }
        const pos = last ? `(${last.x},${last.y},${last.z})` : '(no path)';
        addLog(`EntityMoved ${e.entityId} → ${pos}`);
      },
      onGeometryRevealed: (e) => {
        const positions = e.hexes
          .map((h) => h.position)
          .filter((p): p is NonNullable<typeof p> => p !== undefined);
        encounterState.applyHexRevealed(positions.map(protoPositionToHex));
        addLog(`GeometryRevealed ${positions.length} hex(es)`);
      },
      onEntityAppeared: (e) => {
        if (!e.entity || !e.entity.position) return;
        const stub = create(EntityStateSchema, {
          entityId: e.entity.id,
          position: v2PositionToV1(e.entity.position),
          entityType: EntityType.UNSPECIFIED,
        });
        encounterState.applyEntityAppeared(stub);
        addLog(`EntityAppeared ${e.entity.id}`);
      },
      onEntityDisappeared: (e) => {
        if (e.lastKnownPosition) {
          encounterState.applyEntityDisappeared(
            e.entityId,
            protoPositionToHex(e.lastKnownPosition)
          );
        }
        addLog(`EntityDisappeared ${e.entityId}`);
      },
    }
  );

  if (!playerId) {
    return (
      <div style={{ padding: 16, color: 'red', fontFamily: 'monospace' }}>
        Error: playerId is required — add ?playerId=alice to the URL
      </div>
    );
  }

  const myEntity = encounterState.state.entities.get(entityId);
  const myPosition = myEntity?.position;

  // Slice 1's SnapshotDelivered.encounter field is empty by design, so the
  // harness has no current position until the first move triggers events.
  // Without a fallback the move button stays permanently disabled. These
  // hardcoded values match the manually-seeded encounter (`enc:v2:dev-encounter`
  // in Redis) so the first move can dispatch correctly. After it lands,
  // EntityMoved updates real state and the fallback is unused.
  const SEEDED_FALLBACK: Record<string, { x: number; y: number; z: number }> = {
    alice: { x: 0, y: 0, z: 0 },
    bob: { x: 1, y: -1, z: 0 },
  };
  const fallback = playerId ? SEEDED_FALLBACK[playerId] : undefined;
  const usingFallback = !myPosition && !!fallback;
  const canMove = !!myPosition || !!fallback;

  const handleMove = async () => {
    const currentPos = myPosition
      ? { x: myPosition.x ?? 0, y: myPosition.y ?? 0, z: myPosition.z ?? 0 }
      : (fallback ?? { x: 0, y: 0, z: 0 });
    const target = { x: targetQ, y: targetR, z: targetS };
    try {
      await moveEntity(encounterId, entityId, [currentPos, target]);
    } catch {
      // error is surfaced via moveError state — no rethrow needed here
    }
  };

  const entitiesArray = Array.from(encounterState.state.entities.entries());
  const revealedKeys = Array.from(encounterState.state.revealedHexes);

  return (
    <div
      style={{
        fontFamily: 'monospace',
        padding: 16,
        background: '#111',
        color: '#eee',
        minHeight: '100vh',
      }}
    >
      {/* Header */}
      <div
        data-testid="harness-header"
        style={{
          background: '#222',
          padding: '8px 12px',
          marginBottom: 16,
          borderRadius: 4,
          display: 'flex',
          gap: 24,
        }}
      >
        <span>
          Playtest <strong>{encounterId}</strong> as <strong>{playerId}</strong>
        </span>
        <span>
          connection: <strong>{stream.connectionState}</strong>
        </span>
        <span>entityId: {entityId}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left column: entities + hexes */}
        <div>
          {/* Entities table */}
          <h3 style={{ margin: '0 0 8px', color: '#aaa' }}>
            Entities ({entitiesArray.length})
          </h3>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            <thead>
              <tr style={{ color: '#888', textAlign: 'left' }}>
                <th style={{ padding: '4px 8px' }}>id</th>
                <th style={{ padding: '4px 8px' }}>x</th>
                <th style={{ padding: '4px 8px' }}>y</th>
                <th style={{ padding: '4px 8px' }}>z</th>
                <th style={{ padding: '4px 8px' }}>ghost?</th>
              </tr>
            </thead>
            <tbody>
              {entitiesArray.map(([id, entity]) => (
                <tr
                  key={id}
                  style={{
                    background: id === entityId ? '#1a2a1a' : 'transparent',
                    borderTop: '1px solid #333',
                  }}
                >
                  <td style={{ padding: '4px 8px' }}>{id}</td>
                  <td style={{ padding: '4px 8px' }}>
                    {entity.position?.x ?? '—'}
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    {entity.position?.y ?? '—'}
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    {entity.position?.z ?? '—'}
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    {entity.ghost ? 'yes' : ''}
                  </td>
                </tr>
              ))}
              {entitiesArray.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '4px 8px', color: '#555' }}>
                    (no entities yet)
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Revealed hexes */}
          <h3 style={{ margin: '0 0 8px', color: '#aaa' }}>
            Revealed hexes ({encounterState.state.revealedHexes.size})
          </h3>
          <div style={{ fontSize: 12, color: '#777', marginBottom: 16 }}>
            {revealedKeys.length === 0
              ? '(none)'
              : revealedKeys.slice(0, 20).join(', ') +
                (revealedKeys.length > 20
                  ? ` … +${revealedKeys.length - 20} more`
                  : '')}
          </div>

          {/* Move controls */}
          <h3 style={{ margin: '0 0 8px', color: '#aaa' }}>Move {entityId}</h3>
          {!canMove && (
            <div style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>
              (waiting for first event — position unknown)
            </div>
          )}
          {usingFallback && (
            <div style={{ color: '#aa8', fontSize: 12, marginBottom: 8 }}>
              (using seeded fallback position — no events received yet)
            </div>
          )}
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <label style={{ fontSize: 12 }}>
              Q{' '}
              <input
                type="number"
                value={targetQ}
                onChange={(e) => setTargetQ(Number(e.target.value))}
                style={{
                  width: 60,
                  background: '#333',
                  color: '#eee',
                  border: '1px solid #555',
                  padding: '2px 4px',
                }}
              />
            </label>
            <label style={{ fontSize: 12 }}>
              R{' '}
              <input
                type="number"
                value={targetR}
                onChange={(e) => setTargetR(Number(e.target.value))}
                style={{
                  width: 60,
                  background: '#333',
                  color: '#eee',
                  border: '1px solid #555',
                  padding: '2px 4px',
                }}
              />
            </label>
            <label style={{ fontSize: 12 }}>
              S{' '}
              <input
                type="number"
                value={targetS}
                onChange={(e) => setTargetS(Number(e.target.value))}
                style={{
                  width: 60,
                  background: '#333',
                  color: '#eee',
                  border: '1px solid #555',
                  padding: '2px 4px',
                }}
              />
            </label>
            <button
              onClick={() => void handleMove()}
              disabled={!canMove || moveLoading}
              style={{
                padding: '4px 12px',
                background: canMove ? '#2a4a2a' : '#2a2a2a',
                color: canMove ? '#8f8' : '#666',
                border: '1px solid #555',
                cursor: canMove && !moveLoading ? 'pointer' : 'not-allowed',
              }}
            >
              {moveLoading ? 'Moving…' : 'Move there'}
            </button>
          </div>
          {moveError && (
            <div style={{ color: '#f88', marginTop: 8, fontSize: 12 }}>
              Move error: {moveError.message}
            </div>
          )}
        </div>

        {/* Right column: event log */}
        <div>
          <h3 style={{ margin: '0 0 8px', color: '#aaa' }}>
            Recent events ({log.length})
          </h3>
          <div
            style={{
              background: '#0a0a0a',
              border: '1px solid #333',
              padding: 8,
              fontSize: 11,
              height: 400,
              overflowY: 'auto',
            }}
          >
            {log.length === 0 && (
              <span style={{ color: '#555' }}>(waiting for events…)</span>
            )}
            {log.map((entry, i) => (
              <div key={i} style={{ color: '#9d9', marginBottom: 2 }}>
                {entry}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
