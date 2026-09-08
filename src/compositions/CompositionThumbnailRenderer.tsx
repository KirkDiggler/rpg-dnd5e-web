import type { Composition } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { Bounds } from '@react-three/drei';
import {
  createRoot,
  extend,
  useFrame,
  useThree,
  type Catalogue,
  type ReconcilerRoot,
} from '@react-three/fiber';
import { FiberProvider, useContextBridge } from 'its-fine';
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import { CompositionModel } from './CompositionModel';

interface CaptureBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  onError: (error: Error) => void;
}

interface CaptureBoundaryState {
  failed: boolean;
}

/** Error boundaries are needed inside the R3F root for both the whole surface
 * and the current scene request. Renderer setup failures are observed where
 * createRoot/configure are owned below, before an R3F React tree exists. */
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

function ResetCaptureCamera() {
  const { camera } = useThree();

  useLayoutEffect(() => {
    camera.position.set(2, 1.6, 2.6);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

interface ThumbnailCaptureRequestProps {
  children: ReactNode;
  requestKey: string;
  onComplete: (requestKey: string, image: string) => void;
  onError: (requestKey: string, message: string) => void;
}

/** Keyed per request while the surrounding Canvas is reused for the batch. */
function ThumbnailCaptureRequest({
  children,
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
        <ResetCaptureCamera />
        <Bounds fit clip margin={1.35} maxDuration={0}>
          {/* GLTF loader caches are shared with placed models. Prevent this
              temporary root from disposing their shared resources. */}
          <group dispose={null}>{children}</group>
        </Bounds>
        <CaptureFrame onCapture={complete} onError={fail} />
      </Suspense>
    </CaptureBoundary>
  );
}

interface ThumbnailRootProps {
  children: ReactNode;
  onError: (error: unknown) => void;
}

/** A deliberately small R3F lifecycle owner so configure failures are part of
 * this component's observed promise chain instead of Canvas's fire-and-forget
 * setup. It retains Canvas's THREE catalogue and React-context bridge. */
function ThumbnailRoot({ children, onError }: ThumbnailRootProps) {
  return (
    <FiberProvider>
      <ThumbnailRootLifecycle onError={onError}>
        {children}
      </ThumbnailRootLifecycle>
    </FiberProvider>
  );
}

function ThumbnailRootLifecycle({ children, onError }: ThumbnailRootProps) {
  useMemo(() => extend(THREE as unknown as Catalogue), []);
  const ContextBridge = useContextBridge();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<ReconcilerRoot<HTMLCanvasElement> | null>(null);
  const configuredRootRef = useRef<ReconcilerRoot<HTMLCanvasElement> | null>(
    null
  );
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const failed = useRef(false);
  const pendingDisposal = useRef<{ cancelled: boolean } | null>(null);

  const reportError = useCallback((error: unknown) => {
    if (failed.current) return;
    failed.current = true;
    onErrorRef.current(error);
  }, []);

  const scene = useMemo(
    () => (
      <ContextBridge>
        <CaptureBoundary fallback={null} onError={reportError}>
          {children}
        </CaptureBoundary>
      </ContextBridge>
    ),
    [ContextBridge, children, reportError]
  );
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (pendingDisposal.current) pendingDisposal.current.cancelled = true;
    pendingDisposal.current = null;
    let disposed = false;
    let root: ReconcilerRoot<HTMLCanvasElement> | null = null;
    try {
      root = rootRef.current ?? createRoot(canvas);
      rootRef.current = root;
      const setup = root.configure({
        camera: { fov: 32, position: [2, 1.6, 2.6] },
        dpr: 1,
        frameloop: 'demand',
        gl: { alpha: false, antialias: true, preserveDrawingBuffer: true },
        size: { width: 128, height: 128, top: 0, left: 0 },
      });
      void setup.then(
        (configuredRoot) => {
          if (disposed || failed.current) return;
          configuredRootRef.current = configuredRoot;
          try {
            configuredRoot.render(sceneRef.current);
          } catch (error) {
            reportError(error);
          }
        },
        (error) => {
          if (!disposed) reportError(error);
        }
      );
    } catch (error) {
      reportError(error);
    }

    return () => {
      disposed = true;
      configuredRootRef.current = null;
      // React StrictMode immediately replays layout effects. Delay disposal one
      // microtask so that replay can retain this one surface, while a real
      // unmount still tears it down before any stale setup can render.
      const disposal = { cancelled: false };
      pendingDisposal.current = disposal;
      queueMicrotask(() => {
        if (!disposal.cancelled) root?.unmount();
      });
    };
  }, [reportError]);

  useLayoutEffect(() => {
    const root = configuredRootRef.current;
    if (!root || failed.current) return;
    try {
      root.render(scene);
    } catch (error) {
      reportError(error);
    }
  }, [reportError, scene]);

  return (
    <canvas
      ref={canvasRef}
      width={128}
      height={128}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  );
}

export interface ThumbnailRendererProps {
  children: ReactNode;
  requestKey: string;
  onComplete: (requestKey: string, image: string) => void;
  onError: (requestKey: string, message: string) => void;
  onRootError: (message: string) => void;
}

/**
 * One temporary, reusable WebGL surface for a palette's serial thumbnail
 * batch. It auto-frames one real model subtree, captures a data URL, and is
 * replaced by the next immutable request without replacing the canvas. No
 * canvas remains mounted once the caller's queue is complete.
 */
export function ThumbnailRenderer({
  children,
  requestKey,
  onComplete,
  onError,
  onRootError,
}: ThumbnailRendererProps) {
  const reportRootError = useCallback(
    (error: unknown) =>
      onRootError(error instanceof Error ? error.message : String(error)),
    [onRootError]
  );

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
      <ThumbnailRoot onError={reportRootError}>
        <color attach="background" args={['#14110f']} />
        <ambientLight intensity={1} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} />
        <directionalLight position={[-4, 2, -3]} intensity={0.5} />
        <ThumbnailCaptureRequest
          key={requestKey}
          requestKey={requestKey}
          onComplete={onComplete}
          onError={onError}
        >
          {children}
        </ThumbnailCaptureRequest>
      </ThumbnailRoot>
    </div>
  );
}

export interface CompositionThumbnailRendererProps extends Omit<
  ThumbnailRendererProps,
  'children'
> {
  composition: Composition;
}

/** Composition behavior remains a thin specialization over the shared capture
 * surface and lifecycle. */
export function CompositionThumbnailRenderer({
  composition,
  ...captureProps
}: CompositionThumbnailRendererProps) {
  return (
    <ThumbnailRenderer {...captureProps}>
      <CompositionModel
        composition={composition}
        instanceId={`thumbnail-${composition.id}`}
        transform={{ x: 0, y: 0, z: 0, rotationY: 0 }}
      />
    </ThumbnailRenderer>
  );
}
