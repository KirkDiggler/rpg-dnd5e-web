import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import {
  applyWorldMaterialChannels,
  resolveMaterialChannelTargets,
  type MaterialChannelTreatment,
} from './materialChannelMaterials';

function fixture() {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  material.name = 'Authored';
  material.normalMap = new THREE.Texture();
  material.normalScale.set(-1, 0.6);
  material.emissiveMap = new THREE.Texture();
  material.emissive.setRGB(0.1, 0.2, 0.3);
  material.emissiveIntensity = 3;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
  mesh.name = 'Body';
  root.add(mesh);
  const treatment: MaterialChannelTreatment = {
    assetRef: 'dnd5e:env:test:channel_body',
    representation: 'model',
    glbSha256: 'a'.repeat(64),
    binding: {
      assetRef: 'dnd5e:env:test:channel_body',
      representation: 'model',
      glbSha256: 'a'.repeat(64),
      targets: [
        {
          id: 'body',
          label: 'Body',
          selectors: [{ node: 'Body', material: 'Authored' }],
          normal: { kind: 'adjustable', minMultiplier: 0.5, maxMultiplier: 2 },
          emissive: {
            kind: 'adjustable',
            minMultiplier: 0.5,
            maxMultiplier: 2,
          },
        },
      ],
    },
    adjustments: [
      { targetId: 'body', normal: { mode: 'scale', multiplier: 0.5 } },
    ],
  };
  return { root, mesh, material, treatment };
}

it.each(['assetRef', 'representation', 'glbSha256'] as const)(
  'refuses a mismatched %s before material mutation',
  (key) => {
    const f = fixture();
    const altered = {
      ...f.treatment,
      [key]: key === 'representation' ? 'standing' : 'wrong',
    } as MaterialChannelTreatment;
    expect(() =>
      resolveMaterialChannelTargets({ root: f.root, treatment: altered })
    ).toThrow(/identity|representation|hash/i);
    expect(f.mesh.material).toBe(f.material);
  }
);

it('refuses missing bindings, unknown targets and duplicate intent without falling back', () => {
  const f = fixture();
  for (const treatment of [
    { ...f.treatment, binding: undefined },
    {
      ...f.treatment,
      adjustments: [{ targetId: 'unknown', normal: { mode: 'off' as const } }],
    },
    {
      ...f.treatment,
      adjustments: [...f.treatment.adjustments, ...f.treatment.adjustments],
    },
  ])
    expect(() =>
      resolveMaterialChannelTargets({ root: f.root, treatment })
    ).toThrow();
  expect(f.mesh.material).toBe(f.material);
});

it('follows explicit derived-part provenance, not a guessed material name', () => {
  const f = fixture();
  const copy = f.mesh.clone();
  copy.name = 'derived-body';
  f.root.add(copy);
  const trim = f.mesh.clone();
  trim.name = 'trim';
  f.root.add(trim);
  const targets = resolveMaterialChannelTargets({
    root: f.root,
    treatment: f.treatment,
    nodeCopies: new Map([['Body', ['derived-body']]]),
  });
  const applied = applyWorldMaterialChannels({ targets });
  expect(f.mesh.material.normalScale.toArray()).toEqual([-0.5, 0.3]);
  expect(copy.material).toBe(f.mesh.material);
  expect(trim.material).toBe(f.material);
  expect(applied.materials).toHaveLength(1);
  applied.dispose();
  applied.dispose();
  expect(f.mesh.material).toBe(f.material);
  expect(copy.material).toBe(f.material);
});

it('uses effective complete-look values after pristine selector resolution', () => {
  const f = fixture();
  const targets = resolveMaterialChannelTargets({
    root: f.root,
    treatment: f.treatment,
  });
  const effective = f.material.clone();
  effective.name = 'selected-look';
  effective.normalScale.set(-0.4, 1.2);
  f.mesh.material = effective;
  const applied = applyWorldMaterialChannels({ targets });
  expect(f.mesh.material.normalScale.toArray()).toEqual([-0.2, 0.6]);
  expect(effective.normalScale.toArray()).toEqual([-0.4, 1.2]);
  applied.dispose();
  expect(f.mesh.material).toBe(effective);
});

