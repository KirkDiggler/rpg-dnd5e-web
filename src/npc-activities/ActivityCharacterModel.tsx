import {
  ClassCharacterModel,
  type ClassCharacterModelProps,
} from '@/components/hex-grid/ClassCharacterModel';
import { useGLTF } from '@react-three/drei';
import type { WalkingReadiness } from './activityPlayback';
import type { ActivityCueRequest, NpcActivityProfile } from './activityTypes';

type Props = Omit<ClassCharacterModelProps, 'activity'> & {
  profile?: NpcActivityProfile;
  defaultActivityRef?: string;
  activityCue?: ActivityCueRequest;
  onActivityCueConsumed?: (id: string) => void;
  moveSeq?: number;
  onWalkingReadiness?: (value: WalkingReadiness) => void;
};
const ignoreReadiness = () => {};

function BoundActivityModel({
  profile,
  defaultActivityRef,
  activityCue,
  onActivityCueConsumed,
  moveSeq,
  onWalkingReadiness,
  ...props
}: Props & { profile: NpcActivityProfile }) {
  const { animations } = useGLTF(profile.library.url);
  return (
    <ClassCharacterModel
      {...props}
      activity={{
        profile,
        clips: animations,
        defaultActivityRef,
        cue: activityCue,
        consumed: onActivityCueConsumed,
        moveSeq,
        ready: onWalkingReadiness ?? ignoreReadiness,
      }}
    />
  );
}

/** Library loading stays inside the body's existing suspense/error boundary. */
export function ActivityCharacterModel({
  profile,
  defaultActivityRef,
  activityCue,
  onActivityCueConsumed,
  moveSeq,
  onWalkingReadiness,
  ...props
}: Props) {
  return profile ? (
    <BoundActivityModel
      {...props}
      profile={profile}
      defaultActivityRef={defaultActivityRef}
      activityCue={activityCue}
      onActivityCueConsumed={onActivityCueConsumed}
      moveSeq={moveSeq}
      onWalkingReadiness={onWalkingReadiness}
    />
  ) : (
    <ClassCharacterModel {...props} />
  );
}
