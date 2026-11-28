import {
  ClassCharacterModel,
  type ClassCharacterModelProps,
} from '@/components/hex-grid/ClassCharacterModel';
import { resolveNpcMaterialChannelTreatment } from '@/npc-appearances/npcAppearanceModel';
import type { MaterialChannelAdjustment } from '@/rendering/materialChannelTypes';
import { useWorldMaterialCatalog } from '@/rendering/useWorldMaterialCatalog';
import { useGLTF } from '@react-three/drei';
import type { WalkingReadiness } from './activityPlayback';
import type { ActivityCueRequest, NpcActivityProfile } from './activityTypes';

type Props = Omit<ClassCharacterModelProps, 'activity'> & {
  appearanceRef?: string;
  materialChannels?: readonly MaterialChannelAdjustment[];
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
  appearanceRef,
  materialChannels,
  profile,
  defaultActivityRef,
  activityCue,
  onActivityCueConsumed,
  moveSeq,
  onWalkingReadiness,
  ...props
}: Props) {
  // Keep this adapter's identity stable as intent changes. The one existing
  // catalog is read while mounted, not by inserting a new material/body owner.
  const catalog = useWorldMaterialCatalog();
  if (materialChannels?.length && catalog.status === 'loading') return null;
  const materialChannelTreatment =
    materialChannels === undefined
      ? props.materialChannelTreatment
      : resolveNpcMaterialChannelTreatment({
          appearanceRef,
          url: props.url,
          downed: props.isDownedVariant,
          catalog: catalog.catalog,
          adjustments: materialChannels,
        });
  const model = { ...props, materialChannelTreatment };
  return profile ? (
    <BoundActivityModel
      {...model}
      profile={profile}
      defaultActivityRef={defaultActivityRef}
      activityCue={activityCue}
      onActivityCueConsumed={onActivityCueConsumed}
      moveSeq={moveSeq}
      onWalkingReadiness={onWalkingReadiness}
    />
  ) : (
    <ClassCharacterModel {...model} />
  );
}
