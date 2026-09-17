import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ASSET_REVIEW_STORAGE_KEY, AssetReviewLab } from './AssetReviewLab';
import {
  mergeCatalogWithReview,
  serializeReviewProgress,
  type AssetReviewCandidate,
  type AssetReviewCatalog,
} from './model';

const sceneHarness = vi.hoisted(() => ({
  onLayout: undefined as (() => void) | undefined,
  callbacks: [] as Array<
    (
      url: string,
      status: 'loading' | 'success' | 'error',
      detail?: string
    ) => void
  >,
}));

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
  }) => {
    sceneHarness.callbacks.push(onLoadStateChange);
    useLayoutEffect(() => {
      sceneHarness.onLayout?.();
    });
    return (
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
    );
  },
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

const SOURCES_URL = '/models/synty/asset-review/sources.json';
const LEGACY_CATALOG_URL = '/models/synty/asset-review/catalog.json';
const AUTHORED_CATALOG_URL = '/models/synty/asset-review/authored/catalog.json';

/** Legacy no-index mode: sources.json 404s and the legacy catalogue serves. */
function stubCatalogFetch(payload: unknown): void {
  vi.mocked(fetch).mockImplementation(((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === SOURCES_URL) {
      return Promise.resolve({
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: async () => payload,
    } as Response);
  }) as typeof fetch);
}