it('validates every requested channel before allocating or assigning any clone', () => {
  const f = fixture();
  const other = f.mesh.clone();
  other.name = 'Other';
  other.material = f.material.clone();
  other.material.normalMap = null;
  f.root.add(other);
  const target = f.treatment.binding!.targets[0];
  const treatment: MaterialChannelTreatment = {
    ...f.treatment,
    binding: {
      ...f.treatment.binding!,
      targets: [
        target,
        {
          ...target,
          id: 'other',
          selectors: [{ node: 'Other', material: 'Authored' }],
        },
      ],
    },
    adjustments: [
      ...f.treatment.adjustments,
      { targetId: 'other', normal: { mode: 'off' } },
    ],
  };
  const before = other.material;
  const clone = vi.spyOn(f.material, 'clone');
  const targets = resolveMaterialChannelTargets({ root: f.root, treatment });
  expect(() => applyWorldMaterialChannels({ targets })).toThrow(
    /mapped source/
  );
  expect(clone).not.toHaveBeenCalled();
  expect(f.mesh.material).toBe(f.material);
  expect(other.material).toBe(before);
});

it('refuses an effective look that removed the requested channel', () => {
  const f = fixture();
  const targets = resolveMaterialChannelTargets({
    root: f.root,
    treatment: f.treatment,
  });
  const effective = f.material.clone();
  effective.normalMap = null;
  f.mesh.material = effective;
  expect(() => applyWorldMaterialChannels({ targets })).toThrow(
    /mapped source/
  );
  expect(f.mesh.material).toBe(effective);
});

it('rejects overlapping primitive ownership even when selectors have different node names', () => {
  const f = fixture();
  const group = new THREE.Group();
  group.name = 'Container';
  group.add(f.mesh);
  f.root.add(group);
  const target = f.treatment.binding!.targets[0];
  const treatment = {
    ...f.treatment,
    binding: {
      ...f.treatment.binding!,
      targets: [
        target,
        {
          ...target,
          id: 'overlap',
          selectors: [{ node: 'Container', material: 'Authored' }],
        },
      ],
    },
  };
  expect(() =>
    resolveMaterialChannelTargets({ root: f.root, treatment })
  ).toThrow(/overlap/);
});

it('changes only the selected primitive slot and restores the exact material array', () => {
  const f = fixture();
  const trim = f.material.clone();
  trim.name = 'Trim';
  const geometry = new THREE.PlaneGeometry();
  geometry.clearGroups();
  geometry.addGroup(0, 3, 0);
  geometry.addGroup(3, 3, 1);
  const originals = [f.material, trim];
  const mesh = new THREE.Mesh(geometry, originals);
  mesh.name = 'Body';
  f.root.remove(f.mesh);
  f.root.add(mesh);
  const targets = resolveMaterialChannelTargets({
    root: f.root,
    treatment: f.treatment,
  });
  const applied = applyWorldMaterialChannels({ targets });
  expect(mesh.material).not.toBe(originals);
  expect(mesh.material[0].normalScale.toArray()).toEqual([-0.5, 0.3]);
  expect(mesh.material[1]).toBe(trim);
  expect(originals[0]).toBe(f.material);
  const dispose = vi.spyOn(mesh.material[0], 'dispose');
  applied.dispose();
  applied.dispose();
  expect(mesh.material).toBe(originals);
  expect(dispose).toHaveBeenCalledTimes(1);
});

it('refuses a fixed channel even when its material has a map', () => {
  const f = fixture();
  const binding = f.treatment.binding!;
  const treatment = {
    ...f.treatment,
    binding: {
      ...binding,
      targets: [{ ...binding.targets[0], normal: { kind: 'fixed' as const } }],
    },
  };
  const targets = resolveMaterialChannelTargets({ root: f.root, treatment });
  expect(() => applyWorldMaterialChannels({ targets })).toThrow(
    /not adjustable/
  );
  expect(f.mesh.material).toBe(f.material);
});

it('resolves on pristine NPC nodes and maps only their owned clone slots', () => {
  const f = fixture();
  const owned = f.mesh.clone();
  owned.material = f.material.clone();
  owned.material.name = 'owned';
  const targets = resolveMaterialChannelTargets({
    root: f.root,
    treatment: f.treatment,
    meshBySource: new Map([[f.mesh, owned]]),
  });
  const applied = applyWorldMaterialChannels({ targets });
  expect(owned.material.normalScale.toArray()).toEqual([-0.5, 0.3]);
  expect(f.mesh.material).toBe(f.material);
  expect(f.material.normalScale.toArray()).toEqual([-1, 0.6]);
  applied.dispose();
});
