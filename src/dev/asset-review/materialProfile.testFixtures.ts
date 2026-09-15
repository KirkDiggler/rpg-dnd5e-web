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
