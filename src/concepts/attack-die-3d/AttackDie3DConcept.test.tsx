import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttackDie3DConcept } from './AttackDie3DConcept';

const props: Array<Record<string, unknown>> = [];
const GLB_URL = '/models/synty/props/SM_Prop_D20_Lightning_01.glb';
const SIDECAR_URL = '/models/synty/dice/d20-lightning/attack-die-contract.json';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
vi.mock('../../components/ui/dice/attackDieContract', async (original) => {
  const actual =
    await original<
      typeof import('../../components/ui/dice/attackDieContract')
    >();
  return {
    ...actual,
    validateAttackDieSidecar: vi.fn(async () => ({
      ok: false,
      reason: 'malformed',
    })),
  };
});
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
  it('offers keyboard-operable five-stage tabs and a truthful fixture', async () => {
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
    for (const name of ['Appearance', 'Calibrate', 'Roll', 'Verify', 'Tray'])
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
    expect(await screen.findByTestId('attack-die')).toBeTruthy();
    expect(screen.getByTestId('dice-tray')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Appearance' }), {
      key: 'ArrowLeft',
    });
    const tray = screen.getByRole('tab', { name: 'Tray' });
    expect(tray.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tray);
    expect(screen.getByText(/Gameplay placement checkpoint/)).toBeTruthy();
    expect(
      screen.getByText(
        /Fixture event delivery · shared component contract · no production transport/
      )
    ).toBeTruthy();
    expect(
      screen.getAllByText(
        /Dice presentation requested · waiting for release event/
      )
    ).toHaveLength(2);
    expect(screen.getByTestId('dice-tray-encounter-preview')).toBeTruthy();
    expect(screen.getAllByTestId('dice-tray-left-drawer')).toHaveLength(2);
    expect(screen.getByTestId('encounter-dock')).toBeTruthy();
    expect(screen.getByTestId('floating-log')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Roll d20' })).toBeTruthy();
    expect(props.at(-1)).toMatchObject({
      result: 10,
      phase: 'ready',
      reducedMotion: false,
    });
  });

  it('starts with zero mappings, exposes 0.1-degree controls, and camera switching preserves pose', () => {
    render(<AttackDie3DConcept />);
    fireEvent.click(screen.getByRole('tab', { name: 'Calibrate' }));
    expect(
      screen.getByText(/provisional pose is not a saved or inferred face/i)
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

  it('suppresses magical animation under reduced motion and exposes forced failure review', async () => {
    render(<AttackDie3DConcept />);
    await screen.findByTestId('attack-die');
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
    expect(
      screen.getByText(/Result 10 uses a geometry-inspected provisional pose/)
    ).toBeTruthy();
  });

  it('gates an early Tray selection until one StrictMode provider load is validated', async () => {
    const pendingGlb = deferred<{
      ok: boolean;
      status: number;
      arrayBuffer: () => Promise<ArrayBuffer>;
    }>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === GLB_URL) return pendingGlb.promise;
      if (url === SIDECAR_URL)
        return Promise.resolve({ ok: false, status: 404 });
      return Promise.reject(new Error(`unexpected fixture URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    const callsFor = (url: string) =>
      fetchMock.mock.calls.filter(([input]) => String(input) === url);

    render(
      <StrictMode>
        <AttackDie3DConcept />
      </StrictMode>
    );
    await waitFor(() => expect(callsFor(GLB_URL)).toHaveLength(1));
    fireEvent.click(screen.getByRole('tab', { name: 'Tray' }));

    try {
      const loading = screen.getByText(/Loading controlled dice provider/);
      expect(loading.getAttribute('role')).toBe('status');
      expect(loading.textContent).not.toContain('10');
      expect(screen.queryByText('Gameplay placement checkpoint')).toBeNull();
      expect(screen.queryAllByTestId('dice-tray-left-drawer')).toHaveLength(0);
      expect(screen.queryByTestId('attack-die')).toBeNull();
      expect(document.querySelectorAll('canvas')).toHaveLength(0);
      expect(props).toHaveLength(0);
      expect(callsFor(GLB_URL)).toHaveLength(1);
      expect(callsFor(SIDECAR_URL)).toHaveLength(0);
    } finally {
      pendingGlb.resolve({
        ok: true,
        status: 200,
        arrayBuffer: async () => new TextEncoder().encode('fake glb').buffer,
      });
      await waitFor(() => expect(callsFor(SIDECAR_URL)).toHaveLength(1));
      await waitFor(() =>
        expect(props.some((value) => value.sceneOverride)).toBe(true)
      );
    }
    await screen.findByText('Gameplay placement checkpoint');
    await waitFor(() =>
      expect(screen.getAllByTestId('dice-tray-left-drawer')).toHaveLength(2)
    );

    const byToken = new Map<unknown, Record<string, unknown>>();
    for (const value of props) {
      if (
        value.phase === 'ready' &&
        value.sceneOverride &&
        value.sidecarOverride &&
        Number.isSafeInteger(value.presentationToken)
      )
        byToken.set(value.presentationToken, value);
    }
    expect(byToken.size).toBe(2);
    const paired = [...byToken.values()];
    const providerScene = paired[0].sceneOverride;
    const providerSidecar = paired[0].sidecarOverride;
    for (const witness of paired)
      expect(witness).toMatchObject({
        result: 10,
        sceneOverride: providerScene,
        sidecarOverride: providerSidecar,
      });
    expect(callsFor(GLB_URL)).toHaveLength(1);
    expect(callsFor(SIDECAR_URL)).toHaveLength(1);
  });

  it('keeps a rejected early Tray fail-closed and permits a later real parent remount', async () => {
    const pendingGlb = deferred<{
      ok: boolean;
      status: number;
      arrayBuffer?: () => Promise<ArrayBuffer>;
    }>();
    let glbAttempt = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === GLB_URL) {
        glbAttempt += 1;
        if (glbAttempt === 1) return pendingGlb.promise;
        return Promise.resolve({
          ok: true,
          status: 200,
          arrayBuffer: async () => new TextEncoder().encode('fake glb').buffer,
        });
      }
      if (url === SIDECAR_URL)
        return Promise.resolve({ ok: false, status: 404 });
      return Promise.reject(new Error(`unexpected fixture URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    const callsFor = (url: string) =>
      fetchMock.mock.calls.filter(([input]) => String(input) === url);

    const first = render(
      <StrictMode>
        <AttackDie3DConcept />
      </StrictMode>
    );
    await waitFor(() => expect(callsFor(GLB_URL)).toHaveLength(1));
    fireEvent.click(screen.getByRole('tab', { name: 'Tray' }));
    let rejected = false;
    try {
      expect(
        screen
          .getByText(/Loading controlled dice provider/)
          .getAttribute('role')
      ).toBe('status');

      pendingGlb.resolve({ ok: false, status: 503 });
      rejected = true;
      await waitFor(() =>
        expect(
          screen
            .getByText(
              /Controlled dice provider unavailable.*GLB load failed \(503\)/
            )
            .getAttribute('role')
        ).toBe('status')
      );
      expect(
        screen.getByText(
          /Controlled dice provider unavailable.*GLB load failed \(503\)/
        ).textContent
      ).not.toContain('10');
      expect(screen.queryByText('Gameplay placement checkpoint')).toBeNull();
      expect(screen.queryAllByTestId('dice-tray-left-drawer')).toHaveLength(0);
      expect(screen.queryByTestId('attack-die')).toBeNull();
      expect(document.querySelectorAll('canvas')).toHaveLength(0);
      expect(props).toHaveLength(0);
      expect(callsFor(GLB_URL)).toHaveLength(1);
      expect(callsFor(SIDECAR_URL)).toHaveLength(0);
    } finally {
      if (!rejected) pendingGlb.resolve({ ok: false, status: 503 });
      fireEvent.click(screen.getByRole('tab', { name: 'Appearance' }));
      await waitFor(() =>
        expect(screen.getByText(/GLB load failed \(503\)/)).toBeTruthy()
      );
    }

    first.unmount();
    render(<AttackDie3DConcept />);
    await waitFor(() =>
      expect(screen.getByTestId('actual-glb-digest').textContent).toMatch(
        /^[0-9a-f]{64}$/
      )
    );
    expect(callsFor(GLB_URL)).toHaveLength(2);
    expect(callsFor(SIDECAR_URL)).toHaveLength(1);
  });

  it('previews the inspected lightning d20 with a hardcoded pose and replays its tumble', async () => {
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
      expect(
        props.at(-1)?.sceneOverride && props.at(-1)?.presentationToken
      ).toBe(2)
    );
    const preview = props.at(-1)!;
    const sidecar = preview.sidecarOverride as {
      selectors: {
        node: string;
        sourceMesh: string;
        bodyPrimitive: { mesh: string; material: string };
        numeralPrimitive: { mesh: string; material: string };
      };
    };
    expect(preview.result).toBe(10);
    expect(preview.cameraView).toBe('three-quarter');
    expect(preview.calibrationPose).toEqual([
      0.31157754187207176, 0.875164463918048, 0.0748112861222172,
      -0.36250499026183464,
    ]);
    expect(sidecar.selectors).toEqual({
      blenderSuffixPattern: '\\.\\d{3}$',
      node: 'D20_Lightning_preview_4pct',
      sourceMesh: 'D20_Lightning_preview_4pct_Mesh001',
      bodyPrimitive: {
        mesh: 'D20_Lightning_preview_4pct_Mesh001',
        material: 'D20_Lightning_Material',
      },
      numeralPrimitive: {
        mesh: 'D20_Lightning_preview_4pct_Mesh001_1',
        material: 'Paint_Material',
      },
    });
    const firstToken = preview.presentationToken;
    fireEvent.click(screen.getByRole('tab', { name: 'Roll' }));
    fireEvent.click(
      screen.getByRole('button', { name: /Replay decorative variation/ })
    );
    expect(props.at(-1)?.presentationToken).toBe(Number(firstToken) + 1);
  });

  it('rejects candidate sidecar before making export/hash claims', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new TextEncoder().encode('fake glb').buffer,
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ malformed: true }),
        })
    );
    render(<AttackDie3DConcept />);
    await waitFor(() =>
      expect(screen.getByText(/candidate sidecar invalid/)).toBeTruthy()
    );
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
