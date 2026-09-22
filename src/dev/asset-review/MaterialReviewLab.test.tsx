import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetReviewLab } from './AssetReviewLab';
import {
  auditedMaterialManifestFixture,
  materialManifestFixture,
} from './materialProfile.testFixtures';
import { MaterialReviewLab } from './MaterialReviewLab';

const sceneLifecycle = vi.hoisted(() => ({ starts: 0 }));
vi.mock('./AssetReviewScene', () => ({
  AssetReviewScene: ({
    url,
    onLoadStateChange,
  }: {
    url?: string;
    onLoadStateChange: (
      url: string,
      status: 'loading' | 'success' | 'error',
      detail?: string
    ) => void;
  }) => {
    // Mirror the real scene's load-effect dependencies. Bound the test so an
    // unstable callback fails immediately rather than spinning React forever.
    useEffect(() => {
      if (++sceneLifecycle.starts > 6)
        throw new Error('Scene keeps restarting its load effect');
      if (url) onLoadStateChange(url, 'loading');
    }, [url, onLoadStateChange]);
    return (
      <div>
        <button onClick={() => onLoadStateChange(url!, 'success')}>
          Scene loaded
        </button>
        <button
          onClick={() =>
            onLoadStateChange(url!, 'error', 'Fixture load failed')
          }
        >
          Scene failed
        </button>
      </div>
    );
  },
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
  sceneLifecycle.starts = 0;
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
  it('shows source exceptions and Blender paths without blocking valid examples', async () => {
    const response = {
      ok: true,
      json: async () => auditedMaterialManifestFixture(),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    render(<MaterialReviewLab />);
    expect(await screen.findByText(/1 unresolved source/)).toBeVisible();
    fireEvent.click(screen.getByText('Source exceptions (1)'));
    expect(
      screen.getByText('/private/source-audits/case/inspect.blend')
    ).toBeVisible();
    expect(screen.getByText(/Expected 1 slot, found 2/)).toBeVisible();
    expect(screen.getByLabelText('Representative piece')).toBeVisible();
    expect(
      screen.getByLabelText('Material option for Stone')
    ).not.toBeDisabled();
  });
  it('keeps saved choices exportable when all sources need inspection', async () => {
    const data = auditedMaterialManifestFixture(true);
    const profile = { ...data.profile, selections: { Stone: 'stone-dark' } };
    const response = { ok: true, json: async () => ({ ...data, profile }) };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    render(<MaterialReviewLab />);
    const select = await screen.findByLabelText('Material option for Stone');
    expect(select).toHaveValue('stone-dark');
    expect(select).toBeDisabled();
    expect(screen.getByText(/No verified representative/)).toBeVisible();
    expect(
      screen.queryByLabelText('Representative piece')
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Export pack profile' })
    );
    expect(JSON.parse(await readBlob(blobs[0]!)).selections).toEqual({
      Stone: 'stone-dark',
    });
  });
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
