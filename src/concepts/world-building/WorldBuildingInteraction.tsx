import { TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import * as THREE from 'three';
import type { TransformControls as TransformControlsImpl } from 'three-stdlib';
import { previewSelectionTransform, selectionPivot } from './sceneState';
import { validateScene } from './serialization';
import type { WorldScene } from './types';
import {
  readWorldBuildingDragPayload,
  type WorldBuildingDragPayload,
} from './worldBuildingDrag';
import {
  dropTargetFromIntersections,
  type WorldBuildingDropTarget,
} from './worldBuildingPointer';

export type WorldBuildingTool = 'select' | 'move' | 'rotate';

interface WorldBuildingDropInteractionProps {
  activeDrag: WorldBuildingDragPayload | null;
  floorY: number;
  onDrop: (
    payload: WorldBuildingDragPayload,
    target: WorldBuildingDropTarget
  ) => void;
  onDragFinished: () => void;
}

export function WorldBuildingDropInteraction({
  activeDrag,
  floorY,
  onDrop,
  onDragFinished,
}: WorldBuildingDropInteractionProps) {
  const { camera, gl, scene } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointer = useMemo(() => new THREE.Vector2(), []);
  const [preview, setPreview] = useState<WorldBuildingDropTarget | null>(null);

  const targetAt = useCallback(
    (event: DragEvent, payload: WorldBuildingDragPayload) => {
      const rect = gl.domElement.getBoundingClientRect();
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        return null;
      }
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      return dropTargetFromIntersections(
        payload,
        raycaster.intersectObjects(scene.children, true),
        floorY
      );
    },
    [camera, floorY, gl.domElement, pointer, raycaster, scene.children]
  );

  useEffect(() => {
    const element = gl.domElement;
    const handleDragOver = (event: DragEvent) => {
      if (!activeDrag) {
        setPreview(null);
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setPreview(targetAt(event, activeDrag));
    };
    const handleDragLeave = (event: DragEvent) => {
      if (
        !event.relatedTarget ||
        !element.contains(event.relatedTarget as Node)
      ) {
        setPreview(null);
      }
    };
    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      const payload = readWorldBuildingDragPayload(event.dataTransfer);
      const target = payload ? targetAt(event, payload) : null;
      setPreview(null);
      onDragFinished();
      if (payload && target) onDrop(payload, target);
    };
    element.addEventListener('dragover', handleDragOver);
    element.addEventListener('dragleave', handleDragLeave);
    element.addEventListener('drop', handleDrop);
    return () => {
      element.removeEventListener('dragover', handleDragOver);
      element.removeEventListener('dragleave', handleDragLeave);
      element.removeEventListener('drop', handleDrop);
    };
  }, [activeDrag, gl.domElement, onDragFinished, onDrop, targetAt]);

  if (!preview) return null;
  const position: [number, number, number] =
    preview.kind === 'surface'
      ? [preview.point.x, preview.point.y + floorY + 0.035, preview.point.z]
      : [preview.point.x, floorY + 0.035, preview.point.z];
  return (
    <group position={position} raycast={() => null}>
      <mesh
        name="world-building-drop-preview"
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => null}
      >
        <ringGeometry args={[0.18, 0.3, 32]} />
        <meshBasicMaterial
          color="#5eead4"
          transparent
          opacity={0.82}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0.15, 0]} raycast={() => null}>
        <coneGeometry args={[0.08, 0.24, 16]} />
        <meshBasicMaterial
          color="#f8d577"
          transparent
          opacity={0.78}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

interface MutableControlState {
  axis: string | null;
  dragging: boolean;
}

const mutableControlState = (
  controls: TransformControlsImpl
): MutableControlState => controls as unknown as MutableControlState;

interface DragStart {
  scene: WorldScene;
  pivot: { x: number; y: number; z: number };
}

interface WorldBuildingTransformGizmoProps {
  controlsRef: RefObject<TransformControlsImpl | null>;
  scene: WorldScene;
  selectedIds: readonly string[];
  tool: WorldBuildingTool;
  onPreview: (scene: WorldScene | null) => void;
  onCommit: (scene: WorldScene) => void;
  onReject: (message: string) => void;
  onTransformingChange: (transforming: boolean) => void;
}

