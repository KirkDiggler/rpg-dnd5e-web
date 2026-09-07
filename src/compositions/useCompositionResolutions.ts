import type { CompositionResolution } from '@/compositions/CompositionPlacementModel';
import { compositionIdFromRef } from '@/compositions/compositionRef';
import type { CompositionSource } from '@/compositions/compositionSource';
import { useEffect, useMemo, useRef, useState } from 'react';

interface CompositionReference {
  readonly ref: string;
}

interface ResolutionCache {
  source: CompositionSource | undefined;
  worldId: string | undefined;
  values: Map<string, CompositionResolution>;
}

/** Resolve each unique composition ref once for a mounted consumer.
 *
 * The returned states deliberately keep missing, read errors, and an in-flight
 * read distinct. An absent source returns no resolutions; callers already know
 * whether their source is configured and can present that separately.
 */
export function useCompositionResolutions(
  references: readonly CompositionReference[],
  source: CompositionSource | undefined
): ReadonlyMap<string, CompositionResolution> {
  const compositionIds = useMemo(
    () =>
      [
        ...new Set(
          references.flatMap(({ ref }) => {
            const id = compositionIdFromRef(ref);
            return id ? [id] : [];
          })
        ),
      ].sort(),
    [references]
  );
  const signature = compositionIds.join('\u0000');
  const cache = useRef<ResolutionCache>({
    source: undefined,
    worldId: undefined,
    values: new Map(),
  });
  const activeIds = useRef<ReadonlySet<string>>(new Set());
  const [resolutions, setResolutions] = useState<
    ReadonlyMap<string, CompositionResolution>
  >(new Map());

  useEffect(() => {
    const requested = new Set(compositionIds);
    activeIds.current = requested;
    if (!source || requested.size === 0) {
      cache.current = {
        source,
        worldId: source?.worldId,
        values: new Map(),
      };
      setResolutions(new Map());
      return;
    }

    if (
      cache.current.source !== source ||
      cache.current.worldId !== source.worldId
    ) {
      cache.current = {
        source,
        worldId: source.worldId,
        values: new Map(),
      };
    }
    const values = cache.current.values;
    for (const id of values.keys()) {
      if (!requested.has(id)) values.delete(id);
    }
    const unresolved = compositionIds.filter((id) => !values.has(id));
    for (const id of unresolved) values.set(id, { status: 'loading' });
    setResolutions(new Map(values));

    const publish = (id: string, resolution: CompositionResolution) => {
      if (
        cache.current.source !== source ||
        cache.current.worldId !== source.worldId ||
        !activeIds.current.has(id) ||
        cache.current.values.get(id)?.status !== 'loading'
      ) {
        return;
      }
      cache.current.values.set(id, resolution);
      setResolutions(new Map(cache.current.values));
    };

    for (const id of unresolved) {
      void source.reader.getComposition(source.worldId, id).then(
        (composition) => {
          if (!composition) {
            publish(id, {
              status: 'missing',
              message: `Composition ${id} was not found in world ${source.worldId}.`,
            });
          } else if (
            composition.id !== id ||
            composition.worldId !== source.worldId
          ) {
            publish(id, {
              status: 'error',
              message: `Composition reader returned ${composition.worldId}/${composition.id} for ${source.worldId}/${id}.`,
            });
          } else {
            publish(id, { status: 'ready', composition });
          }
        },
        (error: unknown) => {
          publish(id, {
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      );
    }
    // Membership, not placement transforms, controls reads. Repeated refs and
    // transform-only edits therefore keep the same one-read-per-ID cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, source]);

  if (!source) return EMPTY_RESOLUTIONS;
  if (
    cache.current.source !== source ||
    cache.current.worldId !== source.worldId
  ) {
    return new Map(
      compositionIds.map((id) => [id, { status: 'loading' as const }])
    );
  }
  return resolutions;
}

const EMPTY_RESOLUTIONS: ReadonlyMap<string, CompositionResolution> = new Map();
