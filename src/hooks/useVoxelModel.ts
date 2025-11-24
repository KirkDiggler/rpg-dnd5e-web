import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

interface UseVoxelModelOptions {
  modelPath: string;
  scale?: number;
  rotationY?: number; // Rotation around Y axis in radians
}

export function useVoxelModel({
  modelPath,
  scale = 0.01,
  rotationY = 0,
}: UseVoxelModelOptions) {
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loader = new GLTFLoader();

    loader.load(
      modelPath,
      (gltf) => {
        // Get the scene from the loaded GLTF
        const loadedModel = gltf.scene;

        // Center the model
        const box = new THREE.Box3().setFromObject(loadedModel);
        const center = box.getCenter(new THREE.Vector3());
        loadedModel.position.sub(center);

        // Apply scale
        loadedModel.scale.setScalar(scale);

        // Apply rotation (Y-axis for spinning the model horizontally)
        loadedModel.rotation.y = rotationY;

        setModel(loadedModel);
        setLoading(false);
      },
      undefined, // onProgress
      (err: unknown) => {
        console.error('Error loading voxel model:', err);
        setError(
          err instanceof Error ? err : new Error('Failed to load voxel model')
        );
        setLoading(false);
      }
    );
  }, [modelPath, scale, rotationY]);

  return { model, loading, error };
}
