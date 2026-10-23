import {
  ClassCharacterModel,
  type OutfitTreatmentStatus,
} from '@/components/hex-grid/ClassCharacterModel';
import type { SkinnedAccessoryStatus } from '@/components/hex-grid/SkinnedAccessoryAttachment';
import {
  ThumbnailRenderer,
  type ThumbnailRendererProps,
} from '@/compositions/CompositionThumbnailRenderer';
import { useCallback, useState } from 'react';
import type { PortraitSource } from './portraitSource';

export interface PortraitCaptureProps extends Pick<
  ThumbnailRendererProps,
  'onComplete' | 'onError' | 'onRootError'
> {
  source: PortraitSource;
}

/** One exact appearance capture. A new source resets all attachment readiness. */
export function PortraitCapture(props: PortraitCaptureProps) {
  return <PortraitCaptureRequest key={props.source.key} {...props} />;
}

function PortraitCaptureRequest({
  source,
  onComplete,
  onError,
  onRootError,
}: PortraitCaptureProps) {
  const [attached, setAttached] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [outfitReady, setOutfitReady] = useState(!source.outfit);
  const [failed, setFailed] = useState(false);
  const fail = useCallback(
    (message: string) => {
      setFailed(true);
      onError(source.key, message);
    },
    [onError, source.key]
  );
  const accessoryStatus = useCallback(
    (status: SkinnedAccessoryStatus) => {
      if (status.code === 'none') return;
      const expected = source.accessories.find(
        (a) =>
          a.slot === status.slot &&
          a.styleRef === status.styleRef &&
          a.url === status.url
      );
      if (!expected) return;
      if (status.code === 'rejected') {
        fail(status.message);
        return;
      }
      setAttached((previous) => {
        if (status.code === 'attached' && !previous.has(status.slot))
          return new Set([...previous, status.slot]);
        if (status.code === 'loading' && previous.has(status.slot)) {
          const next = new Set(previous);
          next.delete(status.slot);
          return next;
        }
        return previous;
      });
    },
    [fail, source.accessories]
  );
  const outfitStatus = useCallback(
    (status: OutfitTreatmentStatus) => {
      if (status.profileKey !== source.outfit?.profileKey) return;
      if (status.code === 'rejected') {
        fail(status.message);
        return;
      }
      setOutfitReady(true);
    },
    [fail, source.outfit?.profileKey]
  );
  const ready =
    !failed &&
    outfitReady &&
    source.accessories.every((a) => attached.has(a.slot));
  return (
    <ThumbnailRenderer
      requestKey={source.key}
      fitBounds={false}
      ready={ready}
      onComplete={onComplete}
      onError={onError}
      onRootError={onRootError}
    >
      <ClassCharacterModel
        url={source.url}
        facingRotation={source.facingRotation}
        isMoving={false}
        isDownedVariant={false}
        accessories={source.accessories}
        outfit={source.outfit}
        onAccessoryStatus={accessoryStatus}
        onOutfitStatus={outfitStatus}
      />
    </ThumbnailRenderer>
  );
}
