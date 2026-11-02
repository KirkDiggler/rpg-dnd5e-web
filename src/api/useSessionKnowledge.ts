import { cellsPatchOf, secretPatchOf } from '@/components/session/actGeometry';
import {
  applyCellsRevealed,
  applyConcealmentRevealed,
  MissingStructuralWallError,
} from '@/components/session/applyReveal';
import {
  assertPropPresentations,
  assertPropSightings,
} from '@/components/session/propPresentations';
import { assertStructuralLayoutIntegrity } from '@/components/session/structuralLayout';
import { nextViewerHoldingsFromAct } from '@/components/session/viewerHoldings';
import { mark } from '@/dev/perfMarks';
import { clone, create, toBinary } from '@bufbuild/protobuf';
import {
  GetKnowledgeResponseSchema,
  GetViewResponseSchema,
  type GetKnowledgeResponse,
  type GetViewResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import type { Act } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sessionClient } from './client';

const EMPTY_VIEW = create(GetViewResponseSchema);
const EMPTY_HOLDING: string[] = [];

/** One snapshot restores knowledge; subsequent view reads replace only mutable
 * observations. Existing stream recovery still owns delivery and narration. */
export function useSessionKnowledge(session: string, member: string) {
  const [snapshot, setSnapshot] = useState<GetKnowledgeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const generation = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pendingActs = useRef<Act[]>([]);
  // This ref is the same cache exposed as React state, updated synchronously at
  // the event boundary. Reducers stay pure; recovery never runs inside a React
  // state updater (which StrictMode may replay).
  const currentSnapshot = useRef<GetKnowledgeResponse | null>(null);
  const snapshotTask = useRef<Promise<void> | null>(null);
  const needsSnapshot = useRef(false);
  // SEEN-NOW SURVIVES A REVEAL PATCH (fog of war, rpg-project#586 walk). A
  // CELLS_REVEALED patch lands on the atlas before the view is re-read, and a
  // view read that was already in flight answers from before the patch. Until
  // a view read REQUESTED AFTER the patch lands, the cells the last view
  // marked seen stay seen. Every read and every patch takes a ticket from one
  // counter; only a read whose ticket is newer than the patch releases them.
  const ticket = useRef(0);
  const [held, setHeld] = useState<{
    cells: GetViewResponse['visibleCells'];
    after: number;
  } | null>(null);
  const releaseHeld = useCallback((readTicket: number) => {
    setHeld((prev) => (prev && readTicket > prev.after ? null : prev));
  }, []);
  const install = useCallback((next: GetKnowledgeResponse | null) => {
    currentSnapshot.current = next;
    setSnapshot(next);
  }, []);

  // Serialize snapshot and mutable reads so an older response cannot replace a
  // newer observation. Scope generations fence late responses after switching.
  const enqueue = useCallback(
    (work: (current: () => boolean) => Promise<void>) => {
      const scope = generation.current;
      const current = () => scope === generation.current;
      const next = queue.current
        .catch(() => {})
        .then(async () => {
          if (!current()) return;
          try {
            await work(current);
            if (current() && !needsSnapshot.current) setError(null);
          } catch (reason) {
            if (current()) {
              setError(
                reason instanceof Error ? reason : new Error(String(reason))
              );
              setLoading(false);
            }
          }
        });
      queue.current = next;
      return next;
    },
    []
  );

  /**
   * THE ACT STREAM'S INTAKE (rpg-project#630), and the only one since the v1
   * event stream left (rpg-dnd5e-web#1305). A perception act's cells and
   * revealed secret patch the atlas (`applyReveal.ts`), and a hold, a drop or
   * a departure moves the viewer's holdings.
   *
   * ACTS CARRY NO SEQ, so this cannot fence an act against the snapshot's
   * cutoff: GetKnowledge names its cutoff as a v1
   * seq, which an act does not have. It does not need to. Every patch here
   * is a union or an upsert by id (`applyReveal.ts`), and a holding is
   * last-writer-wins per prop, so replaying an act the snapshot already
   * holds changes nothing, and replaying a suffix of acts in id order ends
   * where the snapshot plus that suffix ends.
   */
  const applyAct = useCallback(
    (state: GetKnowledgeResponse, act: Act): GetKnowledgeResponse => {
      const perceived =
        act.body.case === 'perception' ? act.body.value : undefined;
      const cells = perceived?.cells
        ? cellsPatchOf(perceived.cells)
        : undefined;
      const revealed = perceived?.revealed
        ? secretPatchOf(perceived.revealed)
        : undefined;
      const reveal = cells ?? revealed;
      if (
        !state.atlas &&
        reveal &&
        (reveal.structuralWalls.length ||
          reveal.structuralDoors.length ||
          reveal.structuralWallOpeningsReplacements.length ||
          reveal.propPresentations?.length)
      )
        throw new MissingStructuralWallError('(atlas absent)');
      let atlas = state.atlas;
      if (cells && atlas) atlas = applyCellsRevealed(atlas, cells);
      if (revealed && atlas) atlas = applyConcealmentRevealed(atlas, revealed);
      const holding = nextViewerHoldingsFromAct(state.holding, act, member);
      if (atlas === state.atlas && holding === state.holding) return state;
      return { ...state, atlas, holding: [...holding] };
    },
    [member]
  );

  const refetch = useCallback(() => {
    if (snapshotTask.current) return snapshotTask.current;
    // Fence incoming events as soon as the request is queued, not only once
    // its network call begins. Failed recovery retains this fence and buffer.
    needsSnapshot.current = true;
    const task = enqueue(async (current) => {
      if (!session || !member) {
        if (current()) {
          install(null);
          needsSnapshot.current = false;
          pendingActs.current = [];
          setLoading(false);
        }
        return;
      }
      const readTicket = ++ticket.current;
      // Benchmark harness: current play's atlas arrives in GetKnowledge
      // (atlas + view), so the atlas marks wrap this round trip, every read.
      // `bytes` is the response's wire size, encoded only when marks are on.
      mark('play:atlas:requested');
      const response = await sessionClient.getKnowledge({ session, member });
      mark('play:atlas:received', {
        detail: () => ({
          bytes: toBinary(GetKnowledgeResponseSchema, response).byteLength,
        }),
      });
      if (!current()) return;
      if (response.atlas)
        assertStructuralLayoutIntegrity({
          walls: response.atlas.structuralWalls,
          doors: response.atlas.structuralDoors,
        });
      assertPropSightings(response.view?.props);
      assertPropPresentations(
        [
          ...(response.atlas?.propPresentations ?? []),
          ...(response.view?.props ?? []).flatMap((s) =>
            s.presentation ? [s.presentation] : []
          ),
        ],
        response.atlas?.structuralDoors
      );
      let restored = response;
      // Transport owns catch-up; this is only the finite hydration buffer.
      // Acts arrive in id order and are replayed in it (see applyAct).
      for (const act of pendingActs.current) restored = applyAct(restored, act);
      install(restored);
      releaseHeld(readTicket);
      pendingActs.current = [];
      needsSnapshot.current = false;
      setLoading(false);
    });
    snapshotTask.current = task;
    void task.then(() => {
      if (snapshotTask.current === task) snapshotTask.current = null;
    });
    return task;
  }, [session, member, enqueue, applyAct, install]);

  const refetchView = useCallback(
    () =>
      enqueue(async (current) => {
        if (!session || !member) return;
        const readTicket = ++ticket.current;
        const view: GetViewResponse = await sessionClient.getView({
          session,
          member,
        });
        assertPropSightings(view.props);
        if (current() && currentSnapshot.current) {
          assertPropPresentations(
            [
              ...(currentSnapshot.current.atlas?.propPresentations ?? []),
              ...view.props.flatMap((s) =>
                s.presentation ? [s.presentation] : []
              ),
            ],
            currentSnapshot.current.atlas?.structuralDoors
          );
          install({ ...currentSnapshot.current, view });
          releaseHeld(readTicket);
        }
      }),
    [session, member, enqueue, install, releaseHeld]
  );

  const refetchWhere = useCallback(
    () =>
      enqueue(async (current) => {
        if (!session || !member) return;
        const where = await sessionClient.getWhere({ session, member });
        if (current() && currentSnapshot.current)
          install({ ...currentSnapshot.current, where });
      }),
    [session, member, enqueue, install]
  );

  const refetchRoster = useCallback(
    () =>
      enqueue(async (current) => {
        if (!session || !member) return;
        const roster = await sessionClient.getRoster({ session, member });
        if (current() && currentSnapshot.current)
          install({ ...currentSnapshot.current, roster });
      }),
    [session, member, enqueue, install]
  );

  const acceptAct = useCallback(
    (act: Act) => {
      if (act.session && act.session !== session) return;
      if (needsSnapshot.current || !currentSnapshot.current) {
        pendingActs.current.push(act);
        return;
      }
      try {
        const before = currentSnapshot.current;
        const after = applyAct(before, act);
        if (after === before) return;
        install(after);
        if (act.body.case === 'perception' && act.body.value.cells) {
          // SEEN-NOW SURVIVES A REVEAL PATCH (see `ticket`).
          const patched = ++ticket.current;
          const seen = before.view?.visibleCells ?? [];
          setHeld((prev) => ({
            cells: prev ? [...prev.cells, ...seen] : [...seen],
            after: patched,
          }));
        }
      } catch (reason) {
        needsSnapshot.current = true;
        pendingActs.current.push(act);
        setError(reason instanceof Error ? reason : new Error(String(reason)));
        if (reason instanceof MissingStructuralWallError) void refetch();
      }
    },
    [applyAct, install, refetch, session]
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    install(null);
    queue.current = Promise.resolve();
    snapshotTask.current = null;
    needsSnapshot.current = false;
    pendingActs.current = [];
    setHeld(null);
    void refetch();
    return () => {
      generation.current++;
    };
  }, [refetch, install]);

  // This is a render projection of supplied observations, never stored geometry
  // or a visibility computation. Empty observations assert no spatial placement.
  const atlas = useMemo(() => {
    if (!snapshot?.atlas) return null;
    const props = [...snapshot.atlas.props];
    const placed = [...snapshot.atlas.placed];
    const propPresentations = [...(snapshot.atlas.propPresentations ?? [])];
    for (const sighting of snapshot.view?.props ?? []) {
      if (sighting.observedEmpty) continue;
      if (sighting.presentation) propPresentations.push(sighting.presentation);
      const current = sighting.currentVia.length > 0;
      if (sighting.shape.case === 'prop' && sighting.shape.value.at) {
        const prop = sighting.shape.value;
        props.push({
          ...prop,
          holdable: current && prop.holdable,
          blocksMovement: current && prop.blocksMovement,
        });
      } else if (
        sighting.shape.case === 'placed' &&
        sighting.shape.value.placement
      ) {
        const prop = sighting.shape.value;
        placed.push({
          ...prop,
          holdable: current && prop.holdable,
          blocksMovement: current && prop.blocksMovement,
        });
      }
    }
    return { ...snapshot.atlas, props, placed, propPresentations };
  }, [snapshot?.atlas, snapshot?.view?.props]);
  const roster = useMemo(
    () =>
      new Map((snapshot?.roster?.members ?? []).map((row) => [row.id, row])),
    [snapshot?.roster]
  );
  const doors = useMemo(
    () =>
      new Map(
        (snapshot?.view?.doors ?? []).flatMap((s) =>
          s.door ? [[s.door.door, s.door] as const] : []
        )
      ),
    [snapshot?.view?.doors]
  );
  // The view the scene draws: the server's latest answer, plus any cells held
  // seen across a reveal patch until a newer read lands. Never computed sight.
  const rawView = snapshot?.view ?? EMPTY_VIEW;
  const view = useMemo(() => {
    if (!held || held.cells.length === 0) return rawView;
    const merged = clone(GetViewResponseSchema, rawView);
    const keys = new Set(merged.visibleCells.map((c) => `${c.x},${c.y}`));
    for (const cell of held.cells) {
      const key = `${cell.x},${cell.y}`;
      if (keys.has(key)) continue;
      keys.add(key);
      merged.visibleCells.push(cell);
    }
    return merged;
  }, [held, rawView]);
  return {
    atlas,
    snapshot,
    view,
    holding: snapshot?.holding ?? EMPTY_HOLDING,
    roster,
    doors,
    loading,
    error,
    refetch,
    refetchView,
    refetchWhere,
    refetchRoster,
    acceptAct,
  };
}
