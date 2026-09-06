import { ErrorBoundary } from '@/components/ui/Feedback/ErrorBoundary';
import type { WorldTransform } from '@/concepts/world-building/types';
import type { Composition } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { Suspense, useEffect, useState } from 'react';
import { CompositionModel } from './CompositionModel';
import type { CompositionSource } from './compositionSource';

type Resolution =
  | { source: CompositionSource | undefined; id: string; status: 'loading' }
  | {
      source: CompositionSource | undefined;
      id: string;
      status: 'ready';
      composition: Composition;
    }
  | {
      source: CompositionSource | undefined;
      id: string;
      status: 'missing' | 'error';
      message: string;
    };

function PlacementMarker({
  instanceId,
  transform,
  status,
  message,
}: {
  instanceId: string;
  transform: WorldTransform;
  status: 'missing-source' | 'loading' | 'missing' | 'error';
  message?: string;
}) {
  const color = status === 'loading' ? '#ca8a04' : '#dc2626';
  return (
    <group
      name={`composition-${status}-${instanceId || 'unnamed'}`}
      position={[transform.x, transform.y, transform.z]}
      rotation={[0, transform.rotationY, 0]}
      userData={{ compositionStatus: status, compositionMessage: message }}
    >
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.65, 1, 0.65]} />
        <meshStandardMaterial color={color} wireframe />
      </mesh>
    </group>
  );
}

export interface CompositionPlacementModelProps {
  compositionId: string;
  instanceId: string;
  transform: WorldTransform;
  source?: CompositionSource;
}

/** Resolve and render one placement without sharing loading/error state. */
export function CompositionPlacementModel({
  compositionId,
  instanceId,
  transform,
  source,
}: CompositionPlacementModelProps) {
  const [resolution, setResolution] = useState<Resolution>({
    source,
    id: compositionId,
    status: 'loading',
  });

  useEffect(() => {
    if (!source) return;
    let current = true;
    setResolution({ source, id: compositionId, status: 'loading' });
    void source.reader.getComposition(source.worldId, compositionId).then(
      (composition) => {
        if (!current) return;
        if (!composition) {
          setResolution({
            source,
            id: compositionId,
            status: 'missing',
            message: `Composition ${compositionId} was not found in world ${source.worldId}.`,
          });
          return;
        }
        if (
          composition.id !== compositionId ||
          composition.worldId !== source.worldId
        ) {
          setResolution({
            source,
            id: compositionId,
            status: 'error',
            message: `Composition reader returned ${composition.worldId}/${composition.id} for ${source.worldId}/${compositionId}.`,
          });
          return;
        }
        setResolution({
          source,
          id: compositionId,
          status: 'ready',
          composition,
        });
      },
      (error: unknown) => {
        if (!current) return;
        setResolution({
          source,
          id: compositionId,
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    );
    return () => {
      current = false;
    };
  }, [compositionId, source]);

  if (!instanceId) {
    return (
      <PlacementMarker
        instanceId="unnamed"
        transform={transform}
        status="error"
        message="Composition placement is missing its required instance id."
      />
    );
  }
  if (!source) {
    return (
      <PlacementMarker
        instanceId={instanceId}
        transform={transform}
        status="missing-source"
        message="No world-scoped composition source was provided."
      />
    );
  }

  const current =
    resolution.source === source && resolution.id === compositionId
      ? resolution
      : ({ source, id: compositionId, status: 'loading' } as const);
  if (current.status !== 'ready') {
    return (
      <PlacementMarker
        instanceId={instanceId}
        transform={transform}
        status={current.status}
        message={'message' in current ? current.message : undefined}
      />
    );
  }

  const loading = (
    <PlacementMarker
      instanceId={instanceId}
      transform={transform}
      status="loading"
    />
  );
  const failed = (
    <PlacementMarker
      instanceId={instanceId}
      transform={transform}
      status="error"
      message={`Composition ${compositionId} could not be rendered.`}
    />
  );
  return (
    <Suspense fallback={loading}>
      <ErrorBoundary fallback={failed}>
        <CompositionModel
          composition={current.composition}
          instanceId={instanceId}
          transform={transform}
        />
      </ErrorBoundary>
    </Suspense>
  );
}
