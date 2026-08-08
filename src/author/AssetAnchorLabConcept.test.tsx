import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AssetAnchorLabConcept } from './AssetAnchorLabConcept';

vi.mock('./AssetAnchorLabPreview', () => ({
  // The real R3F graph has its own test. This DOM seam simulates only the
  // post-commit callback so Concept coverage exercises the real reducer gate.
  AssetAnchorLabPreview: (props: {
    url: string;
    state: {
      caseId: 'bookcase' | 'torch-ornate' | 'fighter-pair';
      facing: 0 | 1 | 2 | 3 | 4 | 5;
      variant: 'standing' | 'downed';
      candidate: 'raw-origin' | 'bounds-center-floor' | 'wall-face';
      cameraMode: 'orbit' | 'play';
      visibilityMode: 'raw' | 'calibrated' | 'overlay';
    };
    fallbackBounds: {
      min: [number, number, number];
      max: [number, number, number];
      center: [number, number, number];
      size: [number, number, number];
    };
    onRenderObserved: (observation: unknown) => void;
  }) => {
    const { url, state, fallbackBounds, onRenderObserved } = props;
    useEffect(() => {
      onRenderObserved({
        caseId: state.caseId,
        facing: state.facing,
        variant: state.variant,
        candidate: state.candidate,
        cameraMode: state.cameraMode,
        visibilityMode: state.visibilityMode,
        bounds: fallbackBounds,
      });
    }, [
      fallbackBounds,
      onRenderObserved,
      state.cameraMode,
      state.candidate,
      state.caseId,
      state.facing,
      state.variant,
      state.visibilityMode,
    ]);
    return (
      <div data-testid="mock-anchor-preview">
        {url}|facing={state.facing}|variant={state.variant}|camera=
        {state.cameraMode}|visibility={state.visibilityMode}
      </div>
    );
  },
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
    expect(
      screen.getByTestId('candidate-recommendation').textContent
    ).toContain('Raw is centered');
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

  it('does not credit real preview callbacks while the selected view remains Raw-only', () => {
    render(<AssetAnchorLabConcept />);
    clickAllFacings();
    fireEvent.click(screen.getByRole('button', { name: 'Play · tactical' }));
    expect(screen.getByTestId('facing-progress').textContent).toContain('0/6');
    expect(
      (
        screen.getByRole('button', {
          name: 'Record non-production candidate',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it('starts raw-only, exposes the intended candidate action, and separates preset base from fixture fine trim', () => {
    render(<AssetAnchorLabConcept />);
    expect(screen.getByTestId('visibility-status').textContent).toContain(
      'showing raw'
    );
    expect(
      screen.getByText(/The magenta raw result is unchanged/).textContent
    ).toContain(
      'visible in Raw-only/Overlay; Calibrated-only intentionally hides it'
    );
    expect(
      (
        screen.getByRole('button', {
          name: 'Visibility Calibrated only',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(
      screen.getByTestId('candidate-recommendation').textContent
    ).toContain('Recommended: center visible bounds on hex');

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Apply and show: Visible bounds center + floor',
      })
    );
    expect(screen.getByTestId('visibility-status').textContent).toContain(
      'showing calibrated'
    );
    expect(screen.getByTestId('candidate-offset').textContent).toContain(
      'preset base offset (-0.927m, +0.000m, -0.330m)'
    );
    expect(screen.getByTestId('calibrated-offset').textContent).toContain(
      'effective calibrated offset (-0.927m, +0.000m, -0.330m)'
    );

    const towardWall = screen.getByRole('button', {
      name: 'Decrease Z wall-normal',
    });
    for (let index = 0; index < 4; index += 1) fireEvent.click(towardWall);
    expect(screen.getByTestId('candidate-offset').textContent).toContain(
      '(-0.927m, +0.000m, -0.330m)'
    );
    expect(screen.getByTestId('calibrated-offset').textContent).toContain(
      '(-0.927m, +0.000m, -0.530m)'
    );
    expect(screen.getByTestId('shared-wall-scene-nudge').textContent).toContain(
      'Z −0.20m'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ornate wall torch' }));
    expect(screen.getByTestId('visibility-status').textContent).toContain(
      'showing raw'
    );
    expect(
      screen.getByTestId('candidate-recommendation').textContent
    ).toContain('Recommended: wall-face (height provisional)');
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Apply and show: Measured back face + wall reference',
      })
    );
    expect(screen.getByTestId('candidate-offset').textContent).toContain(
      '(+0.000m, +1.182m, -0.790m)'
    );
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
    expect(screen.getByTestId('visibility-status').textContent).toContain(
      'showing raw'
    );
    expect(
      screen.getByTestId('candidate-recommendation').textContent
    ).toContain('Diagnostic center only — production fix is re-export');
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Apply and show: Visible bounds center + floor',
      })
    );
    clickAllFacings();
    expect(screen.getByTestId('facing-progress').textContent).toContain(
      '12/12'
    );
    // Standing's Orbit observation cannot satisfy the exact downed variant.
    expect((record as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Orbit · inspect' }));
    expect((record as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId('classification').textContent).toContain(
      'Re-export defect'
    );
  });
});