/** Indexed mode: respond per prepared URL; unknown URLs 404. */
function stubUrlFetch(
  responses: Record<
    string,
    {
      ok?: boolean;
      status?: number;
      body?: unknown;
      json?: () => Promise<unknown>;
    }
  >
): void {
  vi.mocked(fetch).mockImplementation(((input: RequestInfo | URL) => {
    const url = String(input);
    const match = responses[url];
    if (!match) {
      return Promise.resolve({
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response);
    }
    return Promise.resolve({
      ok: match.ok ?? true,
      status: match.status ?? 200,
      json: match.json ?? (async () => match.body),
    } as Response);
  }) as typeof fetch);
}

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
  sceneHarness.onLayout = undefined;
  window.localStorage.clear();
  downloadedBlobs.length = 0;
  sceneHarness.callbacks.length = 0;
  vi.stubGlobal('fetch', vi.fn());
  stubCatalogFetch(catalog);
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
  it('generates a fresh ID for a new review instead of reusing the first published batch', async () => {
    await renderLab();
    const id = (screen.getByLabelText('Batch ID') as HTMLInputElement).value;
    expect(id).toMatch(/^dark-fortress-world-assets-\d{8}-[0-9a-f-]+$/);
    expect(id).not.toBe('dark-fortress-world-assets-v1');
  });

  it('preserves a saved batch ID and its reviewed orientation', async () => {
    const saved = mergeCatalogWithReview(catalog).batch;
    saved.batchId = 'existing-reviewed-batch';
    saved.entries[0]!.calibration.yawDegrees = -136;
    window.localStorage.setItem(
      ASSET_REVIEW_STORAGE_KEY,
      JSON.stringify(saved)
    );
    await renderLab();
    expect((screen.getByLabelText('Batch ID') as HTMLInputElement).value).toBe(
      'existing-reviewed-batch'
    );
    expect(
      JSON.parse(window.localStorage.getItem(ASSET_REVIEW_STORAGE_KEY)!)
        .entries[0].calibration.yawDegrees
    ).toBe(-136);
  });

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
    stubCatalogFetch(flatCatalog);

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
  stubCatalogFetch(v2Catalog);
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

const AUTHORED_FLOOR_HASH = 'f'.repeat(64);
const AUTHORED_DOOR_HASH = 'e'.repeat(64);
const SHARED_URL = '/models/synty/asset-review/999999999999-Shared.glb';
const LEGACY_SCOPED_KEY = 'rpg.asset-review.batch.v2:dark-fortress-legacy';
const AUTHORED_SCOPED_KEY = 'rpg.asset-review.batch.v2:authored-trial';

function authoredSourceFixture(sourcePath: string, glbSha256: string) {
  const name = sourcePath.split('/').at(-1)!.slice(0, -4);
  return {
    kind: 'authored-glb' as const,
    packSlug: 'authored-trial',
    packVersion: 'v1',
    sourcePath,
    glbSha256,
    capture: { path: `captures/${name}.json`, sha256: 'c'.repeat(64) },
  };
}

function authoredFloorCandidate(
  overrides: Partial<AssetReviewCandidate> = {}
): AssetReviewCandidate {
  return {
    source: authoredSourceFixture('floor-tile.glb', AUTHORED_FLOOR_HASH),
    url: `/models/synty/asset-review/${AUTHORED_FLOOR_HASH.slice(0, 12)}-floor-tile.glb`,
    sourceFamily: 'floor',
    suggestedCategory: 'env',
    suggestedDisplayName: 'Floor Tile',
    browsingFamily: 'floor',
    referencePack: 'authored-trial',
    refSuffix: 'floor_tile',
    dimensionsMeters: [2, 0.25, 2],
    readyEligible: true,
    reviewStatus: 'authored',
    reasons: [],
    ...overrides,
  };
}

function authoredDoorCandidate(): AssetReviewCandidate {
  return authoredFloorCandidate({
    source: authoredSourceFixture('doors/double-door.glb', AUTHORED_DOOR_HASH),
    url: `/models/synty/asset-review/${AUTHORED_DOOR_HASH.slice(0, 12)}-double-door.glb`,
    sourceFamily: 'door',
    suggestedDisplayName: 'Double Door',
    browsingFamily: 'door',
    refSuffix: 'double_door',
  });
}

function sourcesIndex(defaultSourceId = 'dark-fortress-legacy') {
  return {
    schemaVersion: 1,
    defaultSourceId,
    sources: [
      {
        id: 'dark-fortress-legacy',
        label: 'Dark Fortress library',
        kind: 'converted-fbx' as const,
        catalogUrl: LEGACY_CATALOG_URL,
      },
      {
        id: 'authored-trial',
        label: 'Authored GLB trial',
        kind: 'authored-glb' as const,
        catalogUrl: AUTHORED_CATALOG_URL,
      },
    ],
  };
}

function stubIndexedFetch(
  options: {
    defaultSourceId?: string;
    legacyCatalog?: unknown;
    authoredCatalog?: unknown;
    index?: unknown;
  } = {}
): void {
  stubUrlFetch({
    [SOURCES_URL]: {
      json: async () => options.index ?? sourcesIndex(options.defaultSourceId),
    },
    [LEGACY_CATALOG_URL]: {
      json: async () => options.legacyCatalog ?? catalog,
    },
    [AUTHORED_CATALOG_URL]: {
      json: async () =>
        options.authoredCatalog ?? {
          schemaVersion: 3,
          candidates: [
            authoredFloorCandidate(),
            authoredDoorCandidate(),
            authoredFloorCandidate({
              source: authoredSourceFixture('z-broken.glb', 'b'.repeat(64)),
              url: `/models/synty/asset-review/bbbbbbbbbbbb-z-broken.glb`,
              suggestedDisplayName: 'Broken Preview',
              browsingFamily: 'broken',
              refSuffix: 'z_broken',
              sourceFamily: 'broken',
              readyEligible: false,
              reasons: ['Authored preview failed to load'],
            }),
          ],
        },
    },
  });
}

async function switchToSource(value: string): Promise<void> {
  fireEvent.change(screen.getByLabelText('Review source'), {
    target: { value },
  });
}

describe('AssetReviewLab indexed sources', () => {
  it('persists a retiring render only under its own source during a switch', async () => {
    stubIndexedFetch();
    render(<AssetReviewLab />);
    await screen.findByDisplayValue(catalog.candidates[3]!.source.sourcePath);
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    // Switch after the edited legacy render commits, before its passive
    // persistence effects run: the same ordering seen in the real browser.
    sceneHarness.onLayout = () => {
      sceneHarness.onLayout = undefined;
      fireEvent.change(screen.getByLabelText('Review source'), {
        target: { value: 'authored-trial' },
      });
    };
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Legacy edit immediately before switch' },
    });
    await screen.findByDisplayValue('doors/double-door.glb');
    fireEvent.click(screen.getByText('Report scene success'));
    await waitFor(() => {
      expect(window.localStorage.getItem(AUTHORED_SCOPED_KEY)).not.toBeNull();
    });
    for (const [key, value] of writes.mock.calls) {
      if (key === AUTHORED_SCOPED_KEY) {
        expect(JSON.parse(value).schemaVersion).toBe(3);
      }
      if (key === 'rpg.asset-review.context.v1:authored-trial') {
        expect(JSON.parse(value).selectedKey).not.toContain('.fbx');
      }
    }
    expect(screen.queryByText(/stale imported source/)).toBeNull();
  });

  it('switches sources, isolates drafts and filters per source, and remembers the selection', async () => {
    stubIndexedFetch();
    const view = render(<AssetReviewLab />);
    await screen.findByDisplayValue(catalog.candidates[3]!.source.sourcePath);

    const picker = screen.getByLabelText('Review source') as HTMLSelectElement;
    expect([...picker.options].map((option) => option.value)).toEqual([
      'dark-fortress-legacy',
      'authored-trial',
    ]);
    expect(screen.getByTestId('active-source').textContent).toContain(
      'Dark Fortress library'
    );

    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Legacy note' },
    });
    fireEvent.change(screen.getByLabelText('Search candidates'), {
      target: { value: 'brazier' },
    });

    await act(async () => {
      switchToSource('authored-trial');
    });
    await screen.findByDisplayValue('doors/double-door.glb');
    expect(screen.getByTestId('active-source').textContent).toContain(
      'authored-glb'
    );
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe(
      ''
    );
    expect(
      (screen.getByLabelText('Search candidates') as HTMLInputElement).value
    ).toBe('');
    expect(window.localStorage.getItem('rpg.asset-review.source.v1')).toBe(
      'authored-trial'
    );

    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Authored note' },
    });
    await waitFor(() => {
      expect(window.localStorage.getItem(AUTHORED_SCOPED_KEY)).toContain(
        'Authored note'
      );
    });

    view.unmount();
    stubIndexedFetch();
    render(<AssetReviewLab />);
    await screen.findByDisplayValue('doors/double-door.glb');

    await act(async () => {
      switchToSource('dark-fortress-legacy');
    });
    await screen.findByDisplayValue(catalog.candidates[3]!.source.sourcePath);
    expect(
      (screen.getByLabelText('Search candidates') as HTMLInputElement).value
    ).toBe('brazier');
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe(
      'Legacy note'
    );
  });

  it('migrates the legacy draft to the unique legacy source and retains the original JSON', async () => {
    const legacyBatch = mergeCatalogWithReview(catalog).batch;
    legacyBatch.batchId = 'legacy-reviewed-batch';
    const legacySaved = serializeReviewProgress(legacyBatch);
    window.localStorage.setItem(ASSET_REVIEW_STORAGE_KEY, legacySaved);

    stubIndexedFetch({ defaultSourceId: 'authored-trial' });
    render(<AssetReviewLab />);
    await screen.findByDisplayValue('doors/double-door.glb');

    expect(window.localStorage.getItem(LEGACY_SCOPED_KEY)).toBeTruthy();
    expect(window.localStorage.getItem(LEGACY_SCOPED_KEY)).toContain(
      'legacy-reviewed-batch'
    );
    expect(window.localStorage.getItem(ASSET_REVIEW_STORAGE_KEY)).toBe(
      legacySaved
    );
    // The pristine authored batch must not occupy the scoped key before the
    // user edits anything (pristine drafts never block migration).
    expect(window.localStorage.getItem(AUTHORED_SCOPED_KEY)).toBeNull();
    expect(screen.getByText(/Migrated the legacy review draft/i)).toBeTruthy();
    expect(
      screen.getByText(/retained under rpg\.asset-review\.batch\.v1/i)
    ).toBeTruthy();

    await act(async () => {
      switchToSource('dark-fortress-legacy');
    });
    await screen.findByDisplayValue(catalog.candidates[3]!.source.sourcePath);
    expect((screen.getByLabelText('Batch ID') as HTMLInputElement).value).toBe(
      'legacy-reviewed-batch'
    );
  });

  it('keeps the legacy draft as a recoverable backup when the legacy source is ambiguous', async () => {
    const legacyBatch = mergeCatalogWithReview(catalog).batch;
    const legacySaved = serializeReviewProgress(legacyBatch);
    window.localStorage.setItem(ASSET_REVIEW_STORAGE_KEY, legacySaved);

    stubUrlFetch({
      [SOURCES_URL]: {
        json: async () => ({
          schemaVersion: 1,
          defaultSourceId: 'legacy-a',
          sources: [
            {
              id: 'legacy-a',
              label: 'Legacy A',
              kind: 'converted-fbx',
              catalogUrl: LEGACY_CATALOG_URL,
            },
            {
              id: 'legacy-b',
              label: 'Legacy B',
              kind: 'converted-fbx',
              catalogUrl: LEGACY_CATALOG_URL,
            },
          ],
        }),
      },
      [LEGACY_CATALOG_URL]: { json: async () => catalog },
    });
    render(<AssetReviewLab />);
    await screen.findByDisplayValue(catalog.candidates[3]!.source.sourcePath);

    expect(window.localStorage.getItem(ASSET_REVIEW_STORAGE_KEY)).toBe(
      legacySaved
    );
    expect(
      window.localStorage.getItem('rpg.asset-review.batch.v2:legacy-a')
    ).toBeNull();
    expect(
      window.localStorage.getItem('rpg.asset-review.batch.v2:legacy-b')
    ).toBeNull();
    expect(screen.getByText(/kept without migration.*found 2\./i)).toBeTruthy();
  });

  it('ignores a late catalogue response from a previous source', async () => {
    let resolveLegacy!: (response: Response) => void;
    const legacyGate = new Promise<Response>((resolve) => {
      resolveLegacy = resolve;
    });
    vi.mocked(fetch).mockImplementation(((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === SOURCES_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => sourcesIndex(),
        } as Response);
      }
      if (url === AUTHORED_CATALOG_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            schemaVersion: 3,
            candidates: [authoredFloorCandidate(), authoredDoorCandidate()],
          }),
        } as Response);
      }
      if (url === LEGACY_CATALOG_URL) return legacyGate;
      return Promise.resolve({
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response);
    }) as typeof fetch);

    render(<AssetReviewLab />);
    await screen.findByText(/Loading asset-review catalog…/);
    expect(
      screen.getByLabelText('Review source') as HTMLSelectElement
    ).toBeTruthy();

    await act(async () => {
      switchToSource('authored-trial');
    });
    await screen.findByDisplayValue('doors/double-door.glb');

    await act(async () => {
      resolveLegacy({
        ok: true,
        json: async () => catalog,
      } as Response);
    });
    expect(screen.getByDisplayValue('doors/double-door.glb')).toBeTruthy();
    expect(
      screen.queryByDisplayValue(catalog.candidates[3]!.source.sourcePath)
    ).toBeNull();
  });

  it('ignores delayed import success after switching sources', async () => {
    stubIndexedFetch();
    render(<AssetReviewLab />);
    await screen.findByDisplayValue(catalog.candidates[3]!.source.sourcePath);

    let resolveRead!: (value: string) => void;
    const file = {
      text: () =>
        new Promise<string>((resolve) => {
          resolveRead = resolve;
        }),
    } as unknown as File;
    fireEvent.change(screen.getByLabelText('Import review JSON'), {
      target: { files: [file] },
    });

    await act(async () => {
      switchToSource('authored-trial');
    });
    await screen.findByDisplayValue('doors/double-door.glb');
    resolveRead(JSON.stringify(mergeCatalogWithReview(catalog).batch));

    await waitFor(() => {
      expect(screen.getByDisplayValue('doors/double-door.glb')).toBeTruthy();
    });
    expect(
      screen.queryByDisplayValue(catalog.candidates[3]!.source.sourcePath)
    ).toBeNull();
    expect(screen.queryByText(/Import failed/i)).toBeNull();
  });

  it('ignores delayed import errors after switching sources', async () => {
    stubIndexedFetch();
    render(<AssetReviewLab />);
    await screen.findByDisplayValue(catalog.candidates[3]!.source.sourcePath);

    let rejectRead!: (error: Error) => void;
    const file = {
      text: () =>
        new Promise<string>((_resolve, reject) => {
          rejectRead = reject;
        }),
    } as unknown as File;
    fireEvent.change(screen.getByLabelText('Import review JSON'), {
      target: { files: [file] },
    });

    await act(async () => {
      switchToSource('authored-trial');
    });
    await screen.findByDisplayValue('doors/double-door.glb');
    rejectRead(new Error('late read failure'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('doors/double-door.glb')).toBeTruthy();
    });
    expect(screen.queryByText(/Import failed/i)).toBeNull();
  });

  it('rejects same-URL callbacks from an older source generation after A to B to A', async () => {
    const sharedLegacy = candidate(0, {
      source: {
        ...candidate(0).source,
        sourcePath: 'SourceFiles/DarkFortress/FBX/A0_Shared.fbx',
        glbSha256: '9'.repeat(64),
      },
      url: SHARED_URL,
      suggestedDisplayName: 'Shared',
      browsingFamily: 'shared',
      refSuffix: 'shared',
    });
    const sharedAuthored = authoredFloorCandidate({
      source: authoredSourceFixture('a-shared.glb', '9'.repeat(64)),
      url: SHARED_URL,
      suggestedDisplayName: 'Shared Authored',
      browsingFamily: 'shared',
      refSuffix: 'shared',
      sourceFamily: 'shared',
    });
    stubIndexedFetch({
      legacyCatalog: {
        schemaVersion: 1,
        candidates: [sharedLegacy, ...catalog.candidates],
      },
      authoredCatalog: {
        schemaVersion: 3,
        candidates: [sharedAuthored, authoredDoorCandidate()],
      },
    });

    render(<AssetReviewLab />);
    await screen.findByDisplayValue(
      'SourceFiles/DarkFortress/FBX/A0_Shared.fbx'
    );
    const staleCallback = sceneHarness.callbacks.at(-1)!;

    await act(async () => {
      switchToSource('authored-trial');
    });
    await screen.findByDisplayValue('a-shared.glb');
    const activeCallback = sceneHarness.callbacks.at(-1)!;
    expect(activeCallback).not.toBe(staleCallback);

    expect(
      (screen.getByRole('button', { name: 'Mark Ready' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    act(() => staleCallback(SHARED_URL, 'success'));
    expect(
      (screen.getByRole('button', { name: 'Mark Ready' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(screen.getByText(/Model:/).textContent).toContain('not loaded');

    act(() => activeCallback(SHARED_URL, 'success'));
    expect(
      (screen.getByRole('button', { name: 'Mark Ready' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });

  it('rejects same-URL callbacks from an older source generation after A to B to A', async () => {
    const sharedLegacy = candidate(0, {
      source: {
        ...candidate(0).source,
        sourcePath: 'SourceFiles/DarkFortress/FBX/A0_Shared.fbx',
        glbSha256: '9'.repeat(64),
      },
      url: SHARED_URL,
      suggestedDisplayName: 'Shared',
      browsingFamily: 'shared',
      refSuffix: 'shared',
    });
    const sharedAuthored = authoredFloorCandidate({
      source: authoredSourceFixture('a-shared.glb', '9'.repeat(64)),
      url: SHARED_URL,
      suggestedDisplayName: 'Shared Authored',
      browsingFamily: 'shared',
      refSuffix: 'shared',
      sourceFamily: 'shared',
    });
    stubIndexedFetch({
      legacyCatalog: {
        schemaVersion: 1,
        candidates: [sharedLegacy, ...catalog.candidates],
      },
      authoredCatalog: {
        schemaVersion: 3,
        candidates: [sharedAuthored, authoredDoorCandidate()],
      },
    });

    render(<AssetReviewLab />);
    await screen.findByDisplayValue(
      'SourceFiles/DarkFortress/FBX/A0_Shared.fbx'
    );
    const firstCallback = sceneHarness.callbacks.at(-1)!;

    await act(async () => {
      switchToSource('authored-trial');
    });
    await screen.findByDisplayValue('a-shared.glb');
    await act(async () => {
      switchToSource('dark-fortress-legacy');
    });
    await screen.findByDisplayValue(
      'SourceFiles/DarkFortress/FBX/A0_Shared.fbx'
    );
    const currentCallback = sceneHarness.callbacks.at(-1)!;
    expect(currentCallback).not.toBe(firstCallback);

    expect(
      (screen.getByRole('button', { name: 'Mark Ready' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    act(() => firstCallback(SHARED_URL, 'success'));
    expect(
      (screen.getByRole('button', { name: 'Mark Ready' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(screen.getByText(/Model:/).textContent).toContain('not loaded');

    act(() => currentCallback(SHARED_URL, 'success'));
    expect(
      (screen.getByRole('button', { name: 'Mark Ready' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });

  it('rejects same-URL callbacks from an older source generation after reload', async () => {
    const shared = candidate(0, {
      source: {
        ...candidate(0).source,
        sourcePath: 'SourceFiles/DarkFortress/FBX/A0_Shared.fbx',
        glbSha256: '9'.repeat(64),
      },
      url: SHARED_URL,
      suggestedDisplayName: 'Shared',
      browsingFamily: 'shared',
      refSuffix: 'shared',
    });
    stubIndexedFetch({
      legacyCatalog: {
        schemaVersion: 1,
        candidates: [shared, ...catalog.candidates],
      },
    });

    const view = render(<AssetReviewLab />);
    await screen.findByDisplayValue(
      'SourceFiles/DarkFortress/FBX/A0_Shared.fbx'
    );
    const oldCallback = sceneHarness.callbacks.at(-1)!;
    view.unmount();

    render(<AssetReviewLab />);
    await screen.findByDisplayValue(
      'SourceFiles/DarkFortress/FBX/A0_Shared.fbx'
    );
    const currentCallback = sceneHarness.callbacks.at(-1)!;
    expect(currentCallback).not.toBe(oldCallback);

    expect(
      (screen.getByRole('button', { name: 'Mark Ready' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    act(() => oldCallback(SHARED_URL, 'success'));
    expect(
      (screen.getByRole('button', { name: 'Mark Ready' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);

    act(() => currentCallback(SHARED_URL, 'success'));
    expect(
      (screen.getByRole('button', { name: 'Mark Ready' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });
});

describe('AssetReviewLab authored v3 flow', () => {
  it('reviews authored candidates and exports schema-v3 Ready JSON', async () => {
    stubIndexedFetch({ defaultSourceId: 'authored-trial' });
    render(<AssetReviewLab />);
    await screen.findByDisplayValue('doors/double-door.glb');

    const drawer = screen.getByTestId('candidate-drawer');
    expect(
      within(screen.getByTestId('property-sheet')).getAllByText('authored')
        .length
    ).toBeGreaterThan(0);

    fireEvent.click(
      within(drawer).getByRole('button', { name: /Broken Preview/ })
    );
    expect(screen.getByText('Authored preview failed to load')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Mark Ready' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);

    fireEvent.click(within(drawer).getByRole('button', { name: /Floor Tile/ }));
    const ready = screen.getByRole('button', {
      name: 'Mark Ready',
    }) as HTMLButtonElement;
    expect(ready.disabled).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Report scene success' })
    );
    expect(ready.disabled).toBe(false);
    fireEvent.click(ready);
    expect(screen.getByTestId('current-decision').textContent).toBe('Ready');

    fireEvent.click(
      screen.getByRole('button', { name: 'Export Ready provider JSON' })
    );
    const providerText = await blobText(downloadedBlobs.at(-1)!);
    const provider = JSON.parse(providerText);
    expect(provider.schemaVersion).toBe(3);
    expect(provider.entries).toHaveLength(1);
    expect(provider.entries[0].source).toMatchObject({
      kind: 'authored-glb',
      packSlug: 'authored-trial',
      packVersion: 'v1',
      sourcePath: 'floor-tile.glb',
      glbSha256: AUTHORED_FLOOR_HASH,
      capture: { path: 'captures/floor-tile.json' },
    });
    expect(provider.entries[0]).not.toHaveProperty('decision');
    expect(providerText).not.toMatch(/"url"|paletteSelection|localhost|blob:/i);

    fireEvent.click(screen.getByRole('button', { name: 'Export review JSON' }));
    const review = JSON.parse(await blobText(downloadedBlobs.at(-1)!));
    expect(review.schemaVersion).toBe(3);
    expect(review.entries).toHaveLength(3);
    expect(JSON.stringify(review)).not.toMatch(/"url"/);
    expect(
      review.entries.find(
        (entry: { source: { sourcePath: string } }) =>
          entry.source.sourcePath === 'floor-tile.glb'
      ).source.capture
    ).toEqual({ path: 'captures/floor-tile.json', sha256: 'c'.repeat(64) });
  });

  it('imports foreign-source batches as stale without touching other sources storage', async () => {
    stubIndexedFetch();
    render(<AssetReviewLab />);
    await screen.findByDisplayValue(catalog.candidates[3]!.source.sourcePath);
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Keep legacy' },
    });
    await waitFor(() => {
      expect(window.localStorage.getItem(LEGACY_SCOPED_KEY)).toContain(
        'Keep legacy'
      );
    });
    const legacyScoped = window.localStorage.getItem(LEGACY_SCOPED_KEY);

    await act(async () => {
      switchToSource('authored-trial');
    });
    await screen.findByDisplayValue('doors/double-door.glb');

    const file = new File(
      [JSON.stringify(mergeCatalogWithReview(catalog).batch)],
      'legacy.json',
      { type: 'application/json' }
    );
    fireEvent.change(screen.getByLabelText('Import review JSON'), {
      target: { files: [file] },
    });
    await screen.findByText(/stale imported source/);
    expect(screen.getByText(/stale imported source/).textContent).toContain(
      '4'
    );
    expect(screen.getByTestId('current-decision').textContent).toBe(
      'Undecided'
    );
    expect(window.localStorage.getItem(LEGACY_SCOPED_KEY)).toBe(legacyScoped);
  });
});
