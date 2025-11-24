import { VOXLoader, VOXMesh, type VOXChunk } from '@/loaders/VOXLoader200';
import { useEffect, useState } from 'react';
import * as THREE from 'three';

interface UseVoxelModelOptions {
  modelPath: string;
  scale?: number;
  rotationX?: number; // Rotation around X axis (to stand up Z-up models)
  rotationY?: number; // Rotation around Y axis (horizontal spin)
}

export function useVoxelModel({
  modelPath,
  scale = 0.01,
  rotationX = 0,
  rotationY = 0,
}: UseVoxelModelOptions) {
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loader = new VOXLoader();

    loader.load(
      modelPath,
      (chunks: VOXChunk[]) => {
        // Create a group to hold all chunks
        const group = new THREE.Group();

        // Convert raw chunk data to VOXMesh objects and add to group
        chunks.forEach((chunk) => {
          const mesh = new VOXMesh(chunk);
          group.add(mesh);
        });

        // Apply scale first
        group.scale.setScalar(scale);

        // Apply rotations before centering
        // X rotation: MagicaVoxel uses Z-up, Three.js uses Y-up, so rotate around X to stand up
        group.rotation.x = rotationX;
        // Y rotation: spin the model horizontally
        group.rotation.y = rotationY;

        // Center the model on X/Z axes only, keep Y at base
        const box = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        group.position.x -= center.x;
        group.position.z -= center.z;
        // Position at base (bottom of bounding box)
        group.position.y -= box.min.y;

        setModel(group);
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
  }, [modelPath, scale, rotationX, rotationY]);

  return { model, loading, error };
}
