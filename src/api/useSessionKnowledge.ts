import {
  applyConcealmentRevealed,
  applyRegionRevealed,
} from '@/components/session/applyReveal';
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

/** One snapshot restores knowledge; subsequent view reads replace only mutable
 * observations. Existing stream recovery still owns delivery and narration. */
export function useSessionKnowledge(session: string, member: string) {
  const [snapshot, setSnapshot] = useState<GetKnowledgeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const generation = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef<Event[]>([]);
  const cutoff = useRef<bigint | null>(null);
  const hydrating = useRef(false);

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
            if (current()) setError(null);
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
      // BOTH reveal routes carry the SAME fixed structural records (upsert by
      // id, canonical order). Room reveal already patches the cached atlas in
      // place; concealment reveal does the same for the structural rows while
      // its other fields continue to arrive through the existing authoritative
      // GetAtlas/GetDoors refresh. A replayed or late event is fenced by the
      // seq guard above, so a known cut cannot be reverted. Empty legacy
      // arrays are a no-op.
      let atlas =
        event.body.case === 'roomRevealed' && state.atlas
          ? applyRegionRevealed(state.atlas, event.body.value)
          : state.atlas;
      if (event.body.case === 'concealmentRevealed' && atlas) {
        atlas = applyConcealmentRevealed(atlas, event.body.value);
      }
      return {
        ...state,
        atlas,
        holding: [...nextViewerHoldings(state.holding, event, member)],
      };
    },
    [member]
  );

  const refetch = useCallback(
    () =>
      enqueue(async (current) => {
        if (!session || !member) {
          if (current()) {
            setSnapshot(null);
            setLoading(false);
          }
          return;
        }
        hydrating.current = true;
        try {
          const response = await sessionClient.getKnowledge({
            session,
            member,
          });
          if (!current()) return;
          let restored = response;
          for (const event of pending.current)
            restored = applyEvent(restored, event);
          cutoff.current = response.seq;
          setSnapshot(restored);
          setLoading(false);
        } finally {
          if (current()) {
            hydrating.current = false;
            pending.current = [];
          }
        }
      }),
    [session, member, enqueue, applyEvent]
  );

  const refetchView = useCallback(
    () =>
      enqueue(async (current) => {
        if (!session || !member) return;
        const view: GetViewResponse = await sessionClient.getView({
          session,
          member,
        });
        if (current())
          setSnapshot((state) => (state ? { ...state, view } : state));
      }),
    [session, member, enqueue]
  );

  const refetchWhere = useCallback(
    () =>
      enqueue(async (current) => {
        if (!session || !member) return;
        const where = await sessionClient.getWhere({ session, member });
        if (current())
          setSnapshot((state) => (state ? { ...state, where } : state));
      }),
    [session, member, enqueue]
  );

  const refetchRoster = useCallback(
    () =>
      enqueue(async (current) => {
        if (!session || !member) return;
        const roster = await sessionClient.getRoster({ session, member });
        if (current())
          setSnapshot((state) => (state ? { ...state, roster } : state));
      }),
    [session, member, enqueue]
  );

  const acceptEvent = useCallback(
    (event: Event) => {
      // Keep events arriving during snapshot hydration, including a resnapshot.
      if (hydrating.current || cutoff.current === null)
        pending.current.push(event);
      if (cutoff.current !== null) {
        setSnapshot((state) => (state ? applyEvent(state, event) : state));
      }
    },
    [applyEvent]
  );

  useEffect(() => {
    setLoading(true);
    setSnapshot(null);
    cutoff.current = null;
    pending.current = [];
    void refetch();
    return () => {
      generation.current++;
    };
  }, [refetch]);

  // This is a render projection of supplied observations, never stored geometry
  // or a visibility computation. Empty observations assert no spatial placement.
  const atlas = useMemo(() => {
    if (!snapshot?.atlas) return null;
    const props = [...snapshot.atlas.props];
    const placed = [...snapshot.atlas.placed];
    for (const sighting of snapshot.view?.props ?? []) {
      if (sighting.observedEmpty) continue;
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
    return { ...snapshot.atlas, props, placed };
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
