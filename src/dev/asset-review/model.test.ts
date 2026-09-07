import { describe, expect, it } from 'vitest';

import {
  filterReviewEntries,
  mergeCatalogWithReview,
  parseAssetReviewCatalog,
  serializeReadyProviderBatch,
  serializeReviewProgress,
  transitionDecision,
  updateProviderFields,
  validateReady,
  visualRef,
  type AssetReviewBatch,
  type AssetReviewCandidate,
  type AssetReviewCatalog,
  type AssetReviewEntry,
  type ReviewDecision,
} from './model';

const SOURCE_HASH = 'a'.repeat(64);

type CandidateOverrides = Omit<
  Partial<AssetReviewCandidate>,
  'source' | 'dimensionsMeters'
> & {
  source?: Partial<AssetReviewCandidate['source']>;
  dimensionsMeters?: readonly [number, number, number];
};

type EntryOverrides = Omit<
  Partial<AssetReviewEntry>,
  'calibration' | 'dimensionsMeters'
> & {
  dimensionsMeters?: readonly [number, number, number];
  calibration?: Omit<
    Partial<AssetReviewEntry['calibration']>,
    'fineOffsetMeters'
  > & {
    fineOffsetMeters?: readonly [number, number, number];
  };
};

function candidate(overrides: CandidateOverrides = {}): AssetReviewCandidate {
  const source = {
    packSlug: 'polygon-dark-fortress',
    packVersion: 'v3',
    sourcePath: 'SourceFiles/DarkFortress/FBX/SM_Prop_Brazier_01.fbx',
    glbSha256: SOURCE_HASH,
    ...overrides.source,
  };

  return {
    url: `/models/synty/asset-review/${source.glbSha256.slice(0, 12)}-SM_Prop_Brazier_01.glb`,
    sourceFamily: 'props',
    suggestedCategory: 'props',
    suggestedDisplayName: 'Brazier 01',
    browsingFamily: 'brazier',
    referencePack: 'dark-fortress',
    refSuffix: 'brazier_01',
    readyEligible: true,
    reviewStatus: 'trusted',
    reasons: [],
    ...overrides,
    source,
    dimensionsMeters: [...(overrides.dimensionsMeters ?? [1, 2, 1])],
  };
}

function catalog(
  candidates: AssetReviewCandidate[] = [candidate()]
): AssetReviewCatalog {
  return { schemaVersion: 1, candidates };
}

function entry(overrides: EntryOverrides = {}): AssetReviewEntry {
  const initial = mergeCatalogWithReview(catalog()).batch.entries[0];
  if (!initial) {
    throw new Error('fixture entry was not created');
  }

  const merged = { ...initial, ...overrides };
  const fineOffsetMeters =
    overrides.calibration?.fineOffsetMeters ??
    initial.calibration.fineOffsetMeters;
  return {
    ...merged,
    source: { ...merged.source },
    dimensionsMeters: [...merged.dimensionsMeters] as [number, number, number],
    reasons: [...merged.reasons],
    calibration: {
      ...initial.calibration,
      ...overrides.calibration,
      fineOffsetMeters: [...fineOffsetMeters] as [number, number, number],
    },
    tags: [...merged.tags],
  };
}

function readyEntry(overrides: EntryOverrides = {}): AssetReviewEntry {
  const kept = entry({
    decision: 'keep',
    loadedSuccessfully: true,
    ...overrides,
  });
  return transitionDecision(kept, 'ready');
}

function withoutKey(
  value: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([candidateKey]) => candidateKey !== key)
  );
}

