import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface ThumbnailQueueEntry {
  key: string;
}

export interface ThumbnailResult {
  status: 'ready' | 'error';
  image?: string;
  message?: string;
}

/** Palette-local serial work and image cache shared by composition and asset
 * thumbnails. The caller owns the one renderer for `active`; this hook keeps
 * completed images until their exact immutable keys leave the supplied set. */
export function useSerialThumbnailQueue<T extends ThumbnailQueueEntry>(
  entries: readonly T[]
) {
  const desiredKeys = useMemo(
    () => new Set(entries.map((entry) => entry.key)),
    [entries]
  );
  const desiredKeysRef = useRef(desiredKeys);
  desiredKeysRef.current = desiredKeys;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const [results, setResults] = useState<Record<string, ThumbnailResult>>({});

  useEffect(() => {
    setResults((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => desiredKeys.has(key))
      )
    );
  }, [desiredKeys]);

  const active = entries.find((entry) => results[entry.key] === undefined);
  const recordResult = useCallback((key: string, result: ThumbnailResult) => {
    if (!desiredKeysRef.current.has(key)) return;
    setResults((current) =>
      current[key] === undefined ? { ...current, [key]: result } : current
    );
  }, []);
  const recordComplete = useCallback(
    (key: string, image: string) =>
      recordResult(key, { status: 'ready', image }),
    [recordResult]
  );
  const recordError = useCallback(
    (key: string, message: string) =>
      recordResult(key, { status: 'error', message }),
    [recordResult]
  );
  const recordRootError = useCallback((message: string) => {
    setResults((current) => {
      const next = { ...current };
      for (const entry of entriesRef.current) {
        next[entry.key] ??= { status: 'error', message };
      }
      return next;
    });
  }, []);

  return {
    active,
    results,
    recordComplete,
    recordError,
    recordRootError,
  };
}
