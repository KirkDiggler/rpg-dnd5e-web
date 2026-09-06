import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ASSET_REVIEW_STORAGE_KEY, AssetReviewLab } from './AssetReviewLab';
import type { AssetReviewCandidate, AssetReviewCatalog } from './model';

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
        <button type="button" onClick={() => onLoadStateChange(url, 'success')}>
          Report scene success
        </button>
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

const blockedPortal = candidate(3, {
  readyEligible: false,
  reviewStatus: 'fx-review',
  reasons: ['Particle effect conversion required'],
});
const catalog: AssetReviewCatalog = {
  schemaVersion: 1,
  candidates: [candidate(2), blockedPortal, candidate(1), candidate(0)],
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
  render(<AssetReviewLab />);
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
