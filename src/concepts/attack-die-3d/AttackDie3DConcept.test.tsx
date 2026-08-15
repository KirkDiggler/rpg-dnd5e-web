import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttackDie3DConcept } from './AttackDie3DConcept';

const props: Array<Record<string, unknown>> = [];
const ORIGINAL_PRESET_ID = 'dice.original.carved.d20';
const runtimeProvider = vi.hoisted(() => ({
  snapshot: { status: 'ready' } as Record<string, unknown>,
  getSnapshot: vi.fn(),
  preload: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function stubReducedMotionPreference(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    }))
  );
}

function stubReadyProvider() {
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
}

function readyWitnesses() {
  const byToken = new Map<number, Record<string, unknown>>();
  for (const value of [...props].reverse()) {
    if (
      value.phase === 'ready' &&
      value.result === 10 &&
      (value.provider as { presetId?: string } | undefined)?.presetId ===
        ORIGINAL_PRESET_ID &&
      Number.isSafeInteger(value.presentationToken) &&
      !byToken.has(value.presentationToken as number)
    )
      byToken.set(value.presentationToken as number, value);
    if (byToken.size === 2) break;
  }
  return [...byToken.values()].reverse();
}

async function expectReadyWitnessMotion(reducedMotion: boolean) {
  await waitFor(() => expect(readyWitnesses()).toHaveLength(2));
  const witnesses = readyWitnesses();
  expect(new Set(witnesses.map((value) => value.presentationToken)).size).toBe(
    2
  );
  for (const witness of witnesses)
    expect(witness).toMatchObject({
      result: 10,
      phase: 'ready',
      reducedMotion,
    });
  expect(witnesses[0].provider).toBe(witnesses[1].provider);
  expect(witnesses[0].sceneOverride).toBeUndefined();
  expect(witnesses[1].sceneOverride).toBeUndefined();
  expect(witnesses[0].sidecarOverride).toBeUndefined();
  expect(witnesses[1].sidecarOverride).toBeUndefined();
  return witnesses;
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
vi.mock('../../components/ui/dice/diceRuntimeProvider', () => ({
  getDiceRuntimePresetSnapshot: (presetId: string) => {
    runtimeProvider.getSnapshot(presetId);
    return runtimeProvider.snapshot;
  },
  preloadDiceRuntimePreset: (presetId: string) =>
    runtimeProvider.preload(presetId),
}));
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
  window.history.replaceState({}, '', '/');
  props.length = 0;
  runtimeProvider.snapshot = { status: 'ready' };
  runtimeProvider.getSnapshot.mockReset();
  runtimeProvider.preload.mockReset().mockResolvedValue(undefined);
  stubReducedMotionPreference(false);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
});