describe('parseAssetReviewCatalog', () => {
  it('parses the exact schema-v1 catalog and candidate keys', () => {
    const value = catalog();

    expect(parseAssetReviewCatalog(value)).toEqual(value);
  });

  it('rejects unknown and missing keys at every catalog boundary', () => {
    const validCandidate = candidate();

    expect(() =>
      parseAssetReviewCatalog({ ...catalog(), unexpected: true })
    ).toThrow(/keys must be exactly/i);
    expect(() =>
      parseAssetReviewCatalog(
        withoutKey(
          catalog() as unknown as Record<string, unknown>,
          'candidates'
        )
      )
    ).toThrow(/keys must be exactly/i);
    expect(() =>
      parseAssetReviewCatalog(
        catalog([
          { ...validCandidate, unexpected: true } as AssetReviewCandidate,
        ])
      )
    ).toThrow(/candidate.*keys must be exactly/i);
    expect(() =>
      parseAssetReviewCatalog(
        catalog([
          withoutKey(
            validCandidate as unknown as Record<string, unknown>,
            'refSuffix'
          ) as unknown as AssetReviewCandidate,
        ])
      )
    ).toThrow(/candidate.*keys must be exactly/i);
    expect(() =>
      parseAssetReviewCatalog(
        catalog([
          candidate({
            source: {
              ...validCandidate.source,
              extra: 'no',
            } as AssetReviewCandidate['source'],
          }),
        ])
      )
    ).toThrow(/source.*keys must be exactly/i);
  });

  it.each([
    '/models/synty/asset-review/nested/aaaaaaaaaaaa-Brazier.glb',
    '/models/synty/asset-review/aaaaaaaaaaaa-Brazier%20One.glb',
    '/models/synty/asset-review/aaaaaaaaaaaa-Brazier One.glb',
    '/models/synty/asset-review/aaaaaaaaaaaa-../Brazier.glb',
    '/models/synty/asset-review/aaaaaaaaaaaa-.glb',
    '/models/synty/asset-review/bbbbbbbbbbbb-Brazier.glb',
    'http://127.0.0.1:5173/models/synty/asset-review/aaaaaaaaaaaa-Brazier.glb',
  ])('rejects a non-content-addressed or unsafe candidate URL: %s', (url) => {
    expect(() =>
      parseAssetReviewCatalog(catalog([candidate({ url })]))
    ).toThrow(/url/i);
  });

  it.each(['Props', 'environment', 'armor', ''])(
    'rejects the unsupported category %j',
    (suggestedCategory) => {
      expect(() =>
        parseAssetReviewCatalog(
          catalog([
            candidate({
              suggestedCategory:
                suggestedCategory as AssetReviewCandidate['suggestedCategory'],
            }),
          ])
        )
      ).toThrow(/category/i);
    }
  );

  it('requires a boolean readyEligible value', () => {
    expect(() =>
      parseAssetReviewCatalog(
        catalog([
          candidate({
            readyEligible:
              'true' as unknown as AssetReviewCandidate['readyEligible'],
          }),
        ])
      )
    ).toThrow(/readyEligible.*boolean/i);
  });

  it('accepts a trusted provider-ineligible candidate with a preflight reason', () => {
    const blocked = candidate({
      readyEligible: false,
      reviewStatus: 'trusted',
      reasons: ['Planned runtime textures exceed the provider budget'],
    });

    expect(parseAssetReviewCatalog(catalog([blocked])).candidates[0]).toEqual(
      blocked
    );
  });

  it('rejects a trusted provider-ineligible candidate without a reason', () => {
    expect(() =>
      parseAssetReviewCatalog(
        catalog([candidate({ readyEligible: false, reviewStatus: 'trusted' })])
      )
    ).toThrow(/trusted.*ineligible.*reason/i);
  });

  it('rejects blocking reasons on a trusted eligible candidate', () => {
    expect(() =>
      parseAssetReviewCatalog(
        catalog([
          candidate({
            readyEligible: true,
            reviewStatus: 'trusted',
            reasons: ['Should not be blocked'],
          }),
        ])
      )
    ).toThrow(/trusted.*eligible.*reasons/i);
  });

  it.each(['material-review', 'fx-review'] as const)(
    'requires blocked %s candidates to be ineligible with a reason',
    (reviewStatus) => {
      expect(() =>
        parseAssetReviewCatalog(
          catalog([candidate({ reviewStatus, reasons: ['blocked'] })])
        )
      ).toThrow(/ineligible/i);
      expect(() =>
        parseAssetReviewCatalog(
          catalog([
            candidate({
              reviewStatus,
              readyEligible: false,
              reasons: [],
            }),
          ])
        )
      ).toThrow(/reason/i);
      expect(
        parseAssetReviewCatalog(
          catalog([
            candidate({
              reviewStatus,
              readyEligible: false,
              reasons: ['Requires visual review'],
            }),
          ])
        ).candidates[0]?.reviewStatus
      ).toBe(reviewStatus);
    }
  );

  it.each(['A'.repeat(64), 'a'.repeat(63), `${'a'.repeat(63)}g`, ''])(
    'rejects a non-lowercase-SHA-256 source hash',
    (glbSha256) => {
      expect(() =>
        parseAssetReviewCatalog(catalog([candidate({ source: { glbSha256 } })]))
      ).toThrow(/sha-256/i);
    }
  );

  it.each([
    ['material-review', [119.4, 0, 212.65]],
    ['fx-review', [0.0000018, 0.0000016, 0]],
  ] as const)(
    'accepts and preserves exact flat %s review-only bounds',
    (reviewStatus, dimensionsMeters) => {
      const input = candidate({
        readyEligible: false,
        reviewStatus,
        reasons: ['Review-only preview'],
        dimensionsMeters,
      });
      const expectedDimensions = [...dimensionsMeters];
      const parsed = parseAssetReviewCatalog(catalog([input]));

      expect(parsed.candidates[0]?.dimensionsMeters).toEqual(
        expectedDimensions
      );
      input.dimensionsMeters[0] = 999;
      expect(parsed.candidates[0]?.dimensionsMeters).toEqual(
        expectedDimensions
      );
    }
  );

  it.each([
    ['eligible flat', [0, 1, 1], true],
    ['all zero', [0, 0, 0], false],
    ['negative', [-1, 1, 1], false],
    ['NaN', [Number.NaN, 1, 1], false],
    ['Infinity', [Number.POSITIVE_INFINITY, 1, 1], false],
    ['wrong length', [1, 2], false],
  ])(
    'rejects %s measured dimensions %j',
    (_label, dimensionsMeters, readyEligible) => {
      expect(() =>
        parseAssetReviewCatalog(
          catalog([
            candidate({
              readyEligible,
              reviewStatus: readyEligible ? 'trusted' : 'material-review',
              reasons: readyEligible ? [] : ['Review-only preview'],
              dimensionsMeters:
                dimensionsMeters as unknown as AssetReviewCandidate['dimensionsMeters'],
            }),
          ])
        )
      ).toThrow(/dimensionsMeters/i);
    }
  );
});

