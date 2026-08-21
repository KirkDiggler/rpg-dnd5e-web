/**
 * Session Tomb concept — W3 of rpg-project#227, first slice.
 *
 * The first thing in this codebase that speaks `dnd5e.api.session.v1alpha1`.
 * It loads a session's atlas from the real server, draws it, and walks a member
 * around it by clicking cells.
 *
 * # Why a concept page and not the game route
 *
 * The game route talks to `EncounterService` and will keep doing so until the
 * cutover. The two services are not versions of each other: four of the web's
 * eight encounter calls (SubmitCheck, Interact, ActivateFeature,
 * SetReactionReady) have no counterpart here, and ten RPCs here have never been
 * called by this codebase. Reimplementation, not a port — and doing it beside
 * the old route rather than inside it is the same coexistence discipline the
 * server side used.
 *
 * # Why plain SVG and not HexGrid
 *
 * `HexGrid` takes `Wall[]` from v1alpha2, `CombatState`, `MonsterCombatState`
 * and `AbsoluteFloorTile`. Feeding it the new atlas means manufacturing the old
 * wire's shapes from the new one's data, which is the wrapper we refused at the
 * server, moved into the client. This slice draws the new wire on its own terms
 * so we can see what it actually says; what the real renderer should look like
 * now that walls are DECLARED rather than derived is the next question, and a
 * better one to answer with the picture in front of us.
 *
 * # Running it
 *
 * Since rpg-api#801 the server has no other stack: every StartEncounter builds
 * a session, and its encounter id is what goes in the box below. A session that
 * does not exist is reported, not swallowed.
 */

import { sessionClient } from '@/api/client';
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import type { Position } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildScene,
  cellKey,
  hexCenter,
  layoutFromWire,
  type AtlasScene,
  type HexLayout,
} from './atlas';

const HEX_SIZE = 10;

/**
 * Deep-link params, matching the `?concept=` convention ConceptsView already
 * uses and for the same stated reason: visual evidence should be reproducible
 * from a URL rather than from a sequence of clicks somebody has to describe.
 *
 * `?session=<id>&member=<id>` fills the form and loads immediately. Pair it
 * with `?playerId=<id>` (the app's dev auth override) or every call comes back
 * Unauthenticated.
 */
const paramOf = (name: string): string =>
  typeof window === 'undefined'
    ? ''
    : (new URLSearchParams(window.location.search).get(name) ?? '');

interface Loaded {
  scene: AtlasScene;
  cellCount: number;
}

