import { compositionMetadata } from '@/compositions/compositionMetadata';
import { compositionRef } from '@/compositions/compositionRef';
import { compositionThumbnailKey } from '@/compositions/compositionThumbnailKey';
import { CompositionThumbnailRenderer } from '@/compositions/CompositionThumbnailRenderer';
import { refInitials } from '@/utils/refs';
import type { Composition } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { useMemo } from 'react';
import type { BoardTool, PaletteItem } from './types';
import { useSerialThumbnailQueue } from './useSerialThumbnailQueue';

export interface CompositionThumbnailTilesProps {
  sourceWorldId: string;
  compositions: readonly Composition[];
  tool: BoardTool;
  armed: PaletteItem | null;
  onArm: (item: PaletteItem) => void;
  onTool: (tool: BoardTool) => void;
}

/** Composition buttons plus a serial, palette-local thumbnail cache. At most
 * one CompositionThumbnailRenderer (and therefore one WebGL canvas) exists;
 * results outside the current world/snapshot set are discarded. */
export function CompositionThumbnailTiles({
  sourceWorldId,
  compositions,
  tool,
  armed,
  onArm,
  onTool,
}: CompositionThumbnailTilesProps) {
  const entries = useMemo(
    () =>
      compositions.map((composition) => {
        let ref: string;
        try {
          ref = compositionRef(composition.id);
        } catch {
          return {
            composition,
            status: 'error' as const,
            message: `Unsupported composition ID: ${composition.id} — cannot be represented as a placement reference.`,
          };
        }
        const metadata = compositionMetadata(composition);
        if (metadata.status === 'error') {
          return {
            composition,
            status: 'error' as const,
            message: `Malformed composition ${composition.id}: ${metadata.message}`,
          };
        }
        return {
          composition,
          status: 'ready' as const,
          ref,
          name: metadata.name,
          key: compositionThumbnailKey(sourceWorldId, composition),
        };
      }),
    [compositions, sourceWorldId]
  );
  const supported = useMemo(
    () => entries.filter((entry) => entry.status === 'ready'),
    [entries]
  );
  const { active, results, recordComplete, recordError, recordRootError } =
    useSerialThumbnailQueue(supported);

  return (
    <>
      <div className="grid grid-cols-4 gap-1">
        {entries.map((entry) => {
          const { composition } = entry;
          if (entry.status === 'error') {
            return (
              <div
                key={composition.id}
                className="col-span-4 text-xs text-red-400"
                aria-label={`Unsupported composition ${composition.id}`}
              >
                {entry.message}
              </div>
            );
          }
          const { ref, key, name } = entry;
          const result = results[key];
          const on = armed?.ref === ref && tool === 'place';
          return (
            <button
              key={key}
              type="button"
              title={name}
              aria-label={`Place composition ${name}`}
              aria-pressed={on}
              className={`dg-chip relative ${on ? 'dg-chip--on' : ''}`}
              style={{ borderColor: '#7c3aed' }}
              data-thumbnail-state={result?.status ?? 'loading'}
              onClick={() => {
                onArm({ kind: 'prop', ref });
                onTool('place');
              }}
            >
              {result?.status === 'ready' && result.image ? (
                <img
                  src={result.image}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex w-full h-full items-center justify-center"
                >
                  {refInitials(name)}
                  {result?.status === 'error' && (
                    <span className="absolute right-1 top-0 text-red-400">
                      !
                    </span>
                  )}
                </span>
              )}
              <span className="sr-only">
                {result?.status === 'error'
                  ? `Thumbnail unavailable${result.message ? `: ${result.message}` : ''}`
                  : result?.status === 'ready'
                    ? 'Thumbnail ready'
                    : 'Thumbnail loading'}
              </span>
            </button>
          );
        })}
      </div>
      {active && (
        <CompositionThumbnailRenderer
          composition={active.composition}
          requestKey={active.key}
          onComplete={recordComplete}
          onError={recordError}
          onRootError={recordRootError}
        />
      )}
    </>
  );
}