describe('candidate defaults and decision transitions', () => {
  it('creates a deterministic undecided entry from catalog suggestions', () => {
    const result = mergeCatalogWithReview(catalog());

    expect(result.staleSourceKeys).toEqual([]);
    expect(result.batch.batchId).toBe('dark-fortress-world-assets-v1');
    const sourceCandidate = candidate();
    expect(result.batch.entries).toEqual([
      {
        source: sourceCandidate.source,
        url: sourceCandidate.url,
        sourceFamily: 'props',
        browsingFamily: 'brazier',
        referencePack: 'dark-fortress',
        refSuffix: 'brazier_01',
        dimensionsMeters: [1, 2, 1],
        readyEligible: true,
        reviewStatus: 'trusted',
        reasons: [],
        decision: 'undecided',
        loadedSuccessfully: false,
        displayName: 'Brazier 01',
        category: 'props',
        ref: 'dnd5e:props:dark-fortress:brazier_01',
        calibration: {
          scale: 1,
          yawDegrees: 0,
          fineOffsetMeters: [0, 0, 0],
        },
        tags: [],
        supportsDecoration: false,
        notes: '',
        deferReason: '',
      },
    ]);
    expect('suggestedCategory' in result.batch.entries[0]!).toBe(false);
    expect('suggestedDisplayName' in result.batch.entries[0]!).toBe(false);
  });

  it('derives the exact visual ref from category, reference pack, and suffix', () => {
    expect(
      visualRef({
        category: 'weapons',
        referencePack: 'dark-fortress',
        refSuffix: 'brazier_01',
      })
    ).toBe('dnd5e:weapons:dark-fortress:brazier_01');
  });

  it('supports all five decisions and validates an explicit Ready transition', () => {
    const decisions: ReviewDecision[] = [
      'undecided',
      'keep',
      'ready',
      'skip',
      'defer',
    ];

    for (const decision of decisions) {
      const current = entry({
        decision: 'keep',
        loadedSuccessfully: decision === 'ready',
      });
      expect(transitionDecision(current, decision).decision).toBe(decision);
    }
  });

  it.each([
    ['trusted', 'Provider texture budget exceeded'],
    ['material-review', 'Material conversion required'],
  ] as const)(
    'refuses Ready when a %s source is provider-ineligible',
    (reviewStatus, reason) => {
      const blocked = entry({
        decision: 'keep',
        loadedSuccessfully: true,
        readyEligible: false,
        reviewStatus,
        reasons: [reason],
      });

      expect(validateReady(blocked)).toHaveProperty('readyEligible');
      expect(() => transitionDecision(blocked, 'ready')).toThrow(
        /not eligible/i
      );
    }
  );

  it.each([
    ['full-casefolded provider marker', { displayName: 'downloadẞ' }],
    ['trailing-newline tag', { tags: ['lighting\n'] }],
  ])('refuses a Ready transition with %s', (_case, overrides) => {
    const kept = entry({
      decision: 'keep',
      loadedSuccessfully: true,
      ...overrides,
    });

    expect(() => transitionDecision(kept, 'ready')).toThrow(
      /displayName|tags/i
    );
  });

  it('demotes Ready to Keep after every provider field edit and re-derives ref', () => {
    const ready = readyEntry();

    expect(
      updateProviderFields(ready, { displayName: 'Large Brazier' })
    ).toMatchObject({
      decision: 'keep',
      displayName: 'Large Brazier',
    });
    expect(updateProviderFields(ready, { category: 'items' })).toMatchObject({
      decision: 'keep',
      category: 'items',
      ref: 'dnd5e:items:dark-fortress:brazier_01',
    });
    expect(
      updateProviderFields(ready, { calibration: { scale: 1.2 } })
    ).toMatchObject({
      decision: 'keep',
      calibration: { scale: 1.2 },
    });
    expect(
      updateProviderFields(ready, { supportsDecoration: true })
    ).toMatchObject({ decision: 'keep', supportsDecoration: true });
    expect(updateProviderFields(ready, {}).decision).toBe('keep');
  });
});