export function SessionTombConcept() {
  const [session, setSession] = useState(() => paramOf('session'));
  const [member, setMember] = useState(() => paramOf('member'));
  // The wire says which way the hexes point (GetAtlasResponse.layout,
  // session v0.20.0). `override` exists only so the other picture can be seen
  // on demand — it is never the default, because defaulting is how the
  // staircase got drawn.
  const [override, setOverride] = useState<HexLayout | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [rawAtlas, setRawAtlas] = useState<GetAtlasResponse | null>(null);
  const [me, setMe] = useState<Position | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // The controller lives in a ref because aborting it is an imperative act, but
  // whether a stream is RUNNING is state: a ref read during render never
  // re-renders, so a button labelled from the ref would be stale in both
  // directions. Two things, two homes.
  const [streaming, setStreaming] = useState(false);
  const streamAbort = useRef<AbortController | null>(null);

  const say = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-80), line]);
  }, []);

  // Re-laying out an already-loaded atlas must not need another round trip:
  // the layout is read off the atlas we already have, so flipping the
  // override is pure geometry over data in hand.
  //
  // The wire is consulted FIRST, every time. The override only ever replaces a
  // valid hex layout: a square atlas has nothing to override (null stays
  // null), and a hex atlas that arrives without a layout is a server defect
  // that layoutFromWire throws on — reported in the log, never drawn with a
  // stale choice. Either way a scene that cannot be drawn is cleared rather
  // than left showing the previous atlas's cells.
  const [layout, setLayout] = useState<HexLayout | null>(null);
  useEffect(() => {
    if (!rawAtlas) {
      setLayout(null);
      setLoaded(null);
      return;
    }
    let wire: HexLayout | null;
    try {
      wire = layoutFromWire(rawAtlas.layout, rawAtlas.grid);
    } catch (err) {
      say(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
      setLayout(null);
      setLoaded(null);
      return;
    }
    const chosen = wire === null ? null : (override ?? wire);
    setLayout(chosen);
    if (chosen === null) {
      setLoaded(null);
      return;
    }
    setLoaded({
      scene: buildScene(rawAtlas, HEX_SIZE, chosen),
      cellCount: rawAtlas.cells.length,
    });
  }, [rawAtlas, override, say]);

  const refreshMember = useCallback(
    async (sessionID: string, memberID: string) => {
      const where = await sessionClient.getWhere({
        session: sessionID,
        member: memberID,
      });
      setMe(where.position ?? null);
      const view = await sessionClient.getView({
        session: sessionID,
        member: memberID,
      });
      setSeen(view.sightings.map((s) => s.subject));
    },
    []
  );

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const atlas = await sessionClient.getAtlas({ session });
      setRawAtlas(atlas);
      say(
        `atlas: ${atlas.cells.length} cells, ${atlas.props.length} props, ` +
          `${atlas.boundaries.length} boundaries, ${atlas.doorways.length} doorways`
      );
      if (member) {
        await refreshMember(session, member);
      }
    } catch (err) {
      say(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [session, member, refreshMember, say]);

  const walkTo = useCallback(
    async (cell: Position) => {
      if (!member || busy) {
        return;
      }
      setBusy(true);
      try {
        const out = await sessionClient.move({
          session,
          member,
          path: [cell],
        });
        // Steps shorter than the path is not an error: the walk did what it
        // could and where it got to is the answer.
        say(
          `move -> ${cellKey(cell)}: ${out.steps.length} step(s)` +
            (out.formed ? ' — A FIGHT FORMED' : '')
        );
        await refreshMember(session, member);
      } catch (err) {
        say(
          `move refused: ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        setBusy(false);
      }
    },
    [session, member, busy, refreshMember, say]
  );

  const toggleStream = useCallback(async () => {
    if (streamAbort.current) {
      streamAbort.current.abort();
      streamAbort.current = null;
      setStreaming(false);
      say('stream: stopped');
      return;
    }
    const ctrl = new AbortController();
    streamAbort.current = ctrl;
    setStreaming(true);
    say('stream: listening');
    try {
      for await (const event of sessionClient.streamEvents(
        { session, member },
        { signal: ctrl.signal }
      )) {
        say(`event: kind=${event.kind} seq=${event.seq}`);
      }
      // Reached when the SERVER closes the stream, which is an ordinary end
      // rather than a failure -- said out loud so a silently-dropped
      // subscription does not look like a quiet world.
      if (!ctrl.signal.aborted) {
        say('stream: closed by server');
      }
    } catch (err) {
      if (!ctrl.signal.aborted) {
        say(
          `stream error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } finally {
      // Every exit clears BOTH, including the two this used to leave behind --
      // a server close and an error -- which stranded the button reading "Stop
      // stream" over a stream that had already ended, so reconnecting took a
      // pointless stop-then-start. Guarded on identity so a stream that was
      // already replaced by a newer one cannot clear its successor's state.
      if (streamAbort.current === ctrl) {
        streamAbort.current = null;
        setStreaming(false);
      }
    }
  }, [session, member, say]);

  useEffect(() => () => streamAbort.current?.abort(), []);

  // A deep-linked session loads itself, once. Guarded by a ref rather than by
  // the dependency list so that editing the field afterwards does not re-fire
  // the automatic load underneath the person typing.
  const autoLoaded = useRef(false);
  useEffect(() => {
    if (autoLoaded.current || !paramOf('session')) {
      return;
    }
    autoLoaded.current = true;
    void load();
  }, [load]);

  const myKey = me ? cellKey(me) : null;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-bold">
          Session Tomb — the new wire, drawn
        </h2>
        <p className="text-sm opacity-70">
          Reads <code>dnd5e.api.session.v1alpha1</code> from the live server.
          Paste the encounter id a StartEncounter returned.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-sm">
          <div className="opacity-70">session (encounter id)</div>
          <input
            className="px-2 py-1 rounded border bg-transparent"
            value={session}
            onChange={(e) => setSession(e.target.value)}
            placeholder="enc-..."
          />
        </label>
        <label className="text-sm">
          <div className="opacity-70">member (character id)</div>
          <input
            className="px-2 py-1 rounded border bg-transparent"
            value={member}
            onChange={(e) => setMember(e.target.value)}
            placeholder="char-..."
          />
        </label>
        <button
          className="px-3 py-1.5 rounded border"
          onClick={load}
          disabled={!session || busy}
        >
          Load atlas
        </button>
        <button
          className="px-3 py-1.5 rounded border"
          onClick={toggleStream}
          disabled={!session || !member}
        >
          {streaming ? 'Stop stream' : 'Stream events'}
        </button>
        <label className="text-sm flex items-center gap-2">
          <span className="opacity-70">layout</span>
          <select
            className="px-2 py-1 rounded border bg-transparent"
            value={override ?? 'wire'}
            onChange={(e) =>
              setOverride(
                e.target.value === 'wire' ? null : (e.target.value as HexLayout)
              )
            }
          >
            <option value="wire">
              from the wire{rawAtlas && layout ? ` (${layout})` : ''}
            </option>
            <option value="pointy">override: pointy</option>
            <option value="flat">override: flat</option>
          </select>
        </label>
      </div>

      <p className="text-xs opacity-60 max-w-3xl">
        The wire says which way the hexes point now —{' '}
        <code>GetAtlasResponse.layout</code>, session v0.20.0, rpg-toolkit#1140
        — so the layout is read, not guessed. The override is here only to show
        the other picture: the two choices draw genuinely different maps, and
        this page is where that was first seen — twice (rpg-toolkit#1140, then
        #1150). What you get from the wire now is what the author drew.
      </p>

      {loaded && (
        <svg
          viewBox={loaded.scene.viewBox}
          className="w-full border rounded"
          style={{ maxHeight: '60vh', background: 'var(--bg-secondary)' }}
        >
          {loaded.scene.cells.map((c) => (
            <polygon
              key={c.key}
              points={c.corners.map((p) => `${p.x},${p.y}`).join(' ')}
              fill={c.key === myKey ? '#3b82f6' : '#1f2937'}
              stroke="#374151"
              strokeWidth={0.3}
              onClick={() => walkTo(c.cell)}
              style={{ cursor: member ? 'pointer' : 'default' }}
            />
          ))}

          {/* Doorways under the walls: a doorway is a way THROUGH a seam. */}
          {loaded.scene.doorways.map((d) => (
            <line
              key={d.connection}
              x1={d.a.x}
              y1={d.a.y}
              x2={d.b.x}
              y2={d.b.y}
              stroke="#22c55e"
              strokeWidth={1.2}
              strokeDasharray="2 1"
            />
          ))}

          {loaded.scene.walls.map((w, i) => (
            <line
              key={i}
              x1={w.a.x}
              y1={w.a.y}
              x2={w.b.x}
              y2={w.b.y}
              // A boundary answers two questions independently, so it is drawn
              // with two: solid stops a walk, opaque stops a sightline.
              stroke={w.blocksLineOfSight ? '#f8fafc' : '#f59e0b'}
              strokeWidth={w.blocksMovement ? 1.6 : 0.8}
            />
          ))}

          {loaded.scene.props.map((p, i) => (
            <g key={`${p.ref}-${i}`}>
              <circle
                cx={p.center.x}
                cy={p.center.y}
                r={HEX_SIZE * 0.42}
                fill={p.blocksMovement ? '#a16207' : 'none'}
                stroke={p.blocksLineOfSight ? '#f8fafc' : '#a16207'}
                strokeWidth={0.5}
              />
              <title>
                {p.name} — {p.blocksMovement ? 'blocks movement' : 'walkable'},{' '}
                {p.blocksLineOfSight ? 'blocks sight' : 'see-through'}
              </title>
            </g>
          ))}

          {me && layout && (
            <circle
              cx={hexCenter(me, HEX_SIZE, layout).x}
              cy={hexCenter(me, HEX_SIZE, layout).y}
              r={HEX_SIZE * 0.3}
              fill="#f8fafc"
            />
          )}
        </svg>
      )}

      {loaded && (
        <div className="text-sm opacity-80">
          {loaded.cellCount} cells · {loaded.scene.walls.length} walls ·{' '}
          {loaded.scene.doorways.length} doorways · {loaded.scene.props.length}{' '}
          props
          {seen.length > 0 && <> · sees: {seen.join(', ')}</>}
        </div>
      )}

      <pre className="text-xs p-2 rounded border overflow-auto max-h-48 opacity-80">
        {log.join('\n') || 'nothing yet'}
      </pre>
    </div>
  );
}
