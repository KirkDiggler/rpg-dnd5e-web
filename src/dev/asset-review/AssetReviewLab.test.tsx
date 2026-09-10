import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ASSET_REVIEW_STORAGE_KEY, AssetReviewLab } from './AssetReviewLab';
import {
  mergeCatalogWithReview,
  type AssetReviewCandidate,
  type AssetReviewCatalog,
} from './model';

vi.mock('./AssetReviewScene', () => ({
  AssetReviewScene: ({
    url,
    scale,
    yawDegrees,
    fineOffsetMeters,
    onLoadStateChange,
  }: {
    url?: string;
    scale: number;
    yawDegrees: number;
    fineOffsetMeters: [number, number, number];
    onLoadStateChange: (
      url: string,
      status: 'loading' | 'success' | 'error',
      detail?: string
    ) => void;
  }) => (
    <div
      data-testid="asset-review-scene"
      data-url={url}
      data-scale={scale}
      data-yaw={yawDegrees}
      data-offset={fineOffsetMeters.join(',')}
    >
      {url && (
        <>
          <button
            type="button"
            onClick={() => onLoadStateChange(url, 'success')}
          >
            Report scene success
          </button>
          <button
            type="button"
            onClick={() => onLoadStateChange(url, 'error', 'fixture error')}
          >
            Report scene error
          </button>
          <button
            type="button"
            onClick={() =>
              onLoadStateChange(
                '/models/synty/asset-review/111111111111-A_Brazier_01.glb',
                'success'
              )
            }
          >
            Report stale palette A success
          </button>
        </>
      )}
    </div>
  ),
}));

const hashes = ['a', 'b', 'c', 'd'].map((letter) => letter.repeat(64));

function candidate(
  index: number,
  overrides: Partial<AssetReviewCandidate> = {}
): AssetReviewCandidate {
  const names = ['Brazier 01', 'Brazier 02', 'Ancient Axe', 'Magic Portal'];
  const families = ['brazier', 'brazier', 'axe', 'portal'];
  const sourceFamilies = ['props', 'props', 'weapons', 'environment'];
  const category = index === 2 ? 'weapons' : index === 3 ? 'env' : 'props';
  const sourcePath = `SourceFiles/DarkFortress/FBX/${String.fromCharCode(65 + index)}_${names[index]!.replaceAll(' ', '_')}.fbx`;
  const fileName = names[index]!.replaceAll(' ', '_');
  return {
    source: {
      packSlug: 'polygon-dark-fortress',
      packVersion: 'v3',
      sourcePath,
      glbSha256: hashes[index]!,
    },
    url: `/models/synty/asset-review/${hashes[index]!.slice(0, 12)}-${fileName}.glb`,
    sourceFamily: sourceFamilies[index]!,
    suggestedCategory: category,
    suggestedDisplayName: names[index]!,
    browsingFamily: families[index]!,
    referencePack: 'dark-fortress',
    refSuffix: names[index]!.toLocaleLowerCase().replaceAll(' ', '_'),
    dimensionsMeters: [1, 2, 1],
    readyEligible: true,
    reviewStatus: 'trusted',
    reasons: [],
    ...overrides,
  };
}

const providerBudgetReason =
  'planned runtime aggregate decoded texture size 6.0 MiB exceeds 4.5 MiB: PolygonDarkFortress_Texture_01_C=1024x1024 (4.0 MiB), Chains_Normals_01=512x512 (1.0 MiB), Chains_01=512x512 (1.0 MiB)';
const providerBlockedBrazier = candidate(1, {
  readyEligible: false,
  reviewStatus: 'trusted',
  reasons: [providerBudgetReason],
});
const blockedPortal = candidate(3, {
  readyEligible: false,
  reviewStatus: 'fx-review',
  reasons: ['Particle effect conversion required'],
});
const catalog: AssetReviewCatalog = {
  schemaVersion: 1,
  candidates: [
    candidate(2),
    blockedPortal,
    providerBlockedBrazier,
    candidate(0),
  ],
};

const downloadedBlobs: Blob[] = [];