describe('validateReady', () => {
  it('accepts provider-safe Unicode display names and authored tag order', () => {
    expect(
      validateReady(
        entry({
          loadedSuccessfully: true,
          displayName: '火鉢 😀 fıle:',
          tags: ['lighting', 'dark-fortress', 'large_prop'],
        })
      )
    ).toEqual({});
    expect(
      validateReady(
        entry({ loadedSuccessfully: true, displayName: '😀'.repeat(80) })
      )
    ).toEqual({});
  });

  it.each([
    ['trailing whitespace', 'Brazier 01 ', /leading or trailing whitespace/i],
    ['leading whitespace', ' Brazier 01', /leading or trailing whitespace/i],
    ['source marker', 'SourceFiles Brazier 01', /source-path or URI/i],
    ['machine marker', 'Downloads Brazier 01', /source-path or URI/i],
    ['full-casefolded machine marker', 'downloadẞ', /source-path or URI/i],
    ['file URI', 'FILE:C:asset', /source-path or URI/i],
    ['Unicode-casefolded file URI', 'ﬁle:asset', /source-path or URI/i],
    ['HTTP URI', 'HTTP:example.test', /source-path or URI/i],
    ['HTTPS URI', 'HTTPS:example.test', /source-path or URI/i],
    ['URI delimiter', 'asset :// example.test', /path separators/i],
    ['forward path separator', 'props/brazier', /path separators/i],
    ['backward path separator', 'props\\brazier', /path separators/i],
    ['control character', 'Brazier\n01', /printable, non-control/i],
    ['format character', 'Brazier\u200B01', /printable, non-control/i],
    ['81 Unicode code points', '😀'.repeat(81), /80 Unicode code points/i],
  ] as const)(
    'rejects a display name containing %s',
    (_case, displayName, message) => {
      expect(
        validateReady(entry({ loadedSuccessfully: true, displayName }))
      ).toMatchObject({ displayName: expect.stringMatching(message) });
    }
  );

  it.each([
    ['uppercase', ['Lighting']],
    ['spaces', ['dark fortress']],
    ['overlength', [`a${'b'.repeat(40)}`]],
    ['empty', ['']],
    ['trailing newline', ['lighting\n']],
    ['control character', ['light\u0000ing']],
    ['non-ASCII', ['lightíng']],
    ['duplicates', ['lighting', 'lighting']],
    ['more than 20', Array.from({ length: 21 }, (_, index) => `tag-${index}`)],
  ])('rejects %s tags', (_case, tags) => {
    expect(
      validateReady(entry({ loadedSuccessfully: true, tags }))
    ).toHaveProperty('tags');
  });

  it('preserves provider-invalid display names and tags in Keep drafts', () => {
    const updated = updateProviderFields(readyEntry(), {
      displayName: 'Brazier 01 ',
      tags: ['Lighting', 'dark fortress', 'Lighting'],
    });

    expect(updated).toMatchObject({
      decision: 'keep',
      displayName: 'Brazier 01 ',
      tags: ['Lighting', 'dark fortress', 'Lighting'],
    });
    expect(validateReady(updated)).toMatchObject({
      displayName: expect.any(String),
      tags: expect.any(String),
    });
  });

  it.each([
    ['displayName', { displayName: '   ' }],
    ['ref', { ref: 'dnd5e:items:dark-fortress:brazier_01' }],
    ['calibration.scale', { calibration: { scale: 0 } }],
    ['calibration.scale', { calibration: { scale: 100.01 } }],
    ['calibration.scale', { calibration: { scale: Number.NaN } }],
    ['calibration.yawDegrees', { calibration: { yawDegrees: -180.01 } }],
    ['calibration.yawDegrees', { calibration: { yawDegrees: 180 } }],
    [
      'calibration.fineOffsetMeters[0]',
      { calibration: { fineOffsetMeters: [0.51, 0, 0] } },
    ],
    [
      'calibration.fineOffsetMeters[2]',
      { calibration: { fineOffsetMeters: [0, 0, -0.51] } },
    ],
    [
      'calibration.fineOffsetMeters[1]',
      { calibration: { fineOffsetMeters: [0, 0.11, 0] } },
    ],
    ['dimensionsMeters', { dimensionsMeters: [0, 2, 1] }],
    ['dimensionsMeters', { dimensionsMeters: [1, 27, 1] }],
    ['loadedSuccessfully', { loadedSuccessfully: false }],
    [
      'supportsDecoration',
      { supportsDecoration: 'false' as unknown as boolean },
    ],
  ] as const)(
    'reports %s when the Ready constraint is violated',
    (field, overrides) => {
      expect(validateReady(entry(overrides))).toHaveProperty(field);
    }
  );

  it('applies the shared 0.75 scale at the 20-metre bounds limit', () => {
    expect(
      validateReady(
        entry({
          loadedSuccessfully: true,
          dimensionsMeters: [20 / 0.75, 1, 1],
        })
      )
    ).toEqual({});
    expect(
      validateReady(
        entry({
          loadedSuccessfully: true,
          dimensionsMeters: [20 / 0.75 + 0.01, 1, 1],
        })
      )
    ).toHaveProperty('dimensionsMeters');
  });
});

