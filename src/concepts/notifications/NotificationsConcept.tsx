import { StoryLog } from '@/components/session/combat-experience/StoryLog';
import { StoryNotices } from '@/components/session/combat-experience/StoryNotices';
import { actStoryId } from '@/components/session/combat-experience/actStory';
import type {
  CombatExperienceLogMode,
  CombatExperienceStoryExchange,
} from '@/components/session/combat-experience/types';
import { useCombatStoryPacing } from '@/components/session/combat-experience/useCombatStoryPacing';
import { useStoryNotices } from '@/components/session/combat-experience/useStoryNotices';
import { FeelDialsDrawer } from '@/feel/FeelDialsDrawer';
import { useDialValues } from '@/feel/dialStore';
import { create } from '@bufbuild/protobuf';
import {
  MemberKind,
  ParticipantSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useRef, useState } from 'react';
import { RECENT_IDENTITY_SAMPLES } from '../desktop-hotbar/recentStoryFixtures';
import { NOTIFICATION_SAMPLES } from './fixtures';

const monsters = ['skeleton-guard', 'zombie'].map((member) =>
  create(ParticipantSchema, {
    member,
    name: member === 'zombie' ? 'Zombie' : 'Skeleton guard',
    kind: MemberKind.MONSTER,
  })
);

export function NotificationsConcept() {
  const [story, setStory] = useState<CombatExperienceStoryExchange[]>([]);
  const [mode, setMode] = useState<CombatExperienceLogMode>('story');
  const sequence = useRef(0);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const pausePlayback = useDialValues().notificationPausePlayback === 'on';
  const pacing = useCombatStoryPacing({
    session: 'fixture',
    member: 'aldric',
    participants: monsters,
    story,
    paused: interacting && pausePlayback,
  });
  const notices = useStoryNotices({
    story: pacing.story,
    onInteractionChange: setInteracting,
    scope: 'notification-concept',
    enabled: true,
    streamState: 'live',
  });
  const release = (samples: CombatExperienceStoryExchange[], paced = false) => {
    const rows = samples.map((sample) => {
      const id = `notification-${++sequence.current}`;
      const event = sample.act ? { ...sample.act, id } : undefined;
      if (paced && event) pacing.acceptActs([event], { source: 'live' });
      return {
        ...sample,
        act: event,
        id: event ? actStoryId(event, 0) : id,
        toastRule: sample.toastRule,
        deliverySource: 'live' as const,
      };
    });
    setStory((current) => [...current, ...rows]);
  };
  return (
    <main className="p-4 text-slate-100">
      <h1 className="text-xl font-semibold">Activity notifications</h1>
      <p className="my-2 text-sm text-slate-300">
        Real game components, sample events. Dismissal and expiry leave Just
        happened intact.
      </p>
      <div className="flex flex-wrap gap-2 my-4">
        {Object.entries(NOTIFICATION_SAMPLES).map(([name, sample]) => (
          <button
            className="rounded border border-slate-500 px-3 py-2"
            key={name}
            onClick={() => release([sample])}
          >
            {name}
          </button>
        ))}
        <button
          className="rounded border border-slate-500 px-3 py-2"
          onClick={() =>
            release([
              ...Object.values(NOTIFICATION_SAMPLES),
              NOTIFICATION_SAMPLES.attack,
              NOTIFICATION_SAMPLES.speech,
            ])
          }
        >
          Burst of five
        </button>
        <button
          className="rounded border border-slate-500 px-3 py-2"
          onClick={() =>
            release(
              RECENT_IDENTITY_SAMPLES.filter(
                (row) =>
                  row.act?.body.case === 'attack' &&
                  ['skeleton-guard', 'zombie'].includes(
                    row.act.body.value.by?.id ?? ''
                  )
              ),
              true
            )
          }
        >
          Monster playback
        </button>
        <button
          className="rounded border border-slate-500 px-3 py-2"
          onClick={() => setControlsOpen(true)}
        >
          Controls
        </button>
      </div>
      <p className="text-xs text-slate-400">
        Bonus names are rendered from sourced roll facts, not client-side game
        calculations.
      </p>
      <p role="status" className="text-sm my-2">
        {interacting && pausePlayback
          ? 'Playback paused while reading'
          : (pacing.notice ?? 'Playback ready')}
      </p>
      <FeelDialsDrawer
        open={controlsOpen}
        onClose={() => setControlsOpen(false)}
      />
      <div
        style={{
          position: 'relative',
          height: 650,
          marginTop: 16,
          background: 'radial-gradient(ellipse at center, #273a37, #0e171c)',
          overflow: 'hidden',
          borderRadius: 12,
        }}
      >
        <StoryNotices entries={notices} />
        <StoryLog
          story={pacing.story}
          mode={mode}
          onModeChange={setMode}
          streamState="live"
          compactPreview
          initialCollapsed
          announceUpdates={false}
        />
      </div>
    </main>
  );
}
