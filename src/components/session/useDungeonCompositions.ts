import type { CompositionResolution } from '@/compositions/CompositionPlacementModel';
import { compositionIdFromRef } from '@/compositions/compositionRef';
import type { CompositionSource } from '@/compositions/compositionSource';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SceneProp3D } from './atlasToScene3D';

interface SceneCompositionCache {
  source: CompositionSource | undefined;
  values: Map<string, CompositionResolution>;
}

/** Resolve each unique composition once for this rendered dungeon scene. */
export function useDungeonCompositions(
  props: readonly SceneProp3D[],
  source: CompositionSource | undefined
): ReadonlyMap<string, CompositionResolution> {
  const compositionIds = useMemo(
    () =>
      [
        ...new Set(
          props.flatMap((prop) => {
            const id = compositionIdFromRef(prop.ref);
            return id ? [id] : [];
          })
        ),
      ].sort(),
    [props]
  );
  const signature = compositionIds.join('\u0000');
  const cache = useRef<SceneCompositionCache>({
    source: undefined,
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
      cache.current = { source, values: new Map() };
      setResolutions(new Map());
      return;
    }

    if (cache.current.source !== source) {
      cache.current = { source, values: new Map() };
    }
    const values = cache.current.values;
    for (const id of values.keys()) {
      if (!requested.has(id)) values.delete(id);
    }
    const missing = compositionIds.filter((id) => !values.has(id));
    for (const id of missing) values.set(id, { status: 'loading' });
    setResolutions(new Map(values));

    const publish = (id: string, resolution: CompositionResolution) => {
      if (
        cache.current.source !== source ||
        !activeIds.current.has(id) ||
        cache.current.values.get(id)?.status !== 'loading'
      ) {
        return;
      }
      cache.current.values.set(id, resolution);
      setResolutions(new Map(cache.current.values));
    };

    for (const id of missing) {
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
    // `signature` deliberately represents membership, avoiding re-reads when
    // only a placement transform changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, source]);

  return resolutions;
}