describe('catalog merge', () => {
  it('uses the full source tuple as stable identity and preserves exact drafts', () => {
    const oldCandidate = candidate();
    const first = mergeCatalogWithReview(catalog([oldCandidate])).batch;
    const oldEntry = first.entries[0]!;
    const review: AssetReviewBatch = {
      ...first,
      batchId: 'continued-batch',
      entries: [
        updateProviderFields(transitionDecision(oldEntry, 'keep'), {
          displayName: 'Reviewed Brazier',
          supportsDecoration: true,
          notes: 'Approved silhouette',
        }),
      ],
    };
    const refreshedCandidate = candidate({ dimensionsMeters: [3, 4, 3] });

    const result = mergeCatalogWithReview(
      catalog([refreshedCandidate]),
      review
    );

    expect(result.staleSourceKeys).toEqual([]);
    expect(result.batch.batchId).toBe('continued-batch');
    expect(result.batch.entries[0]).toMatchObject({
      decision: 'keep',
      displayName: 'Reviewed Brazier',
      supportsDecoration: true,
      notes: 'Approved silhouette',
      dimensionsMeters: [3, 4, 3],
    });
  });

  it('returns changed hashes as Undecided and reports the old source as stale', () => {
    const first = mergeCatalogWithReview(catalog()).batch;
    const changedHash = 'b'.repeat(64);
    const changed = candidate({
      source: { glbSha256: changedHash },
      url: `/models/synty/asset-review/${changedHash.slice(0, 12)}-SM_Prop_Brazier_01.glb`,
    });

    const result = mergeCatalogWithReview(catalog([changed]), {
      ...first,
      entries: [transitionDecision(first.entries[0]!, 'skip')],
    });

    expect(result.batch.entries[0]?.decision).toBe('undecided');
    expect(result.staleSourceKeys).toHaveLength(1);
    expect(result.staleSourceKeys[0]).toContain(SOURCE_HASH);
    expect(result.staleSourceKeys[0]).toContain(
      'SourceFiles/DarkFortress/FBX/SM_Prop_Brazier_01.fbx'
    );
  });

  it('reports removed imported entries without silently inserting them', () => {
    const current = mergeCatalogWithReview(catalog()).batch;
    const stale = entry({
      source: {
        ...entry().source,
        sourcePath: 'SourceFiles/DarkFortress/FBX/SM_Prop_Removed.fbx',
      },
    });

    const result = mergeCatalogWithReview(catalog(), {
      ...current,
      entries: [...current.entries, stale],
    });

    expect(result.batch.entries).toHaveLength(1);
    expect(result.staleSourceKeys).toHaveLength(1);
    expect(result.staleSourceKeys[0]).toContain('SM_Prop_Removed.fbx');
  });

  it('rejects malformed review progress atomically', () => {
    const review = mergeCatalogWithReview(catalog()).batch;
    const malformed = {
      ...review,
      entries: [{ ...review.entries[0], unknown: true }],
    };

    expect(() =>
      mergeCatalogWithReview(
        catalog(),
        malformed as unknown as AssetReviewBatch
      )
    ).toThrow(/review entry.*keys/i);
  });

  it('sorts candidates by deterministic source path independent of catalog order', () => {
    const alpha = candidate({
      source: {
        sourcePath: 'SourceFiles/DarkFortress/FBX/A.fbx',
        glbSha256: 'b'.repeat(64),
      },
      url: `/models/synty/asset-review/${'b'.repeat(12)}-A.glb`,
      refSuffix: 'a',
    });
    const omega = candidate({
      source: {
        sourcePath: 'SourceFiles/DarkFortress/FBX/Z.fbx',
        glbSha256: 'c'.repeat(64),
      },
      url: `/models/synty/asset-review/${'c'.repeat(12)}-Z.glb`,
      refSuffix: 'z',
    });

    expect(
      mergeCatalogWithReview(catalog([omega, alpha])).batch.entries.map(
        (item) => item.source.sourcePath
      )
    ).toEqual([alpha.source.sourcePath, omega.source.sourcePath]);
  });
});