async function blobText(blob: Blob): Promise<string> {
  if ('text' in blob && typeof blob.text === 'function') {
    return blob.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  window.localStorage.clear();
  downloadedBlobs.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => catalog })
  );
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn((blob: Blob) => {
      downloadedBlobs.push(blob);
      return `blob:asset-review-${downloadedBlobs.length}`;
    }),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

async function renderLab() {
  // Flush the async catalog hydration and its passive keyboard-handler effect
  // before a test sends a shortcut to the newly displayed selection.
  await act(async () => {
    render(<AssetReviewLab />);
  });
  await screen.findByDisplayValue(catalog.candidates[3]!.source.sourcePath);
}

function selectedSource(): HTMLInputElement {
  return screen.getByLabelText('Source path') as HTMLInputElement;
}

describe('AssetReviewLab drawer and navigation', () => {
  it('starts deterministically, shows every status count, and navigates only inside search results', async () => {
    await renderLab();

    expect(screen.getByText('Candidate 1 / 4')).toBeTruthy();
    for (const label of [
      'All (4)',
      'Undecided (4)',
      'Keep (0)',
      'Needs Details (0)',
      'Ready (0)',
      'Skip (0)',
      'Defer (0)',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }

    fireEvent.change(screen.getByLabelText('Search candidates'), {
      target: { value: 'brazier' },
    });
    const drawer = screen.getByTestId('candidate-drawer');
    expect(
      within(drawer).getAllByRole('button', { name: /Brazier/ })
    ).toHaveLength(2);
    expect(
      within(drawer).queryByRole('button', { name: /Ancient Axe/ })
    ).toBeNull();
    expect(screen.getByText('Candidate 1 / 2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next candidate' }));
    expect(selectedSource().value).toContain('B_Brazier_02');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(selectedSource().value).toContain('A_Brazier_01');

    fireEvent.click(within(drawer).getByRole('button', { name: /Brazier 02/ }));
    expect(selectedSource().value).toContain('B_Brazier_02');
  });

  it('composes category, source family, browsing family, and material-status filters', async () => {
    await renderLab();

    fireEvent.change(screen.getByLabelText('Category filter'), {
      target: { value: 'env' },
    });
    fireEvent.change(screen.getByLabelText('Source family filter'), {
      target: { value: 'environment' },
    });
    fireEvent.change(screen.getByLabelText('Browsing family filter'), {
      target: { value: 'portal' },
    });
    fireEvent.change(screen.getByLabelText('Material status filter'), {
      target: { value: 'fx-review' },
    });

    expect(screen.getByText('Candidate 1 / 1')).toBeTruthy();
    expect(selectedSource().value).toContain('D_Magic_Portal');
  });
});

