import type { Composition } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { Bounds } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { CompositionModel } from './CompositionModel';

interface CaptureBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  onError: (error: Error) => void;
}

interface CaptureBoundaryState {
  failed: boolean;
}

/** Error boundaries are needed on both sides of the R3F root: one for scene
 * loading/rendering and one for WebGL-root creation itself. */
class CaptureBoundary extends Component<
  CaptureBoundaryProps,
  CaptureBoundaryState
> {
  state: CaptureBoundaryState = { failed: false };

  static getDerivedStateFromError(): CaptureBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function CaptureFrame({
  onCapture,
  onError,
}: {
  onCapture: (image: string) => void;
  onError: (error: unknown) => void;
}) {
  const { camera, gl, invalidate, scene } = useThree();
  const frames = useRef(0);
  const captured = useRef(false);

  useEffect(() => {
    invalidate();
  }, [invalidate]);

  useFrame(() => {
    if (captured.current) return;
    frames.current += 1;
    // Bounds fits during layout. Give the fitted camera and loaded materials an
    // additional frame before reading the preserved drawing buffer.
    if (frames.current < 3) {
      invalidate();
      return;
    }
    try {
      gl.render(scene, camera);
      const image = gl.domElement.toDataURL('image/png');
      if (!image.startsWith('data:image/png')) {
        throw new Error('The thumbnail canvas did not produce a PNG image.');
      }
      captured.current = true;
      onCapture(image);
    } catch (error) {
      captured.current = true;
      onError(error);
    }
  });

  return null;
}

interface ThumbnailCaptureRequestProps {
  composition: Composition;
  requestKey: string;
  onComplete: (requestKey: string, image: string) => void;
  onError: (requestKey: string, message: string) => void;
}

/** Keyed per request while the surrounding Canvas is reused for the batch. */
function ThumbnailCaptureRequest({
  composition,
  requestKey,
  onComplete,
  onError,
}: ThumbnailCaptureRequestProps) {
  const settled = useRef(false);
  const fail = useCallback(
    (error: unknown) => {
      if (settled.current) return;
      settled.current = true;
      onError(
        requestKey,
        error instanceof Error ? error.message : String(error)
      );
    },
    [onError, requestKey]
  );
  const complete = useCallback(
    (image: string) => {
      if (settled.current) return;
      settled.current = true;
      onComplete(requestKey, image);
    },
    [onComplete, requestKey]
  );

  useEffect(() => {
    const timeout = window.setTimeout(
      () => fail(new Error('Thumbnail rendering timed out.')),
      20_000
    );
    return () => window.clearTimeout(timeout);
  }, [fail]);

  return (
    <CaptureBoundary fallback={<group />} onError={fail}>
      <Suspense fallback={null}>
        <Bounds fit clip margin={1.35}>
          <CompositionModel
            composition={composition}
            instanceId={`thumbnail-${composition.id}`}
            transform={{ x: 0, y: 0, z: 0, rotationY: 0 }}
          />
        </Bounds>
        <CaptureFrame onCapture={complete} onError={fail} />
      </Suspense>
    </CaptureBoundary>
  );
}

export interface CompositionThumbnailRendererProps {
  composition: Composition;
  requestKey: string;
  onComplete: (requestKey: string, image: string) => void;
  onError: (requestKey: string, message: string) => void;
}

/**
 * One temporary, reusable WebGL surface for the palette's serial thumbnail
 * batch. It renders the real CompositionModel, auto-frames all of its leaves,
 * captures a data URL, and is replaced by the next requested immutable
 * snapshot. No canvas remains mounted once the batch is complete.
 */
export function CompositionThumbnailRenderer({
  composition,
  requestKey,
  onComplete,
  onError,
}: CompositionThumbnailRendererProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: '-10000px',
        top: 0,
        width: 128,
        height: 128,
        pointerEvents: 'none',
      }}
    >
      <CaptureBoundary
        fallback={null}
        onError={(error) => onError(requestKey, error.message)}
      >
        <Canvas
          camera={{ fov: 32, position: [2, 1.6, 2.6] }}
          dpr={1}
          frameloop="demand"
          gl={{ alpha: false, antialias: true, preserveDrawingBuffer: true }}
        >
          <color attach="background" args={['#14110f']} />
          <ambientLight intensity={1} />
          <directionalLight position={[3, 5, 4]} intensity={1.2} />
          <directionalLight position={[-4, 2, -3]} intensity={0.5} />
          <ThumbnailCaptureRequest
            key={requestKey}
            composition={composition}
            requestKey={requestKey}
            onComplete={onComplete}
            onError={onError}
          />
        </Canvas>
      </CaptureBoundary>
    </div>
  );
}