describe('filterReviewEntries', () => {
  function filterFixtures(): AssetReviewEntry[] {
    const alpha = entry({
      source: {
        ...entry().source,
        sourcePath: 'SourceFiles/DarkFortress/FBX/A_Weapon.fbx',
      },
      displayName: 'Ancient Axe',
      category: 'weapons',
      ref: 'dnd5e:weapons:dark-fortress:ancient_axe',
      refSuffix: 'ancient_axe',
      sourceFamily: 'weapons',
      browsingFamily: 'axe',
      decision: 'ready',
      loadedSuccessfully: true,
    });
    const middle = entry({
      source: {
        ...entry().source,
        sourcePath: 'SourceFiles/DarkFortress/FBX/M_Brazier.fbx',
      },
      displayName: 'Middle Fire Bowl',
      category: 'props',
      ref: 'dnd5e:props:dark-fortress:middle_brazier',
      refSuffix: 'middle_brazier',
      sourceFamily: 'props',
      browsingFamily: 'brazier',
      reviewStatus: 'material-review',
      readyEligible: false,
      reasons: ['Material review required'],
      decision: 'keep',
      loadedSuccessfully: false,
    });
    const omega = entry({
      source: {
        ...entry().source,
        sourcePath: 'SourceFiles/DarkFortress/FBX/Z_Statue.fbx',
      },
      displayName: 'Stone Guardian',
      category: 'props',
      ref: 'dnd5e:props:dark-fortress:stone_guardian',
      refSuffix: 'stone_guardian',
      sourceFamily: 'props',
      browsingFamily: 'statue',
      decision: 'skip',
    });
    return [omega, middle, alpha];
  }

  it.each([
    ['a_weapon', 'Ancient Axe'],
    ['ancient axe', 'Ancient Axe'],
    ['dark-fortress:stone_guardian', 'Stone Guardian'],
    ['brazier', 'Middle Fire Bowl'],
  ])(
    'searches source path, display name, ref, and browsing family',
    (search, name) => {
      expect(
        filterReviewEntries(filterFixtures(), { search }).map(
          (item) => item.displayName
        )
      ).toEqual([name]);
    }
  );

  it('composes category, source, status, family, and decision filters', () => {
    expect(
      filterReviewEntries(filterFixtures(), {
        search: 'fire',
        category: 'props',
        sourceFamily: 'props',
        browsingFamily: 'brazier',
        reviewStatus: 'material-review',
        decision: 'keep',
      }).map((item) => item.displayName)
    ).toEqual(['Middle Fire Bowl']);
  });

  it('finds incomplete Keep entries with needs-details', () => {
    expect(
      filterReviewEntries(filterFixtures(), {
        search: '',
        decision: 'needs-details',
      }).map((item) => item.displayName)
    ).toEqual(['Middle Fire Bowl']);
  });

  it('returns deterministic source order for filtered previous/next navigation', () => {
    expect(
      filterReviewEntries(filterFixtures(), { search: '' }).map(
        (item) => item.source.sourcePath
      )
    ).toEqual([
      'SourceFiles/DarkFortress/FBX/A_Weapon.fbx',
      'SourceFiles/DarkFortress/FBX/M_Brazier.fbx',
      'SourceFiles/DarkFortress/FBX/Z_Statue.fbx',
    ]);
  });
});

