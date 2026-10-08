import {
  applyConcealmentRevealed,
  applyRegionRevealed,
  MissingStructuralWallError,
} from '@/components/session/applyReveal';
import {
  assertPropPresentations,
  assertPropSightings,
} from '@/components/session/propPresentations';
import { assertStructuralLayoutIntegrity } from '@/components/session/structuralLayout';
import { nextViewerHoldings } from '@/components/session/viewerHoldings';
import { create } from '@bufbuild/protobuf';
import type { Event } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  GetViewResponseSchema,
  type GetKnowledgeResponse,
  type GetViewResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sessionClient } from './client';

const EMPTY_VIEW = create(GetViewResponseSchema);
const EMPTY_HOLDING: string[] = [];

class KnowledgeSequenceGapError extends Error {
  constructor(expected: bigint, received: bigint) {
    super(`knowledge stream gap: expected ${expected}, received ${received}`);
    this.name = 'KnowledgeSequenceGapError';
  }
}

/** One snapshot restores knowledge; subsequent view reads replace only mutable
 * observations. Existing stream recovery still owns delivery and narration. */
export function useSessionKnowledge(session: string, member: string) {
  const [snapshot, setSnapshot] = useState<GetKnowledgeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const generation = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef<Event[]>([]);
  // This ref is the same cache exposed as React state, updated synchronously at
  // the event boundary. Reducers stay pure; recovery never runs inside a React
  // state updater (which StrictMode may replay).
  const currentSnapshot = useRef<GetKnowledgeResponse | null>(null);
  const snapshotTask = useRef<Promise<void> | null>(null);
  const needsSnapshot = useRef(false);
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

  const applyEvent = useCallback(
    (state: GetKnowledgeResponse, event: Event): GetKnowledgeResponse => {
      if (event.seq <= state.seq) return state;
      if (event.seq !== state.seq + 1n)
        throw new KnowledgeSequenceGapError(state.seq + 1n, event.seq);
      const reveal =
        event.body.case === 'roomRevealed' ||
        event.body.case === 'concealmentRevealed'
          ? event.body.value
          : undefined;
      if (
        !state.atlas &&
        reveal &&
        (reveal.structuralWalls.length ||
          reveal.structuralDoors.length ||
          reveal.structuralWallOpeningsReplacements.length ||
          reveal.propPresentations?.length)
      )
        throw new MissingStructuralWallError('(atlas absent)');
      // Both reveal routes use the same atomic structural reducer. Other
      // legacy refresh behavior and mutable observations retain their owners.
      let atlas =
        event.body.case === 'roomRevealed' && state.atlas
          ? applyRegionRevealed(state.atlas, event.body.value)
          : state.atlas;
      if (event.body.case === 'concealmentRevealed' && atlas) {
        atlas = applyConcealmentRevealed(atlas, event.body.value);
      }
      return {
        ...state,
        seq: event.seq,
        atlas,
        holding: [...nextViewerHoldings(state.holding, event, member)],
      };
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
          pending.current = [];
          setLoading(false);
        }
        return;
      }
      const response = await sessionClient.getKnowledge({ session, member });
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
      for (const event of [...pending.current].sort((a, b) =>
        a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0
      )) {
        restored = applyEvent(restored, event);
      }
      install(restored);
      pending.current = [];
      needsSnapshot.current = false;
      setLoading(false);
    });
    snapshotTask.current = task;
    void task.then(() => {
      if (snapshotTask.current === task) snapshotTask.current = null;
    });
    return task;
  }, [session, member, enqueue, applyEvent, install]);

  const refetchView = useCallback(
    () =>
      enqueue(async (current) => {
        if (!session || !member) return;
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
        }
      }),
    [session, member, enqueue, install]
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

  const acceptEvent = useCallback(
    (event: Event) => {
      if (
        (event.session && event.session !== session) ||
        (event.recipient && event.recipient !== member)
      )
        return;
      if (needsSnapshot.current || !currentSnapshot.current) {
        pending.current.push(event);
        return;
      }
      try {
        install(applyEvent(currentSnapshot.current, event));
      } catch (reason) {
        needsSnapshot.current = true;
        pending.current.push(event);
        setError(reason instanceof Error ? reason : new Error(String(reason)));
        if (
          reason instanceof MissingStructuralWallError ||
          reason instanceof KnowledgeSequenceGapError
        ) {
          // At most one automatic recovery. A failed request stays fenced; later
          // events are buffered until an explicit retry, not a retry loop.
          void refetch();
        }
      }
    },
    [applyEvent, install, member, refetch, session]
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    install(null);
    queue.current = Promise.resolve();
    snapshotTask.current = null;
    needsSnapshot.current = false;
    pending.current = [];
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
  return {
    atlas,
    snapshot,
    view: snapshot?.view ?? EMPTY_VIEW,
    holding: snapshot?.holding ?? EMPTY_HOLDING,
    roster,
    doors,
    loading,
    error,
    refetch,
    refetchView,
    refetchWhere,
    refetchRoster,
    acceptEvent,
  };
}
