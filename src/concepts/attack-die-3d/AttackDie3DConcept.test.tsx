import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttackDie3DConcept } from './AttackDie3DConcept';

const props: Array<Record<string, unknown>> = [];
vi.mock('../../components/ui/dice/AttackDie3D', () => ({
  AttackDie3D: (
    value: Record<string, unknown> & { fallback: React.ReactNode }
  ) => {
    props.push(value);
    return <div data-testid="attack-die">{value.fallback}</div>;
  },
}));
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    parseAsync = vi.fn().mockResolvedValue({
      scene: { getObjectByName: () => undefined },
    });
  },
}));

beforeEach(() => {
  props.length = 0;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
});

describe('AttackDie3D staged concept', () => {
  it('offers keyboard-operable four-stage tabs and a truthful fixture', () => {
    render(<AttackDie3DConcept />);
    for (const name of ['Appearance', 'Calibrate', 'Roll', 'Verify'])
      expect(screen.getByRole('tab', { name })).toBeTruthy();
    expect(
      screen.getByText(/PROVISIONAL — NOT AN ASSET CONTRACT/)
    ).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Appearance' }), {
      key: 'ArrowRight',
    });
    const calibrate = screen.getByRole('tab', { name: 'Calibrate' });
    expect(calibrate.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(calibrate);
    expect(screen.getByTestId('attack-die')).toBeTruthy();
    expect(screen.getByTestId('dice-tray')).toBeTruthy();
  });

  it('starts with zero mappings, exposes 0.1-degree controls, and camera switching preserves pose', () => {
    render(<AttackDie3DConcept />);
    fireEvent.click(screen.getByRole('tab', { name: 'Calibrate' }));
    expect(
      screen.getByText(/zero pose is not a saved or inferred face/i)
    ).toBeTruthy();
    const before = screen.getByLabelText('Current quaternion').textContent;
    fireEvent.click(screen.getByRole('button', { name: 'X +0.1°' }));
    const rotated = screen.getByLabelText('Current quaternion').textContent;
    expect(rotated).not.toBe(before);
    fireEvent.click(screen.getByLabelText('Three-quarter'));
    expect(screen.getByLabelText('Current quaternion').textContent).toBe(
      rotated
    );
    expect(
      screen.getByRole('button', {
        name: /Export provisional proposal \(0\/20\)/,
      })
    ).toBeTruthy();
  });

  it('suppresses magical animation under reduced motion and exposes forced failure review', () => {
    render(<AttackDie3DConcept />);
    fireEvent.click(screen.getByLabelText('Magical'));
    fireEvent.click(screen.getByLabelText(/Animate magical treatment/));
    fireEvent.click(screen.getByRole('tab', { name: 'Roll' }));
    expect(screen.getByRole('radio', { name: 'Top' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Three-quarter' })).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Reduced motion/));
    fireEvent.change(screen.getByLabelText('Forced fallback'), {
      target: { value: 'shader' },
    });
    expect(props.at(-1)?.reducedMotion).toBe(true);
    expect(props.at(-1)?.forceFailure).toBe('shader');
  });

  it('loads actual controlled provider bytes and displays their digest when available', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new TextEncoder().encode('fake glb').buffer,
        })
        .mockResolvedValueOnce({ ok: false, status: 404 })
    );
    render(<AttackDie3DConcept />);
    await waitFor(() =>
      expect(screen.getByTestId('actual-glb-digest').textContent).toMatch(
        /^[0-9a-f]{64}$/
      )
    );
    expect(screen.getByText(/No canonical sidecar is available/)).toBeTruthy();
  });

  it('keeps human verification explicitly pending in the fixed-order verify stage', () => {
    render(<AttackDie3DConcept />);
    fireEvent.click(screen.getByRole('tab', { name: 'Verify' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run animated 1→20' }));
    expect(screen.getByText(/Current: 1/)).toBeTruthy();
    expect(screen.getByText(/Human review: pending/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next result' }));
    expect(screen.getByText(/Current: 2/)).toBeTruthy();
  });
});