describe('portable exports', () => {
  it('serializes all review entries and decisions without local URLs', () => {
    const first = readyEntry();
    const second = entry({
      source: {
        ...entry().source,
        sourcePath: 'SourceFiles/DarkFortress/FBX/SM_Prop_Brazier_02.fbx',
        glbSha256: 'b'.repeat(64),
      },
      url: `http://localhost:5173/models/synty/asset-review/${'b'.repeat(12)}-Brazier.glb`,
      decision: 'defer',
      deferReason: 'Compare variants',
      refSuffix: 'brazier_02',
      ref: 'dnd5e:props:dark-fortress:brazier_02',
    });
    const batch: AssetReviewBatch = {
      schemaVersion: 1,
      batchId: 'portable-review',
      entries: [first, second],
    };

    const serialized = serializeReviewProgress(batch);
    const parsed = JSON.parse(serialized) as {
      entries: Array<Record<string, unknown>>;
    };

    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries.map((item) => item.decision)).toEqual([
      'ready',
      'defer',
    ]);
    expect(parsed.entries.every((item) => !('url' in item))).toBe(true);
    expect(serialized).not.toMatch(/localhost|blob:|"url"/i);
  });

  it('preserves exact zero axes across review export and import', () => {
    const reviewOnlyCatalog = catalog([
      candidate({
        readyEligible: false,
        reviewStatus: 'material-review',
        reasons: ['Flat geometry requires material review'],
        dimensionsMeters: [119.4, 0, 212.65],
      }),
    ]);
    const review = mergeCatalogWithReview(reviewOnlyCatalog).batch;

    const serialized = serializeReviewProgress(review);
    const imported = JSON.parse(serialized) as AssetReviewBatch;
    expect(imported.entries[0]?.dimensionsMeters).toEqual([119.4, 0, 212.65]);
    expect(
      mergeCatalogWithReview(reviewOnlyCatalog, imported).batch.entries[0]
        ?.dimensionsMeters
    ).toEqual([119.4, 0, 212.65]);
  });

  it.each([
    {
      label: 'eligible flat',
      dimensionsMeters: [0, 1, 1],
      readyEligible: true,
    },
    { label: 'all zero', dimensionsMeters: [0, 0, 0], readyEligible: false },
    { label: 'negative', dimensionsMeters: [-1, 1, 1], readyEligible: false },
    {
      label: 'NaN',
      dimensionsMeters: [Number.NaN, 1, 1],
      readyEligible: false,
    },
    {
      label: 'Infinity',
      dimensionsMeters: [Number.POSITIVE_INFINITY, 1, 1],
      readyEligible: false,
    },
  ])(
    'rejects $label dimensions in strict portable review parsing',
    ({ dimensionsMeters, readyEligible }) => {
      const reviewOnlyCatalog = catalog([
        candidate({
          readyEligible: false,
          reviewStatus: 'material-review',
          reasons: ['Flat geometry requires material review'],
          dimensionsMeters: [2, 0, 3],
        }),
      ]);
      const imported = JSON.parse(
        serializeReviewProgress(mergeCatalogWithReview(reviewOnlyCatalog).batch)
      ) as AssetReviewBatch;
      const importedEntry = imported.entries[0]!;
      importedEntry.dimensionsMeters =
        dimensionsMeters as AssetReviewEntry['dimensionsMeters'];
      importedEntry.readyEligible = readyEligible;
      if (readyEligible) {
        importedEntry.reviewStatus = 'trusted';
        importedEntry.reasons = [];
      }

      expect(() => mergeCatalogWithReview(reviewOnlyCatalog, imported)).toThrow(
        /dimensionsMeters/i
      );
    }
  );

  it('round-trips portable review progress through catalog merge', () => {
    const original = mergeCatalogWithReview(catalog()).batch;
    const reviewed = {
      ...original,
      entries: [
        updateProviderFields(transitionDecision(original.entries[0]!, 'keep'), {
          displayName: 'Reviewed Brazier',
          notes: 'Continue later',
        }),
      ],
    };
    const imported = JSON.parse(
      serializeReviewProgress(reviewed)
    ) as AssetReviewBatch;

    expect(mergeCatalogWithReview(catalog(), imported)).toMatchObject({
      staleSourceKeys: [],
      batch: {
        entries: [
          {
            url: candidate().url,
            decision: 'keep',
            displayName: 'Reviewed Brazier',
            notes: 'Continue later',
          },
        ],
      },
    });
  });

  it('serializes only validated Ready entries in the exact provider shape', () => {
    const ready = readyEntry({
      tags: ['dark-fortress', 'lighting'],
      supportsDecoration: false,
      notes: 'Main brazier',
    });
    const kept = entry({
      source: {
        ...entry().source,
        sourcePath: 'SourceFiles/DarkFortress/FBX/SM_Prop_Brazier_02.fbx',
        glbSha256: 'b'.repeat(64),
      },
      decision: 'keep',
    });
    const skipped = entry({
      source: {
        ...entry().source,
        sourcePath: 'SourceFiles/DarkFortress/FBX/SM_Prop_Brazier_03.fbx',
        glbSha256: 'c'.repeat(64),
      },
      decision: 'skip',
    });
    const batch: AssetReviewBatch = {
      schemaVersion: 1,
      batchId: 'dark-fortress-world-assets-v1',
      entries: [kept, ready, skipped],
    };

    const serialized = serializeReadyProviderBatch(batch);
    const parsed = JSON.parse(serialized) as {
      schemaVersion: number;
      batchId: string;
      entries: Array<Record<string, unknown>>;
    };

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.batchId).toBe('dark-fortress-world-assets-v1');
    expect(parsed.entries).toEqual([
      {
        source: ready.source,
        category: 'props',
        ref: 'dnd5e:props:dark-fortress:brazier_01',
        displayName: 'Brazier 01',
        calibration: {
          scale: 1,
          yawDegrees: 0,
          fineOffsetMeters: [0, 0, 0],
        },
        tags: ['dark-fortress', 'lighting'],
        supportsDecoration: false,
        notes: 'Main brazier',
      },
    ]);
    expect(serialized).not.toMatch(
      /localhost|blob:|"url"|"decision"|"loadedSuccessfully"/i
    );
  });

  it('refuses provider export when there are zero Ready entries', () => {
    const skipped = entry({
      source: {
        ...entry().source,
        sourcePath: 'SourceFiles/DarkFortress/FBX/SM_Prop_Brazier_02.fbx',
        glbSha256: 'b'.repeat(64),
      },
      decision: 'skip',
    });

    expect(() =>
      serializeReadyProviderBatch({
        schemaVersion: 1,
        batchId: 'empty',
        entries: [entry({ decision: 'keep' }), skipped],
      })
    ).toThrow(/at least one Ready/i);
  });

  it('refuses Ready transition and provider export for a flat review-only entry', () => {
    const reviewOnlyCatalog = catalog([
      candidate({
        readyEligible: false,
        reviewStatus: 'fx-review',
        reasons: ['Static FX preview only'],
        dimensionsMeters: [0.0000018, 0.0000016, 0],
      }),
    ]);
    const flatEntry = {
      ...mergeCatalogWithReview(reviewOnlyCatalog).batch.entries[0]!,
      decision: 'keep' as const,
      loadedSuccessfully: true,
    };

    expect(validateReady(flatEntry)).toMatchObject({
      readyEligible: expect.stringMatching(/not eligible/i),
      dimensionsMeters: expect.stringMatching(/positive/i),
    });
    expect(() => transitionDecision(flatEntry, 'ready')).toThrow(
      /not eligible|positive/i
    );
    expect(() =>
      serializeReadyProviderBatch({
        schemaVersion: 1,
        batchId: 'flat-review-only',
        entries: [{ ...flatEntry, decision: 'ready' }],
      })
    ).toThrow(/not eligible|positive/i);
  });

  it.each([
    ['calibration', { calibration: { ...readyEntry().calibration, scale: 0 } }],
    ['display name', { displayName: 'Brazier 01 ' }],
    ['full-casefolded display name', { displayName: 'downloadẞ' }],
    ['tags', { tags: ['dark fortress'] }],
    ['trailing-newline tag', { tags: ['lighting\n'] }],
  ])('revalidates invalid %s before provider export', (_case, patch) => {
    expect(() =>
      serializeReadyProviderBatch({
        schemaVersion: 1,
        batchId: 'invalid-ready',
        entries: [{ ...readyEntry(), ...patch }],
      })
    ).toThrow(/calibration\.scale|displayName|tags/i);
  });
});
