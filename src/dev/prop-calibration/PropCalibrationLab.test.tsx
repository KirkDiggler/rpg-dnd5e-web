import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeCalibrationBatch, type CalibrationBatch } from './model';
import { PropCalibrationLab } from './PropCalibrationLab';

vi.mock('./PropCalibrationScene', () => ({
  PropCalibrationScene: ({
    scale,
    yawDegrees,
    url,
  }: {
    scale: number;
    yawDegrees: number;
    url?: string;
  }) => (
    <div
      data-testid="calibration-scene"
      data-scale={scale}
      data-yaw={yawDegrees}
      data-url={url}
    />
  ),
}));

const source = {
  packSlug: 'polygon-dark-fortress',
  packVersion: 'v3',
  sourcePath: 'SourceFiles/DarkFortress/FBX/SM_Prop_Alchemy_Tool_04.fbx',
  glbSha256: 'a5e6e9fe78f4a42226362a434e62b53625d5d779b5309d95de441f70a91054ba',
};
const catalog = {
  schemaVersion: 1,
  candidates: [
    {
      source,
      url: '/models/synty/prop-calibration/a5e6e9fe78f4-tool.glb',
    },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => catalog })
  );
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:batch'),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

describe('PropCalibrationLab', () => {
  it('loads a prepared candidate into a connected property sheet', async () => {
    render(<PropCalibrationLab />);

    expect(await screen.findByDisplayValue(source.sourcePath)).toBeTruthy();
    expect(screen.getByDisplayValue(source.glbSha256)).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Export provider batch',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);

    fireEvent.change(screen.getByLabelText('Display name'), {
      target: { value: 'Alchemy Tool' },
    });
    fireEvent.change(screen.getByLabelText('Family ref'), {
      target: { value: 'dnd5e:props:alchemy-tool' },
    });
    fireEvent.change(screen.getByLabelText('Exact ref'), {
      target: { value: 'dnd5e:props:alchemy-tool:04' },
    });
    fireEvent.change(screen.getByLabelText('Themes'), {
      target: { value: 'crypt, dungeon' },
    });
    fireEvent.change(screen.getByLabelText('Scale value'), {
      target: { value: '1.25' },
    });
    fireEvent.change(screen.getByLabelText('Base yaw value'), {
      target: { value: '315' },
    });

    const scene = screen.getByTestId('calibration-scene');
    expect(scene.dataset.scale).toBe('1.25');
    expect(scene.dataset.yaw).toBe('-45');
    expect(scene.dataset.url).toContain('a5e6e9fe78f4-tool.glb');
    expect(
      (
        screen.getByRole('button', {
          name: 'Export provider batch',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);

    await waitFor(() =>
      expect(
        window.localStorage.getItem('rpg.prop-calibration.batch.v1')
      ).toContain('Alchemy Tool')
    );
  });

  it('imports portable provider JSON and reconnects its prepared local URL', async () => {
    render(<PropCalibrationLab />);
    await screen.findByDisplayValue(source.sourcePath);

    const batch: CalibrationBatch = {
      schemaVersion: 1,
      batchId: 'imported-floor-props-v1',
      entries: [
        {
          source,
          displayName: 'Imported Tool',
          familyRef: 'dnd5e:props:alchemy-tool',
          ref: 'dnd5e:props:alchemy-tool:04',
          defaultForFamily: true,
          calibration: {
            scale: 2,
            yawDegrees: 90,
            fineOffsetMeters: [0, 0, 0],
          },
          placement: 'floor',
          role: 'cover',
          themes: ['crypt'],
          blocksMovement: true,
          blocksLoS: false,
          notes: '',
        },
      ],
    };
    const file = new File([serializeCalibrationBatch(batch)], 'batch.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByLabelText('Import batch JSON'), {
      target: { files: [file] },
    });

    expect(await screen.findByDisplayValue('Imported Tool')).toBeTruthy();
    expect(screen.getByDisplayValue('imported-floor-props-v1')).toBeTruthy();
    expect(screen.getByTestId('calibration-scene').dataset.url).toContain(
      'a5e6e9fe78f4-tool.glb'
    );
  });

  it('shows a useful error instead of mounting a blank lab when the catalog fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);
    render(<PropCalibrationLab />);

    expect((await screen.findByRole('alert')).textContent).toMatch(
      /run the prop preparation command/i
    );
  });
});
