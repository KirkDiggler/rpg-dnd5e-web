import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetReviewLab } from './AssetReviewLab';
import { materialManifestFixture } from './materialProfile.testFixtures';
import { MaterialReviewLab } from './MaterialReviewLab';

vi.mock('./AssetReviewScene', () => ({
  AssetReviewScene: ({
    url,
    onLoadStateChange,
  }: {
    url?: string;
    onLoadStateChange: (
      url: string,
      status: 'success' | 'error',
      detail?: string
    ) => void;
  }) => (
    <div>
      <button onClick={() => onLoadStateChange(url!, 'success')}>
        Scene loaded
      </button>
      <button
        onClick={() => onLoadStateChange(url!, 'error', 'Fixture load failed')}
      >
        Scene failed
      </button>
    </div>
  ),
}));
let blobs: Blob[];
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}
beforeEach(() => {
  blobs = [];
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => materialManifestFixture(),
    })
  );
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      blobs.push(blob);
      return 'blob:fixture';
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('material family review', () => {
  it('opens material mode through the existing Lab route without loading a Ready catalogue', async () => {
    const previous = window.location.href;
    try {
      window.history.replaceState({}, '', '?assetReview=1&materialReview=1');
      render(<AssetReviewLab />);
      expect(
        await screen.findByLabelText('Material option for Stone')
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: /Export Ready provider/ })
      ).not.toBeInTheDocument();
    } finally {
      window.history.replaceState({}, '', previous);
    }
  });
  it('presents recommendations without selecting them; exports the family choice only', async () => {
    render(<MaterialReviewLab />);
    const select = await screen.findByLabelText('Material option for Stone');
    expect(select).toHaveValue('');
    expect(screen.getByText(/^1 affected piece ·/)).toBeVisible();
    fireEvent.change(select, { target: { value: 'stone-dark' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Export pack profile' })
    );
    const profile = JSON.parse(await readBlob(blobs[0]!));
    expect(profile.selections).toEqual({ Stone: 'stone-dark' });
    expect(profile).not.toHaveProperty('trusted');
    expect(
      screen.queryByRole('button', { name: /Export Ready provider/ })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Scene failed' }));
    expect(await screen.findByText(/Fixture load failed/)).toBeVisible();
  });
  it('rejects wrong-pack imports without discarding choices', async () => {
    render(<MaterialReviewLab />);
    fireEvent.change(
      await screen.findByLabelText('Material option for Stone'),
      { target: { value: 'stone-dark' } }
    );
    const wrong = {
      ...materialManifestFixture().profile,
      packSlug: 'different',
    };
    fireEvent.change(screen.getByLabelText('Import pack profile'), {
      target: {
        files: [
          new File([JSON.stringify(wrong)], 'profile.json', {
            type: 'application/json',
          }),
        ],
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(/pack differs/);
    expect(screen.getByLabelText('Material option for Stone')).toHaveValue(
      'stone-dark'
    );
  });
  it('shows a preparation error instead of falling back to normal asset review', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 })
    );
    render(<MaterialReviewLab />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/404/)
    );
    expect(
      screen.queryByRole('button', { name: 'Export pack profile' })
    ).not.toBeInTheDocument();
  });
});
