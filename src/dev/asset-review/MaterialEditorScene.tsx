import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { OrbitControls, OrthographicCamera } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SceneErrorBoundary } from '../prop-calibration/SceneErrorBoundary';
import {
  centeredFloorOffset,
  type SimpleBounds,
  type Vec3,
} from '../prop-calibration/previewTransform';
import { disposeObjectResources } from './disposeObjectResources';
import { type EditorSource, type RecipeChannels } from './materialRecipe';
import type { AssetReviewLoadStatus } from './model';
import {
  applyChannels,
  applySlotBindings,
  applyTextureError,
  ImageTextureFactory,
  type ChannelTextures,
  type GltfLike,
} from './slotMaterials';

export type TextureLoadStatus = 'loading' | 'success' | 'error';

export interface SlotVisualState {
  channels: RecipeChannels;
  /** Browser-loadable URL per channel (inventory original or derivative). */
  urls: {
    baseColor: string | null;
    normal: string | null;
    emissive: string | null;
  };
}

export interface MaterialEditorSceneProps {
  source: EditorSource;
  /** Editing state per slot, keyed by slotKey(sourcePath, objectName, slot). */
  slots: Record<string, SlotVisualState>;
  onLoadStateChange: (
    url: string,
    status: AssetReviewLoadStatus,
    detail?: string
  ) => void;
  onTextureStateChange: (
    key: string,
    status: TextureLoadStatus,
    detail?: string
  ) => void;
}

function boundsFor(object: THREE.Object3D): SimpleBounds {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object, true);
  return {
    min: box.min.toArray() as Vec3,
    max: box.max.toArray() as Vec3,
  };
}