describe('AssetReviewLab decisions and property sheet', () => {
  it('re-derives the read-only ref from category and keeps incomplete entries discoverable', async () => {
    await renderLab();

    fireEvent.click(screen.getByRole('radio', { name: 'Weapons' }));
    expect(
      (screen.getByLabelText('Derived ref') as HTMLInputElement).value
    ).toBe('dnd5e:weapons:dark-fortress:brazier_01');
    fireEvent.change(screen.getByLabelText('Display name'), {
      target: { value: '' },
    });
    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.getByTestId('current-decision').textContent).toBe('Keep');
    expect(
      screen.getByRole('button', { name: 'Needs Details (1)' })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Needs Details (1)' }));
    expect(screen.getByText('Candidate 1 / 1')).toBeTruthy();
    expect(selectedSource().value).toContain('A_Brazier_01');
  });

  it('uses K/Skip/Defer shortcuts and suppresses all shortcuts while typing', async () => {
    await renderLab();

    fireEvent.keyDown(window, { key: 'K' });
    expect(screen.getByTestId('current-decision').textContent).toBe('Keep');
    fireEvent.keyDown(window, { key: 's' });
    expect(selectedSource().value).toContain('B_Brazier_02');
    fireEvent.keyDown(window, { key: 'd' });
    expect(selectedSource().value).toContain('C_Ancient_Axe');

    const assertTypingSuppresses = (target: HTMLElement) => {
      target.focus();
      fireEvent.keyDown(target, { key: 's' });
      expect(selectedSource().value).toContain('C_Ancient_Axe');
    };
    assertTypingSuppresses(screen.getByLabelText('Display name'));
    assertTypingSuppresses(screen.getByLabelText('Notes'));
    assertTypingSuppresses(screen.getByLabelText('Category filter'));
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.append(editable);
    assertTypingSuppresses(editable);
    editable.remove();
  });

  it('requires successful loading and valid eligible fields for deliberate Ready, then demotes on edit', async () => {
    await renderLab();

    const ready = screen.getByRole('button', {
      name: 'Mark Ready',
    }) as HTMLButtonElement;
    expect(ready.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Display name'), {
      target: { value: '' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Report scene success' })
    );
    expect(ready.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Display name'), {
      target: { value: 'Reviewed Brazier' },
    });
    expect(ready.disabled).toBe(false);
    fireEvent.click(ready);
    expect(screen.getByTestId('current-decision').textContent).toBe('Ready');

    fireEvent.change(screen.getByLabelText('Tags'), {
      target: { value: 'lighting, fortress' },
    });
    expect(screen.getByTestId('current-decision').textContent).toBe('Keep');

    fireEvent.click(screen.getByRole('button', { name: /Brazier 02/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Report scene success' })
    );
    expect(
      (screen.getByRole('button', { name: 'Mark Ready' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(screen.getByText(providerBudgetReason)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Magic Portal/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Report scene success' })
    );
    expect(
      (screen.getByRole('button', { name: 'Mark Ready' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      screen.getByText('Particle effect conversion required')
    ).toBeTruthy();
  });

  it('shows exact casefold and trailing-newline tag blockers before Mark Ready', async () => {
    const stored = mergeCatalogWithReview(catalog).batch;
    stored.entries[0] = {
      ...stored.entries[0]!,
      decision: 'keep',
      loadedSuccessfully: true,
      tags: ['lighting\n'],
    };
    window.localStorage.setItem(
      ASSET_REVIEW_STORAGE_KEY,
      JSON.stringify(stored)
    );

    await renderLab();

    const ready = screen.getByRole('button', {
      name: 'Mark Ready',
    }) as HTMLButtonElement;
    const displayName = screen.getByLabelText('Display name');
    const tags = screen.getByLabelText('Tags') as HTMLInputElement;

    expect(ready.disabled).toBe(true);
    expect(
      screen.getAllByText(/Each tag must match lowercase/).length
    ).toBeGreaterThan(0);

    fireEvent.change(tags, { target: { value: 'lighting-safe' } });
    expect(ready.disabled).toBe(false);
    fireEvent.change(displayName, { target: { value: 'downloadẞ' } });
    expect(ready.disabled).toBe(true);
    expect(
      screen.getAllByText(/source-path or URI markers/).length
    ).toBeGreaterThan(0);

    fireEvent.change(displayName, { target: { value: 'fıle:' } });
    expect(ready.disabled).toBe(false);
    fireEvent.click(ready);
    expect(screen.getByTestId('current-decision').textContent).toBe('Ready');
  });

  it('shows provider metadata blockers, accepts Unicode, and exports valid tags in authored order', async () => {
    await renderLab();

    fireEvent.click(
      screen.getByRole('button', { name: 'Report scene success' })
    );
    const ready = screen.getByRole('button', {
      name: 'Mark Ready',
    }) as HTMLButtonElement;
    const displayName = screen.getByLabelText('Display name');
    const tags = screen.getByLabelText('Tags') as HTMLInputElement;

    fireEvent.change(displayName, { target: { value: 'Brazier 01 ' } });
    expect(ready.disabled).toBe(true);
    expect(
      screen.getAllByText(/leading or trailing whitespace/i).length
    ).toBeGreaterThan(0);

    fireEvent.change(displayName, { target: { value: '火鉢 😀' } });
    expect(ready.disabled).toBe(false);

    for (const [invalidTags, blocker] of [
      ['Lighting', /Each tag must match lowercase/],
      ['dark fortress', /Each tag must match lowercase/],
      [`a${'b'.repeat(40)}`, /Each tag must match lowercase/],
      ['lighting, lighting', /Tags must contain unique tags/],
      [
        Array.from({ length: 21 }, (_, index) => `tag-${index}`).join(', '),
        /Tags must contain at most 20 tags/,
      ],
    ] as const) {
      fireEvent.change(tags, { target: { value: invalidTags } });
      expect(ready.disabled).toBe(true);
      expect(screen.getAllByText(blocker).length).toBeGreaterThan(0);
    }

    fireEvent.change(tags, {
      target: { value: 'lighting, dark-fortress, large_prop' },
    });
    expect(tags.value).toBe('lighting, dark-fortress, large_prop');
    expect(ready.disabled).toBe(false);
    fireEvent.click(ready);
    fireEvent.click(
      screen.getByRole('button', { name: 'Export Ready provider JSON' })
    );

    const exported = JSON.parse(await blobText(downloadedBlobs.at(-1)!)) as {
      entries: Array<{ displayName: string; tags: string[] }>;
    };
    expect(exported.entries).toMatchObject([
      {
        displayName: '火鉢 😀',
        tags: ['lighting', 'dark-fortress', 'large_prop'],
      },
    ]);
  });

  it('renders flat review-only bounds exactly and keeps navigation responsive', async () => {
    const flatReason =
      'SM_Env_Grunge_03 slot 0 (Grunge_01): non-default material has no exact reviewed override';
    const fxReason =
      'effects are exported as neutral static previews and are never ready-eligible';
    const flat = candidate(1, {
      source: {
        ...candidate(1).source,
        sourcePath: 'SourceFiles/DarkFortress/FBX/SM_Env_Grunge_03.fbx',
      },
      sourceFamily: 'environment',
      suggestedCategory: 'env',
      suggestedDisplayName: 'Grunge 03',
      browsingFamily: 'grunge',
      refSuffix: 'grunge_03',
      dimensionsMeters: [119.39999389648438, 0, 212.65313720703125],
      readyEligible: false,
      reviewStatus: 'material-review',
      reasons: [flatReason],
    });
    const tinyFx = candidate(3, {
      source: {
        ...candidate(3).source,
        sourcePath: 'SourceFiles/DarkFortress/FBX/FX_SM_Prop_Candle_01.fbx',
      },
      sourceFamily: 'effects',
      suggestedCategory: 'env',
      suggestedDisplayName: 'SM Prop Candle 01',
      browsingFamily: 'sm_prop_candle',
      refSuffix: 'sm_prop_candle_01',
      dimensionsMeters: [0.0000018477439880371094, 0.0000016391277313232422, 0],
      readyEligible: false,
      reviewStatus: 'fx-review',
      reasons: [fxReason],
    });
    const flatCatalog: AssetReviewCatalog = {
      schemaVersion: 1,
      candidates: [candidate(0), flat, tinyFx],
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => flatCatalog,
    } as Response);

    render(<AssetReviewLab />);
    await screen.findByDisplayValue(
      flatCatalog.candidates[0]!.source.sourcePath
    );
    fireEvent.click(
      within(screen.getByTestId('candidate-drawer')).getByRole('button', {
        name: /SM Prop Candle 01/,
      })
    );
    expect(selectedSource().value).toBe(tinyFx.source.sourcePath);
    expect(
      (screen.getByLabelText('Measured bounds') as HTMLInputElement).value
    ).toBe('0.0000018477439880371094 × 0.0000016391277313232422 × 0');
    expect(screen.getByText(fxReason)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Report scene success' })
    );
    expect(
      (screen.getByRole('button', { name: 'Mark Ready' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Next candidate' }));
    expect(selectedSource().value).toBe(flat.source.sourcePath);
    expect(
      (screen.getByLabelText('Measured bounds') as HTMLInputElement).value
    ).toBe('119.39999389648438 × 0 × 212.65313720703125');
    expect(screen.getByText(flatReason)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous candidate' }));
    expect(selectedSource().value).toBe(tinyFx.source.sourcePath);
  });

  it('autosaves edits and decisions in portable review progress', async () => {
    await renderLab();

    const supportsDecoration = screen.getByRole('checkbox', {
      name: 'Supports decorations',
    }) as HTMLInputElement;
    expect(supportsDecoration.checked).toBe(false);
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Strong silhouette' },
    });
    fireEvent.change(screen.getByLabelText('Defer reason'), {
      target: { value: 'Compare the other bowl' },
    });
    fireEvent.change(screen.getByLabelText('Scale value'), {
      target: { value: '1.25' },
    });
    fireEvent.change(screen.getByLabelText('Base yaw value'), {
      target: { value: '45' },
    });
    fireEvent.change(screen.getByLabelText('Fine offset X'), {
      target: { value: '0.1' },
    });
    fireEvent.click(supportsDecoration);
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));

    const scene = screen.getByTestId('asset-review-scene');
    expect(scene.dataset.scale).toBe('1.25');
    expect(scene.dataset.yaw).toBe('45');
    expect(scene.dataset.offset).toBe('0.1,0,0');
    await waitFor(() => {
      const saved = window.localStorage.getItem(ASSET_REVIEW_STORAGE_KEY);
      expect(saved).toContain('Strong silhouette');
      expect(saved).toContain('Compare the other bowl');
      expect(saved).toContain('"supportsDecoration": true');
      expect(saved).toContain('"decision": "keep"');
      expect(saved).not.toContain('"url"');
    });
  });

  it('rejects malformed imports atomically without replacing the current review', async () => {
    await renderLab();
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Preserve this' },
    });
    const file = new File(['{"schemaVersion":1,"entries":[]}'], 'bad.json', {
      type: 'application/json',
    });

    fireEvent.change(screen.getByLabelText('Import review JSON'), {
      target: { files: [file] },
    });

    expect((await screen.findByRole('alert')).textContent).toMatch(
      /Import failed/i
    );
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe(
      'Preserve this'
    );
  });

  it('exports every review decision but only Ready entries to the provider file', async () => {
    await renderLab();
    fireEvent.click(
      screen.getByRole('button', { name: 'Report scene success' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark Ready' }));
    fireEvent.click(screen.getByRole('button', { name: /Brazier 02/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    fireEvent.click(screen.getByRole('button', { name: 'Export review JSON' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Export Ready provider JSON' })
    );

    expect(downloadedBlobs).toHaveLength(2);
    const review = JSON.parse(await blobText(downloadedBlobs[0]!)) as {
      entries: Array<{ decision: string }>;
    };
    const provider = JSON.parse(await blobText(downloadedBlobs[1]!)) as {
      entries: Array<Record<string, unknown>>;
    };
    expect(review.entries).toHaveLength(4);
    expect(review.entries.map((entry) => entry.decision)).toContain('ready');
    expect(review.entries.map((entry) => entry.decision)).toContain('skip');
    expect(provider.entries).toHaveLength(1);
    expect(provider.entries[0]).not.toHaveProperty('decision');
    expect(provider.entries[0]).not.toHaveProperty('url');
  });
});

const PALETTE_A_URL =
  '/models/synty/asset-review/111111111111-A_Brazier_01.glb';
const PALETTE_B_URL =
  '/models/synty/asset-review/222222222222-A_Brazier_01.glb';

function paletteAlternative(palette: 'A' | 'B') {
  const hash = (palette === 'A' ? '1' : '2').repeat(64);
  return {
    descriptorVersion: 1,
    comparisonId: 'braziers',
    palette,
    paletteDescriptor: {
      path: `palette-variants/braziers/${palette}/palette.json`,
      sha256: '3'.repeat(64),
    },
    packConfigSha256: '4'.repeat(64),
    atlas: {
      path: `SourceFiles/DarkFortress/Texture/Atlas_${palette}.png`,
      sha256: '5'.repeat(64),
    },
    selectedGlb: {
      path: `palette-variants/braziers/${palette}/glbs/models/SourceFiles/DarkFortress/FBX/A_Brazier_01.glb`,
      sha256: hash,
    },
    url: palette === 'A' ? PALETTE_A_URL : PALETTE_B_URL,
    dimensionsMeters: palette === 'A' ? [2, 3, 4] : [4, 5, 6],
    plannedRuntimeImages: [
      {
        index: 0,
        name: `Atlas_${palette}`,
        sourceWidth: 64,
        sourceHeight: 64,
        width: 64,
        height: 64,
        decodedBytes: 16384,
        decodedMiB: 0.016,
      },
    ],
    readyEligible: true,
    reasons: [],
  };
}

async function renderPaletteLab() {
  const v2Catalog = {
    schemaVersion: 2,
    candidates: [
      {
        ...candidate(0),
        paletteAlternatives: [paletteAlternative('B'), paletteAlternative('A')],
      },
    ],
  } as unknown as AssetReviewCatalog;
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => v2Catalog,
  } as Response);
  await act(async () => {
    render(<AssetReviewLab />);
  });
  await screen.findByDisplayValue(v2Catalog.candidates[0]!.source.sourcePath);
}

describe('AssetReviewLab palette appearances and batch controls', () => {
  it('offers one sorted palette control and requires the newly selected GLB to load', async () => {
    await renderPaletteLab();

    const palette = screen.getByLabelText('Palette');
    expect(screen.getAllByLabelText('Palette')).toHaveLength(1);
    expect(
      within(palette)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Original / default', 'A', 'B']);
    fireEvent.change(palette, { target: { value: 'braziers\u0000A' } });
    expect(screen.getByTestId('asset-review-scene').dataset.url).toBe(
      PALETTE_A_URL
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Report scene success' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark Ready' }));
    fireEvent.change(palette, { target: { value: 'braziers\u0000B' } });

    expect(screen.getByTestId('current-decision').textContent).toBe('Keep');
    expect(
      (screen.getByRole('button', { name: 'Mark Ready' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(screen.getByTestId('asset-review-scene').dataset.url).toBe(
      PALETTE_B_URL
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Report stale palette A success' })
    );
    expect(
      (screen.getByRole('button', { name: 'Mark Ready' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Report scene success' })
    );
    expect(
      (screen.getByRole('button', { name: 'Mark Ready' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Mark Ready' }));
    fireEvent.click(screen.getByRole('button', { name: 'Report scene error' }));
    expect(screen.getByTestId('current-decision').textContent).toBe('Keep');
  });

  it('edits, validates, and explicitly generates a collision-safe batch ID', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '123e4567-e89b-12d3-a456-426614174000'
    );
    await renderPaletteLab();

    const batchId = screen.getByLabelText('Batch ID') as HTMLInputElement;
    fireEvent.change(batchId, { target: { value: 'bad batch id' } });
    expect(screen.getByText(/Batch ID has an invalid format/i)).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Export review JSON',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.change(batchId, { target: { value: 'edited-batch' } });
    expect(
      (
        screen.getByRole('button', {
          name: 'Export review JSON',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Generate batch ID' }));
    expect(batchId.value).toMatch(
      /^dark-fortress-world-assets-\d{8}-123e4567-e89b-12d3-a456-426614174000$/
    );
  });

  it('downloads schema-v2 provider selection without local preview fields', async () => {
    await renderPaletteLab();
    fireEvent.change(screen.getByLabelText('Palette'), {
      target: { value: 'braziers\u0000A' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Report scene success' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark Ready' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Export Ready provider JSON' })
    );

    const text = await blobText(downloadedBlobs.at(-1)!);
    const provider = JSON.parse(text);
    expect(provider.schemaVersion).toBe(2);
    expect(provider.entries[0].source.glbSha256).toBe(hashes[0]);
    expect(provider.entries[0].paletteSelection.selectedGlb.sha256).toBe(
      '1'.repeat(64)
    );
    expect(text).not.toMatch(/"url"|localhost|blob:/i);
  });
});
