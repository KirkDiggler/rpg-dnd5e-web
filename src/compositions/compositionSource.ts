import type { Composition } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { useEffect, useState } from 'react';
import type {
  CompositionReader,
  CompositionWriter,
} from './compositionJsonAdapter';

/** Explicit world-scoped read context shared by author preview and play. */
export interface CompositionSource {
  worldId: string;
  reader: CompositionReader;
  writer?: CompositionWriter;
}

export type CompositionListState =
  | { status: 'missing-source'; compositions: readonly Composition[] }
  | { status: 'loading'; compositions: readonly Composition[] }
  | { status: 'ready'; compositions: readonly Composition[] }
  | {
      status: 'error';
      compositions: readonly Composition[];
      message: string;
    };

export function useCompositionList(
  source: CompositionSource | undefined,
  refreshKey = 0
): CompositionListState {
  const [state, setState] = useState<CompositionListState>(() =>
    source
      ? { status: 'loading', compositions: [] }
      : { status: 'missing-source', compositions: [] }
  );

  useEffect(() => {
    if (!source) {
      setState({ status: 'missing-source', compositions: [] });
      return;
    }
    let current = true;
    setState({ status: 'loading', compositions: [] });
    void source.reader.listCompositions(source.worldId).then(
      (compositions) => {
        if (!current) return;
        const misplaced = compositions.find(
          (composition) => composition.worldId !== source.worldId
        );
        if (misplaced) {
          setState({
            status: 'error',
            compositions: [],
            message: `Composition ${misplaced.id} belongs to world ${misplaced.worldId}, not ${source.worldId}.`,
          });
          return;
        }
        setState({ status: 'ready', compositions });
      },
      (error: unknown) => {
        if (!current) return;
        setState({
          status: 'error',
          compositions: [],
          message: error instanceof Error ? error.message : String(error),
        });
      }
    );
    return () => {
      current = false;
    };
  }, [source, refreshKey]);

  return state;
}