export function WorldBuildingTransformGizmo({
  controlsRef,
  scene,
  selectedIds,
  tool,
  onPreview,
  onCommit,
  onReject,
  onTransformingChange,
}: WorldBuildingTransformGizmoProps) {
  const { gl } = useThree();
  const proxyRef = useRef<THREE.Group>(null);
  const dragStartRef = useRef<DragStart | null>(null);
  const latestScene = useRef(scene);
  const latestSelection = useRef(selectedIds);
  const latestTool = useRef(tool);
  latestScene.current = scene;
  latestSelection.current = selectedIds;
  latestTool.current = tool;

  const reflectControlState = useCallback(() => {
    const controls = controlsRef.current;
    const state = controls ? mutableControlState(controls) : null;
    gl.domElement.dataset.worldBuildingGizmoAxis = state?.axis ?? '';
    gl.domElement.dataset.worldBuildingTransform = dragStartRef.current
      ? 'previewing'
      : 'idle';
  }, [controlsRef, gl.domElement]);

  const syncProxy = useCallback(() => {
    const proxy = proxyRef.current;
    const pivot = selectionPivot(latestScene.current, latestSelection.current);
    if (!proxy || !pivot) return;
    proxy.position.set(pivot.x, pivot.y, pivot.z);
    proxy.rotation.set(0, 0, 0);
    proxy.scale.set(1, 1, 1);
    proxy.updateMatrixWorld();
  }, []);

  const currentPreview = useCallback((): WorldScene | null => {
    const start = dragStartRef.current;
    const proxy = proxyRef.current;
    if (!start || !proxy || latestTool.current === 'select') return null;
    return previewSelectionTransform(
      start.scene,
      latestSelection.current,
      latestTool.current,
      {
        x: proxy.position.x - start.pivot.x,
        y: proxy.position.y - start.pivot.y,
        z: proxy.position.z - start.pivot.z,
        rotationY: proxy.rotation.y,
      }
    );
  }, []);

  const finishControlState = useCallback(() => {
    const controls = controlsRef.current;
    if (controls) {
      const state = mutableControlState(controls);
      state.dragging = false;
      state.axis = null;
    }
    onTransformingChange(false);
    reflectControlState();
  }, [controlsRef, onTransformingChange, reflectControlState]);

  const cancel = useCallback(() => {
    if (!dragStartRef.current) return;
    dragStartRef.current = null;
    finishControlState();
    syncProxy();
    onPreview(null);
  }, [finishControlState, onPreview, syncProxy]);

  const begin = useCallback(() => {
    const pivot = selectionPivot(latestScene.current, latestSelection.current);
    if (!pivot || latestTool.current === 'select') return;
    dragStartRef.current = {
      scene: latestScene.current,
      pivot: { x: pivot.x, y: pivot.y, z: pivot.z },
    };
    onTransformingChange(true);
    reflectControlState();
  }, [onTransformingChange, reflectControlState]);

  const change = useCallback(() => {
    if (!dragStartRef.current) return;
    const preview = currentPreview();
    if (preview) onPreview(preview);
  }, [currentPreview, onPreview]);

  const commit = useCallback(() => {
    if (!dragStartRef.current) return;
    const start = dragStartRef.current;
    const next = currentPreview();
    dragStartRef.current = null;
    finishControlState();
    onPreview(null);
    syncProxy();
    if (!next || JSON.stringify(next) === JSON.stringify(start.scene)) return;
    try {
      onCommit(validateScene(next));
    } catch (error) {
      onReject(
        `Transform rejected; drag-start positions were restored. ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }, [
    currentPreview,
    finishControlState,
    onCommit,
    onPreview,
    onReject,
    syncProxy,
  ]);

  useEffect(() => {
    if (dragStartRef.current) cancel();
    syncProxy();
  }, [cancel, scene, selectedIds, syncProxy, tool]);

  useEffect(() => {
    const element = gl.domElement;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dragStartRef.current) {
        event.preventDefault();
        cancel();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button === 2 && dragStartRef.current) {
        event.preventDefault();
        cancel();
      }
    };
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (dragStartRef.current) cancel();
    };
    const handleAbandon = () => cancel();
    const handleLostCapture = () => {
      // OrbitControls releases its canvas capture during every normal pointerup
      // before TransformControls' document-level pointerup listener commits.
      // Defer the abandonment check so a normal release wins; a genuinely lost
      // capture still cancels the transaction in the same task turn.
      queueMicrotask(cancel);
    };
    window.addEventListener('keydown', handleKey, true);
    element.addEventListener('pointerdown', handlePointerDown, true);
    element.addEventListener('contextmenu', handleContextMenu);
    element.addEventListener('pointercancel', handleAbandon);
    element.addEventListener('lostpointercapture', handleLostCapture);
    return () => {
      window.removeEventListener('keydown', handleKey, true);
      element.removeEventListener('pointerdown', handlePointerDown, true);
      element.removeEventListener('contextmenu', handleContextMenu);
      element.removeEventListener('pointercancel', handleAbandon);
      element.removeEventListener('lostpointercapture', handleLostCapture);
      if (dragStartRef.current) {
        dragStartRef.current = null;
        onPreview(null);
        onTransformingChange(false);
      }
    };
  }, [cancel, gl.domElement, onPreview, onTransformingChange]);

  const pivot = selectionPivot(scene, selectedIds);
  const visible = tool !== 'select' && !!pivot;
  return (
    <>
      <group
        ref={proxyRef}
        name="world-building-selection-pivot"
        position={pivot ? [pivot.x, pivot.y, pivot.z] : [0, 0, 0]}
      />
      {visible && (
        <TransformControls
          ref={controlsRef}
          object={proxyRef as unknown as RefObject<THREE.Object3D>}
          enabled
          mode={tool === 'move' ? 'translate' : 'rotate'}
          space="world"
          size={0.86}
          showX={tool === 'move'}
          showY
          showZ={tool === 'move'}
          onChange={reflectControlState}
          onMouseDown={begin}
          onObjectChange={change}
          onMouseUp={commit}
        />
      )}
    </>
  );
}