describe('AttackDie3D staged concept', () => {
  it('offers keyboard-operable five-stage tabs and a truthful fixture', async () => {
    stubReadyProvider();
    render(<AttackDie3DConcept />);
    for (const name of ['Appearance', 'Calibrate', 'Roll', 'Verify', 'Tray'])
      expect(screen.getByRole('tab', { name })).toBeTruthy();
    expect(
      screen.getByText(/PROVISIONAL — NOT AN ASSET CONTRACT/)
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Historical non-Tray Lightning authoring remains provisional/i
      )
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
    await expectReadyWitnessMotion(false);
    expect(
      props.filter(
        (value) =>
          (value.provider as { presetId?: string } | undefined)?.presetId ===
          ORIGINAL_PRESET_ID
      )
    ).toHaveLength(2);
    expect(
      props.some(
        (value) =>
          (value.provider as { presetId?: string } | undefined)?.presetId ===
          'lightning'
      )
    ).toBe(false);
  });

  it('opens the dedicated Tray evidence route without starting historical Lightning work', async () => {
    window.history.replaceState(
      {},
      '',
      '/?concept=attack-die-3d&attackDieStage=tray'
    );
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    render(<AttackDie3DConcept />);

    expect(
      await screen.findByText('Gameplay placement checkpoint')
    ).toBeTruthy();
    expect(
      screen.getByRole('tab', { name: 'Tray' }).getAttribute('aria-selected')
    ).toBe('true');
    expect(fetch).not.toHaveBeenCalled();
    expect(runtimeProvider.getSnapshot).toHaveBeenCalledWith(
      ORIGINAL_PRESET_ID
    );
  });

  it('publishes each renderer upward observation without deriving identity from its held mapped target', async () => {
    stubReadyProvider();
    render(<AttackDie3DConcept />);
    fireEvent.click(screen.getByRole('tab', { name: 'Tray' }));
    const witnesses = await expectReadyWitnessMotion(false);
    const target = [0, 0, 0, 1] as const;

    for (const [index, witness] of witnesses.entries())
      (witness.onTelemetry as (telemetry: Record<string, unknown>) => void)({
        presentationToken: witness.presentationToken,
        requestedResult: 10,
        renderer: '3d',
        state: 'observed',
        mappedTarget: target,
        observedUpwardResult: index === 0 ? 5 : 10,
        observedUpDot: 1,
        observedUpMargin: 0.25,
        angularErrorDegrees: 0,
        exactTargetHeld: true,
        runtimeSourceId: 1,
        runtimeCloneId: index + 1,
      });

    expect(
      window.__stone0TrayEvidence?.witnesses.roller.telemetry
    ).toMatchObject({
      requestedResult: 10,
      mappedTarget: target,
      observedUpwardResult: 5,
      exactTargetHeld: true,
    });
    expect(
      window.__stone0TrayEvidence?.witnesses.spectator.telemetry
    ).toMatchObject({
      requestedResult: 10,
      mappedTarget: target,
      observedUpwardResult: 10,
      exactTargetHeld: true,
    });
  });

  it('passes the explicit lab reduced-motion preference to both ready Tray witnesses', async () => {
    stubReadyProvider();
    render(
      <StrictMode>
        <AttackDie3DConcept />
      </StrictMode>
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Roll' }));
    const explicitPreference = screen.getByLabelText(/Reduced motion/);
    expect((explicitPreference as HTMLInputElement).checked).toBe(false);
    fireEvent.click(explicitPreference);
    expect((explicitPreference as HTMLInputElement).checked).toBe(true);
    await waitFor(() =>
      expect(screen.getByTestId('actual-glb-digest').textContent).toMatch(
        /^[0-9a-f]{64}$/
      )
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Tray' }));
    await expectReadyWitnessMotion(true);
  });

  it('passes the OS reduced-motion preference to both ready Tray witnesses while the explicit control remains false', async () => {
    stubReducedMotionPreference(true);
    stubReadyProvider();
    render(
      <StrictMode>
        <AttackDie3DConcept />
      </StrictMode>
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Roll' }));
    expect(
      (screen.getByLabelText(/Reduced motion/) as HTMLInputElement).checked
    ).toBe(false);
    await waitFor(() =>
      expect(screen.getByTestId('actual-glb-digest').textContent).toMatch(
        /^[0-9a-f]{64}$/
      )
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Tray' }));
    await expectReadyWitnessMotion(true);
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

  it('gates pending Original provider state with result-free polite loading and no Tray presentation', async () => {
    const pending = deferred<void>();
    runtimeProvider.snapshot = { status: 'idle' };
    runtimeProvider.preload.mockReturnValue(pending.promise);
    stubReadyProvider();

    render(
      <StrictMode>
        <AttackDie3DConcept />
      </StrictMode>
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Tray' }));

    const loading = screen.getByText(/Loading Original carved d20 provider/);
    expect(loading.getAttribute('role')).toBe('status');
    expect(loading.getAttribute('aria-live')).toBe('polite');
    expect(loading.textContent).not.toContain('10');
    expect(screen.queryByText('Gameplay placement checkpoint')).toBeNull();
    expect(screen.queryAllByTestId('dice-tray-left-drawer')).toHaveLength(0);
    expect(screen.queryByTestId('attack-die')).toBeNull();
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
    expect(runtimeProvider.preload).toHaveBeenCalledWith(ORIGINAL_PRESET_ID);
    expect(
      runtimeProvider.preload.mock.calls.every(
        ([preset]) => preset === ORIGINAL_PRESET_ID
      )
    ).toBe(true);

    runtimeProvider.snapshot = { status: 'ready' };
    pending.resolve();
    await screen.findByText('Gameplay placement checkpoint');
    await expectReadyWitnessMotion(false);
  });

  it('mounts the shared fail-closed presentation on terminal provider failure and reveals truth only after release', async () => {
    const pending = deferred<void>();
    runtimeProvider.snapshot = { status: 'idle' };
    runtimeProvider.preload.mockReturnValue(pending.promise);
    stubReadyProvider();

    render(<AttackDie3DConcept />);
    fireEvent.click(screen.getByRole('tab', { name: 'Tray' }));
    expect(
      screen.getByText(/Loading Original carved d20 provider/)
    ).toBeTruthy();

    runtimeProvider.snapshot = {
      status: 'failed',
      failureReason: 'manifest validation failed: incomplete face map',
    };
    pending.reject(
      new Error('manifest validation failed: incomplete face map')
    );

    await screen.findByText('Gameplay placement checkpoint');
    await waitFor(() => expect(readyWitnesses()).toHaveLength(2));
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
    expect(
      screen.getAllByTestId('dice-face').map((face) => face.textContent)
    ).toEqual(['?', '?']);
    expect(screen.getByRole('button', { name: 'Roll d20' })).toBeTruthy();
    expect(
      screen
        .getByRole('complementary', { name: 'Spectator dice drawer' })
        .querySelector('button')
    ).toBeNull();

    const [roller, spectator] = readyWitnesses();
    for (const witness of [roller, spectator])
      (witness.onTelemetry as ((event: unknown) => void) | undefined)?.({
        presentationToken: witness.presentationToken,
        requestedResult: 10,
        renderer: 'svg',
        state: 'failed',
        exactTargetHeld: false,
        failureCode: 'provider-load',
        failureReason: 'manifest validation failed: incomplete face map',
      });
    expect(
      screen.getAllByTestId('dice-face').map((face) => face.textContent)
    ).toEqual(['?', '?']);

    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    await waitFor(() =>
      expect(
        screen.getAllByTestId('dice-face').map((face) => face.textContent)
      ).toEqual(['10', '10'])
    );
    expect(
      screen
        .getAllByRole('status')
        .some((status) =>
          /truthful SVG settled/i.test(status.textContent ?? '')
        )
    ).toBe(true);
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
