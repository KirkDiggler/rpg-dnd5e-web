import type { RegionLightingMaterialBinding } from '@/rendering/regionLightingMaterials';
import { createTestLightingBinding } from '@/rendering/regionLightingTestFixtures';
import { cleanup, render } from '@testing-library/react';
import { StrictMode, Suspense, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRememberedModelTint } from './useRememberedModelTint';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function Owner({
  root,
  remembered = false,
  binding,
  revision = 0,
  tile,
  pending = false,
}: {
  root: THREE.Object3D;
  remembered?: boolean;
  binding?: RegionLightingMaterialBinding;
  revision?: number;
  tile?: THREE.Object3D;
  pending?: boolean;
}): null {
  useRememberedModelTint(
    root,
    remembered,
    revision,
    binding,
    'test-native-leaf'
  );
  useLayoutEffect(() => {
    if (!tile) return;
    root.add(tile);
    return () => {
      root.remove(tile);
    };
  }, [root, tile]);
  if (pending) throw new Promise(() => {});
  return null;
}
describe('single per-instance memory/lighting material owner', () => {
  it('no-binding is source identity; arrays share one clone per source; StrictMode restores/disposes only owned materials', () => {
    const map = new THREE.Texture(),
      geometry = new THREE.BoxGeometry(),
      source = new THREE.MeshStandardMaterial({ map }),
      root = new THREE.Group();
    const a = new THREE.Mesh(geometry, [source, source]),
      b = new THREE.Mesh(geometry, source);
    root.add(a, b);
    const originalArray = a.material;
    const sourceDispose = vi.spyOn(source, 'dispose'),
      mapDispose = vi.spyOn(map, 'dispose'),
      geometryDispose = vi.spyOn(geometry, 'dispose'),
      clone = vi.spyOn(source, 'clone');
    const binding = createTestLightingBinding();
    const view = render(
      <StrictMode>
        <Owner root={root} />
      </StrictMode>
    );
    expect(a.material).toBe(originalArray);
    expect(b.material).toBe(source);
    expect(clone).not.toHaveBeenCalled();
    view.rerender(
      <StrictMode>
        <Owner root={root} binding={binding} />
      </StrictMode>
    );
    const owned = b.material as THREE.Material;
    expect(owned).not.toBe(source);
    expect(a.material).toEqual([owned, owned]);
    const dispose = vi.spyOn(owned, 'dispose');
    binding.uniforms.rlPointCount.value = 2;
    view.rerender(
      <StrictMode>
        <Owner root={root} binding={binding} />
      </StrictMode>
    );
    expect(b.material).toBe(owned);
    expect(clone).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(a.material).toBe(originalArray);
    expect(b.material).toBe(source);
    expect(dispose).toHaveBeenCalledOnce();
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(mapDispose).not.toHaveBeenCalled();
    expect(geometryDispose).not.toHaveBeenCalled();
    binding.dispose();
  });
  it('captures post-layout cap addition, unwraps inherited treatment, retires detached courses and composes memory then lighting', () => {
    const source = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: '#ff8000',
      }),
      geometry = new THREE.BoxGeometry(),
      root = new THREE.Group(),
      above = new THREE.Mesh(geometry, source);
    root.add(above);
    const binding = createTestLightingBinding(),
      view = render(<Owner root={root} binding={binding} remembered />);
    const first = above.material as THREE.MeshStandardMaterial,
      dispose = vi.spyOn(first, 'dispose');
    expect(first.color.equals(source.color)).toBe(false);
    expect(source.color.getHexString()).toBe('ffffff');
    expect(first.customProgramCacheKey()).toContain('STUDIO_REGION_LIGHTING');
    // Matches above.clone(true) while the preceding treatment is installed.
    const tile = above.clone(true);
    view.rerender(
      <Owner
        root={root}
        binding={binding}
        remembered
        revision={1}
        tile={tile}
      />
    );
    expect(dispose).toHaveBeenCalledOnce();
    expect(tile.material).toBe(above.material);
    expect(tile.material).not.toBe(first);
    const capOwned = tile.material as THREE.Material,
      capDispose = vi.spyOn(capOwned, 'dispose');
    view.rerender(<Owner root={root} binding={binding} revision={2} />);
    expect(tile.parent).toBeNull();
    expect(tile.material).toBe(source);
    expect(capDispose).toHaveBeenCalledOnce();
    expect(
      (above.material as THREE.MeshStandardMaterial).color.equals(source.color)
    ).toBe(true);
    view.unmount();
    expect(above.material).toBe(source);
    binding.dispose();
  });
  it('asset swap, StrictMode mount/unmount and suspended render retry do not mutate or dispose cached resources', () => {
    const source = new THREE.MeshStandardMaterial(),
      dispose = vi.spyOn(source, 'dispose'),
      a = new THREE.Mesh(new THREE.BoxGeometry(), source),
      b = new THREE.Mesh(a.geometry, source),
      binding = createTestLightingBinding();
    const view = render(
      <StrictMode>
        <Suspense fallback={null}>
          <Owner root={a} binding={binding} />
        </Suspense>
      </StrictMode>
    );
    expect(a.material).not.toBe(source);
    const owned = a.material as THREE.Material,
      ownedDispose = vi.spyOn(owned, 'dispose');
    view.rerender(
      <StrictMode>
        <Suspense fallback={null}>
          <Owner root={b} binding={binding} />
        </Suspense>
      </StrictMode>
    );
    expect(a.material).toBe(source);
    expect(ownedDispose).toHaveBeenCalledOnce();
    expect(b.material).not.toBe(source);
    view.unmount();
    expect(b.material).toBe(source);
    expect(dispose).not.toHaveBeenCalled();
    const clone = vi.spyOn(source, 'clone');
    const suspended = render(
      <Suspense fallback={null}>
        <Owner root={a} binding={binding} pending />
      </Suspense>
    );
    expect(clone).not.toHaveBeenCalled();
    expect(a.material).toBe(source);
    suspended.rerender(
      <Suspense fallback={null}>
        <Owner root={a} binding={binding} />
      </Suspense>
    );
    expect(a.material).not.toBe(source);
    suspended.unmount();
    expect(a.material).toBe(source);
    binding.dispose();
  });
  it('unsupported native material reports and stays original, including unknown hooks with remembered treatment', () => {
    const source = new THREE.MeshBasicMaterial(),
      mesh = new THREE.Mesh(new THREE.BoxGeometry(), source),
      binding = createTestLightingBinding();
    const view = render(<Owner root={mesh} binding={binding} />);
    expect(mesh.material).toBe(source);
    expect(binding.reportDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'unsupported-material',
        assetRef: 'test-native-leaf',
      })
    );
    view.unmount();
    const hooked = new THREE.MeshStandardMaterial();
    hooked.onBeforeCompile = vi.fn();
    const hookedMesh = new THREE.Mesh(mesh.geometry, hooked);
    const memory = render(
      <Owner root={hookedMesh} binding={binding} remembered />
    );
    expect(binding.reportDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'unsupported-hook' })
    );
    expect((hookedMesh.material as THREE.Material).onBeforeCompile).toBe(
      hooked.onBeforeCompile
    );
    memory.unmount();
    expect(hookedMesh.material).toBe(hooked);
    binding.dispose();
  });
});
