import { storyClient } from '@/api/client';
import type { Act } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { useEffect, useRef, useState } from 'react';
import { RECONNECT_CONFIG } from '../../api/streamReconnect';
import {
  STORY_PAGE_LIMIT,
  startActFeed,
  type ActDeliveryMetadata,
  type ActStreamState,
} from './actFeed';

function retryDelayMs(attempt: number): number {
  return Math.min(
    RECONNECT_CONFIG.initialDelayMs *
      RECONNECT_CONFIG.backoffMultiplier ** attempt,
    RECONNECT_CONFIG.maxDelayMs
  );
}

/**
 * useSessionActStream delivers one member's acts (rpg-project#630): GetStory
 * pages first, as `catchup`, then StreamEvents, as `live`. Each same-id run
 * arrives in one `onRun` call. Catch-up, reconnect, lag and restart handling
 * are actFeed's; this hook only binds it to the story client and the
 * component's lifetime.
 */
export function useSessionActStream(
  session: string,
  member: string,
  onRun: (run: readonly Act[], metadata: ActDeliveryMetadata) => void,
  /** Called when the resume point aged out of retention. */
  onAgedOut?: () => void
): ActStreamState {
  // Callback identity must not tear down a session/member connection.
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  const onAgedOutRef = useRef(onAgedOut);
  onAgedOutRef.current = onAgedOut;
  const [state, setState] = useState<ActStreamState>('live');

  useEffect(() => {
    if (!session || !member) {
      setState('live');
      return;
    }
    const feed = startActFeed({
      stream: (afterId, signal) =>
        storyClient.streamEvents({ session, member, afterId }, { signal }),
      get: (afterId, signal) =>
        storyClient.getStory(
          { session, member, afterId, limit: STORY_PAGE_LIMIT },
          { signal }
        ),
      onRun: (run, metadata) => onRunRef.current(run, metadata),
      onRestarted: () => onAgedOutRef.current?.(),
      onState: setState,
      retryDelayMs,
    });
    return () => feed.stop();
  }, [session, member]);

  return state;
}
