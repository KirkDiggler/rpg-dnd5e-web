import { recordClient } from '@/api/client';
import { useEffect, useRef, useState } from 'react';
import { RECONNECT_CONFIG } from '../../api/streamReconnect';
import {
  RECORD_PAGE_LIMIT,
  startRecordFeed,
  type RecordFeed,
  type RecordFeedSnapshot,
} from './recordFeed';

const EMPTY: RecordFeedSnapshot = { rows: [], notice: undefined };

function retryDelayMs(attempt: number): number {
  return Math.min(
    RECONNECT_CONFIG.initialDelayMs *
      RECONNECT_CONFIG.backoffMultiplier ** attempt,
    RECONNECT_CONFIG.maxDelayMs
  );
}

/**
 * useSessionRecordStream holds the debug panel's copy of the session record
 * (rpg-project#628). It streams only while `enabled` — the debug panel is
 * showing — and keeps its rows across a pause, resuming after the last id it
 * holds. Catch-up, reconnect and lag handling are recordFeed's.
 */
export function useSessionRecordStream(
  session: string,
  member: string,
  enabled: boolean
): RecordFeedSnapshot {
  const [snapshot, setSnapshot] = useState<RecordFeedSnapshot>(EMPTY);
  const held = useRef<{ key: string; snapshot: RecordFeedSnapshot }>({
    key: '',
    snapshot: EMPTY,
  });

  useEffect(() => {
    const key = `${session}\u0000${member}`;
    if (held.current.key !== key) {
      held.current = { key, snapshot: EMPTY };
      setSnapshot(EMPTY);
    }
    if (!enabled || !session || !member) return;

    const prior = held.current.snapshot;
    const feed: RecordFeed = startRecordFeed({
      stream: (afterId, signal) =>
        recordClient.streamRecord({ session, member, afterId }, { signal }),
      get: (afterId, signal) =>
        recordClient.getRecord(
          { session, member, afterId, limit: RECORD_PAGE_LIMIT },
          { signal }
        ),
      onChange: (next) => {
        held.current = { key, snapshot: next };
        setSnapshot(next);
      },
      retryDelayMs,
      rows: prior.rows,
    });
    return () => feed.stop();
  }, [session, member, enabled]);

  return snapshot;
}
