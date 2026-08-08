import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssetAnchorLabConcept } from './AssetAnchorLabConcept';

vi.mock('./AssetAnchorLabPreview', () => ({
  AssetAnchorLabPreview: (props: {
    url: string;
    state: { facing: number; variant: string; cameraMode: string };
  }) => (
    <div data-testid="mock-anchor-preview">
      {props.url}|facing={props.state.facing}|variant={props.state.variant}
      |camera={props.state.cameraMode}
    </div>
  ),
}));

function clickAllFacings() {
  ['E', 'NE', 'NW', 'W', 'SW', 'SE'].forEach((label) =>
    fireEvent.click(screen.getByRole('button', { name: `Facing ${label}` }))
  );
}

describe('AssetAnchorLabConcept — real inspection/calibration interaction path', () => {
  it('switches actual resolver URLs and keeps the one logical owning hex through the fighter variant toggle', () => {
    render(<AssetAnchorLabConcept />);
    expect(screen.getByTestId('asset-runtime-proof').textContent).toContain(
      '/models/synty/props/SM_Prop_Bookcase_Small_01.glb'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ornate wall torch' }));
    expect(screen.getByTestId('asset-runtime-proof').textContent).toContain(
      '/models/synty/props/SM_Prop_Torch_Ornate_01.glb'
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Fighter standing / downed' })
    );
    expect(screen.getByTestId('owning-hex').textContent).toContain(
      'q0,r0,s0 · unchanged'
    );
    expect(screen.getByTestId('mock-anchor-preview').textContent).toContain(
      '/models/synty/characters/fighter.glb'
    );
    fireEvent.click(screen.getByRole('button', { name: 'downed' }));
    expect(screen.getByTestId('mock-anchor-preview').textContent).toContain(
      '/models/synty/characters/fighter-downed.glb'
    );
    expect(screen.getByTestId('owning-hex').textContent).toContain(
      'q0,r0,s0 · unchanged'
    );
  });

  it('exercises a candidate, bounded adjustment, exact reset, all facings, and the Play camera before output unlocks', () => {
    render(<AssetAnchorLabConcept />);
    const record = screen.getByRole('button', {
      name: 'Record non-production candidate',
    });
    expect((record as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('output-gated')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Visible bounds center + floor' })
    );
    const plus = screen.getByRole('button', { name: 'Increase X tangent' });
    for (let index = 0; index < 20; index += 1) fireEvent.click(plus);
    expect(screen.getByText(/X tangent: \+0\.250m/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset to selected candidate' })
    );
    expect(screen.getByText(/X tangent: \+0\.000m/)).toBeTruthy();

    clickAllFacings();
    expect(screen.getByTestId('facing-progress').textContent).toContain('6/6');
    fireEvent.click(screen.getByRole('button', { name: 'Play · tactical' }));
    expect(screen.getByTestId('mock-anchor-preview').textContent).toContain(
      'camera=play'
    );
    expect((record as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(record);
    const output = screen.getByTestId('provisional-output').textContent ?? '';
    expect(output).toContain('NON-PRODUCTION FIXTURE EVIDENCE');
    expect(output).toContain('bounds-center-floor');
    expect(output).toContain('Asset anchor metadata');
  });

  it('keeps character output gated until both standing and downed have each been viewed in all six facings', () => {
    render(<AssetAnchorLabConcept />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Fighter standing / downed' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Visible bounds center + floor' })
    );
    clickAllFacings();
    fireEvent.click(screen.getByRole('button', { name: 'Play · tactical' }));
    const record = screen.getByRole('button', {
      name: 'Record non-production candidate',
    });
    expect((record as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'downed' }));
    clickAllFacings();
    expect(screen.getByTestId('facing-progress').textContent).toContain(
      '12/12'
    );
    expect((record as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId('classification').textContent).toContain(
      'Re-export defect'
    );
  });
});
