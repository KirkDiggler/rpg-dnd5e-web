import { compositionRef } from '@/compositions/compositionRef';
import { compositionThumbnailKey } from '@/compositions/compositionThumbnailKey';
import { CompositionThumbnailRenderer } from '@/compositions/CompositionThumbnailRenderer';
import { refInitials, refLabel } from '@/utils/refs';
import type { Composition } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BoardTool, PaletteItem } from './types';

interface ThumbnailResult {
  status: 'ready' | 'error';
  image?: string;
  message?: string;
}

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
  const supported = useMemo(
    () =>
      compositions.flatMap((composition) => {
        try {
          return [
            {
              composition,
              ref: compositionRef(composition.id),
              key: compositionThumbnailKey(sourceWorldId, composition),
            },
          ];
        } catch {
          return [];
        }
      }),
    [compositions, sourceWorldId]
  );
  const desiredKeys = useMemo(
    () => new Set(supported.map((entry) => entry.key)),
    [supported]
  );
  const desiredKeysRef = useRef(desiredKeys);
  desiredKeysRef.current = desiredKeys;
  const [results, setResults] = useState<Record<string, ThumbnailResult>>({});

  useEffect(() => {
    setResults((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => desiredKeys.has(key))
      )
    );
  }, [desiredKeys]);

  const active = supported.find((entry) => results[entry.key] === undefined);
  const recordResult = (key: string, result: ThumbnailResult) => {
    if (!desiredKeysRef.current.has(key)) return;
    setResults((current) =>
      current[key] === undefined ? { ...current, [key]: result } : current
    );
  };

  return (
    <>
      <div className="grid grid-cols-4 gap-1">
        {compositions.map((composition) => {
          let ref: string;
          try {
            ref = compositionRef(composition.id);
          } catch {
            return (
              <div
                key={composition.id}
                className="col-span-4 text-xs text-red-400"
                aria-label={`Unsupported composition ID ${composition.id}`}
              >
                Unsupported composition ID: <code>{composition.id}</code> —
                cannot be represented as a placement reference.
              </div>
            );
          }
          const key = compositionThumbnailKey(sourceWorldId, composition);
          const result = results[key];
          const on = armed?.ref === ref && tool === 'place';
          return (
            <button
              key={key}
              type="button"
              title={`${refLabel(ref)} · ${composition.id}`}
              aria-label={`Place composition ${refLabel(ref)}`}
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
                  {refInitials(ref)}
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
          onComplete={(key, image) =>
            recordResult(key, { status: 'ready', image })
          }
          onError={(key, message) =>
            recordResult(key, { status: 'error', message })
          }
        />
      )}
    </>
  );
}
