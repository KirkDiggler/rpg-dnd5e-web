export function auditedMaterialManifestFixture(allBlocked = false) {
  const base = materialManifestFixture();
  const sourcePath = allBlocked ? 'FBX/Test.fbx' : 'FBX/Blocked.fbx';
  if (!allBlocked)
    base.catalog.families[0]!.uses.push({
      ...base.catalog.families[0]!.uses[0]!,
      sourcePath,
    });
  return {
    ...base,
    schemaVersion: 2,
    previews: allBlocked ? [] : base.previews,
    sourceAudit: {
      sourceCount: allBlocked ? 1 : 2,
      verifiedCount: allBlocked ? 0 : 1,
      exceptions: [
        {
          sourcePath,
          sourceSha256: 'a'.repeat(64),
          reason: 'Expected 1 slot, found 2; correspondence unresolved',
          inspectionBlendPath: '/private/source-audits/case/inspect.blend',
          declaredSlots: [
            { objectName: 'Test', slot: 0, materialName: 'Stone' },
          ],
          objects: [
            {
              objectName: 'Test',
              meshDataName: 'Mesh',
              materialNames: ['Original', 'Unknown'],
              usedSlots: [0, 1],
            },
          ],
        },
      ],
    },
  };
}

export function materialManifestFixture() {
  const sha = 'a'.repeat(64);
  const use = {
    sourcePath: 'FBX/Test.fbx',
    sourceSha256: sha,
    group: 'environment',
    objectName: 'Test',
    slot: 0,
    declaredMaterial: 'Stone',
  };
  const option = (id: string) => ({
    id,
    label: id,
    baseColor: `Texture/${id}.png`,
    normal: null,
    wrap: 'repeat',
    texturesSha256: { [`Texture/${id}.png`]: sha },
    basis: 'authored-name-match',
    reasons: ['Named color pair; proposed static material.'],
  });
  return {
    schemaVersion: 1,
    mode: 'material-preview',
    profile: {
      schemaVersion: 1,
      profileId: 'review',
      packSlug: 'fixture-pack',
      packVersion: 'v1',
      selections: { Stone: null },
    },
    profileSha256: sha,
    catalogSha256: sha,
    catalog: {
      schemaVersion: 1,
      packSlug: 'fixture-pack',
      packVersion: 'v1',
      inputSha256: sha,
      families: [
        {
          id: 'Stone',
          label: 'Stone',
          kind: 'tiling',
          uses: [use],
          options: [option('stone-light'), option('stone-dark')],
          recommendedOptionId: 'stone-light',
          reasons: ['Unapproved proposal.'],
        },
      ],
    },
    previews: ['stone-light', 'stone-dark'].map((optionId) => ({
      familyId: 'Stone',
      optionId,
      sourcePath: 'FBX/Test.fbx',
      objectNames: ['Test'],
      url: `/models/synty/asset-review-materials/models/${sha}.glb`,
      glbSha256: sha,
      layoutReportSha256: sha,
      context: [],
    })),
  };
}