const textureFactory = new ImageTextureFactory(
  (url) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Image failed to load: ${url}`));
      image.src = url;
    })
);

function textureStatusKey(slot: string, channel: string): string {
  return `${slot}\u0000${channel}`;
}

/**
 * Owns one slot's cloned material and its textures: loads channel images,
 * applies real channel numbers, and reports per-channel load state. Texture
 * instances are created per use and disposed on replacement/unmount, so one
 * image used in different channels is never mutated through a shared copy.
 */
function SlotMaterialController({
  slot,
  material,
  visual,
  onTextureStateChange,
}: {
  slot: string;
  material: THREE.MeshStandardMaterial;
  visual: SlotVisualState;
  onTextureStateChange: MaterialEditorSceneProps['onTextureStateChange'];
}) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    let active = true;
    const created: THREE.Texture[] = [];
    const { channels, urls } = visual;
    const plan: {
      channel: 'baseColor' | 'normal' | 'emissive';
      url: string | null;
      needed: boolean;
    }[] = [
      {
        channel: 'baseColor',
        url: urls.baseColor,
        needed: channels.baseColor !== null,
      },
      { channel: 'normal', url: urls.normal, needed: channels.normal !== null },
      {
        channel: 'emissive',
        url: urls.emissive,
        needed: channels.emissive?.image != null,
      },
    ];
    for (const item of plan) {
      if (!item.needed) continue;
      if (!item.url) {
        // A requested image the inventory cannot serve fails loudly instead of
        // rendering as an untextured success.
        onTextureStateChange(
          textureStatusKey(slot, item.channel),
          'error',
          'Image is missing from the prepared inventory'
        );
        applyTextureError(material);
        invalidate();
        continue;
      }
      onTextureStateChange(textureStatusKey(slot, item.channel), 'loading');
    }
    const textures: ChannelTextures = {
      baseColor: null,
      normal: null,
      emissive: null,
    };
    void (async () => {
      try {
        for (const item of plan) {
          if (!item.needed || !item.url) continue;
          const { texture, release } = await textureFactory.texture(item.url);
          if (!active) {
            release();
            return;
          }
          created.push(texture);
          textures[item.channel] = texture;
          onTextureStateChange(textureStatusKey(slot, item.channel), 'success');
        }
        if (active) {
          applyChannels(material, channels, textures);
          invalidate();
        }
      } catch (cause: unknown) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        const failed = plan.find(
          (item) => item.needed && item.url && !textures[item.channel]
        );
        if (active && failed) {
          onTextureStateChange(
            textureStatusKey(slot, failed.channel),
            'error',
            detail
          );
          // A failed image must never masquerade as a successful white material.
          applyTextureError(material);
          invalidate();
        }
      }
    })();
    return () => {
      active = false;
      created.forEach((texture) => texture.dispose());
    };
  }, [material, onTextureStateChange, slot, visual, invalidate]);
  return null;
}

function EditorModel({
  gltf,
  source,
  slots,
  onTextureStateChange,
}: {
  gltf: GltfLike;
  source: EditorSource;
  slots: Record<string, SlotVisualState>;
  onTextureStateChange: MaterialEditorSceneProps['onTextureStateChange'];
}) {
  // Clone before any material assignment: edits stay out of cached scenes.
  // The bindings are then resolved against this rendered clone so assigned
  // slot materials are the ones actually on screen.
  const root = useMemo(() => gltf.scene.clone(true), [gltf]);
  const { bindings, problems } = useMemo(
    () => applySlotBindings(root, gltf, source),
    [root, gltf, source]
  );
  const bounds = useMemo(() => boundsFor(root), [root]);
  const offset = centeredFloorOffset(bounds, SYNTY_SCALE, [0, 0, 0]);
  if (problems.length)
    return (
      <div className="material-editor-scene-error" role="alert">
        Prepared target mapping failed to resolve:
        <ul>
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <>
      <group
        position={[offset[0], offset[1] + DUNGEON_SURFACE_Y, offset[2]]}
        scale={SYNTY_SCALE}
      >
        <primitive object={root} dispose={null} />
      </group>
      {[...bindings.entries()].map(([slot, binding]) => {
        const visual = slots[slot];
        if (!visual) return null;
        return (
          <SlotMaterialController
            key={slot}
            slot={slot}
            material={binding.material}
            visual={visual}
            onTextureStateChange={onTextureStateChange}
          />
        );
      })}
    </>
  );
}

function EditorWorld(
  props: Omit<MaterialEditorSceneProps, 'onLoadStateChange' | 'url'> & {
    gltf?: GltfLike;
  }
) {
  return (
    <>
      <color attach="background" args={['#101719']} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[4, 7, 5]} intensity={2.2} />
      <OrthographicCamera
        makeDefault
        position={[4, 3.4, 4]}
        zoom={90}
        near={0.01}
        far={100}
      />
      <OrbitControls makeDefault target={[0, 0.75, 0]} enableDamping={false} />
      {props.gltf && (
        <EditorModel
          gltf={props.gltf}
          source={props.source}
          slots={props.slots}
          onTextureStateChange={props.onTextureStateChange}
        />
      )}
      <gridHelper
        args={[8, 16, '#46625f', '#263b39']}
        position={[0, DUNGEON_SURFACE_Y - 0.01, 0]}
      />
    </>
  );
}

/** Loads exactly one uncached editor GLB and owns only that data. */
export function MaterialEditorScene({
  source,
  slots,
  onLoadStateChange,
  onTextureStateChange,
}: MaterialEditorSceneProps) {
  const [loaded, setLoaded] = useState<{ url: string; gltf: GltfLike }>();
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    let current = true;
    let loadedRoot: THREE.Object3D | undefined;
    const disposeLoaded = () => {
      if (!loadedRoot) return;
      disposeObjectResources(loadedRoot);
      loadedRoot.removeFromParent();
    };
    setLoaded(undefined);
    setLoadError('');
    onLoadStateChange(source.glb.url, 'loading');
    new GLTFLoader().load(
      source.glb.url,
      (gltf) => {
        loadedRoot = gltf.scene;
        if (!current) {
          disposeLoaded();
          return;
        }
        setLoaded({ url: source.glb.url, gltf: gltf as GltfLike });
        onLoadStateChange(source.glb.url, 'success');
      },
      undefined,
      (error) => {
        if (!current) return;
        const detail = error instanceof Error ? error.message : String(error);
        setLoadError(`Editor geometry failed to load: ${detail}`);
        onLoadStateChange(source.glb.url, 'error', detail);
      }
    );
    return () => {
      current = false;
      disposeLoaded();
    };
  }, [onLoadStateChange, source.glb.url]);

  const gltf =
    loaded && loaded.url === source.glb.url ? loaded.gltf : undefined;

  return (
    <div className="material-editor-canvas">
      <SceneErrorBoundary>
        {/* Live-editing preview: continuous frames keep the canvas in sync with
            channel edits (and screenshots honest); cost is irrelevant for one
            wall piece. preserveDrawingBuffer keeps capture tools honest too. */}
        <Canvas
          frameloop="always"
          dpr={[1, 1.5]}
          gl={{ preserveDrawingBuffer: true }}
        >
          <EditorWorld
            source={source}
            slots={slots}
            gltf={gltf}
            onTextureStateChange={onTextureStateChange}
          />
        </Canvas>
      </SceneErrorBoundary>
      {!gltf && !loadError && (
        <div className="asset-review-loading">Loading editor geometry…</div>
      )}
      {loadError && (
        <div className="asset-review-scene-error" role="alert">
          {loadError}
        </div>
      )}
    </div>
  );
}
