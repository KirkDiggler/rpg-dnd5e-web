import { useEffect, useRef, useState } from 'react';
import {
  AttackDie3D,
  type AttackDieTelemetry,
} from '../components/ui/dice/AttackDie3D';
import { DiceTray } from '../components/ui/dice/DiceTray';
import {
  applyAttackDieRendererObservation,
  type AttackDiePerfMode,
} from './attackDiePerfProtocol';
export interface AttackDiePerfSampleRequest {
  mode: AttackDiePerfMode;
  result: number;
  reducedMotion: boolean;
  token: number;
}
export interface AttackDieRendererInfo {
  calls: number | null;
  triangles: number | null;
  geometries: number | null;
  textures: number | null;
  programs: number | null;
}
export interface AttackDiePerfCounters {
  mountedMode: AttackDiePerfMode | null;
  mountCount: number;
  unmountCount: number;
  contextsCreated: number;
  contextsLost: number;
  contextsDisposed: number;
  activeContextIds: number[];
  rendererInfo: AttackDieRendererInfo;
  telemetry: AttackDieTelemetry | null;
  healthy3d: boolean;
  readyAtMs: number | null;
  gpuBytes: null;
  gpuBytesLimitation: string;
  rendererObservationLimitation: string | null;
}
export interface AttackDiePerfDriver {
  runSample(request: AttackDiePerfSampleRequest): void;
  readCounters(): AttackDiePerfCounters;
  unmountDie(): void;
}
declare global {
  interface Window {
    __attackDiePerf?: AttackDiePerfDriver;
  }
}
const empty = (): AttackDiePerfCounters => ({
  mountedMode: null,
  mountCount: 0,
  unmountCount: 0,
  contextsCreated: 0,
  contextsLost: 0,
  contextsDisposed: 0,
  activeContextIds: [],
  rendererInfo: {
    calls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    programs: 0,
  },
  telemetry: null,
  healthy3d: false,
  readyAtMs: null,
  gpuBytes: null,
  gpuBytesLimitation:
    'Browser does not expose portable GPU allocation bytes; renderer.info proxies recorded.',
  rendererObservationLimitation: null,
});
/** Independent observation overlay; no queue callbacks. */
export function AttackDiePerfHarness({
  enabled = import.meta.env.MODE === 'development',
}: {
  enabled?: boolean;
}) {
  const [sample, setSample] = useState<AttackDiePerfSampleRequest | null>(null);
  const counters = useRef(empty());
  const start = useRef(0);
  useEffect(() => {
    if (!enabled) {
      delete window.__attackDiePerf;
      return;
    }
    const driver: AttackDiePerfDriver = {
      runSample(request) {
        if (
          !Number.isInteger(request.result) ||
          request.result < 1 ||
          request.result > 20
        )
          throw Error('result must be 1–20');
        start.current = performance.now();
        counters.current = {
          ...counters.current,
          mountedMode: request.mode,
          mountCount: counters.current.mountCount + 1,
          telemetry: null,
          healthy3d: request.mode === 'svg',
          readyAtMs: request.mode === 'svg' ? 0 : null,
        };
        setSample({ ...request });
      },
      readCounters: () => ({
        ...counters.current,
        activeContextIds: [...counters.current.activeContextIds],
        rendererInfo: { ...counters.current.rendererInfo },
      }),
      unmountDie() {
        counters.current = {
          ...counters.current,
          mountedMode: null,
          unmountCount: counters.current.unmountCount + 1,
        };
        setSample(null);
      },
    };
    window.__attackDiePerf = driver;
    return () => {
      if (window.__attackDiePerf === driver) delete window.__attackDiePerf;
    };
  }, [enabled]);
  if (!enabled || !sample) return null;
  const fallback = (
    <DiceTray phase="settled" finalFace={sample.result} outcome="HIT" />
  );
  const telemetry = (event: AttackDieTelemetry) => {
    const matchesMountedSample =
      sample.mode === '3d' &&
      event.presentationToken === sample.token &&
      event.requestedResult === sample.result;
    const healthy =
      matchesMountedSample &&
      event.renderer === '3d' &&
      event.exactTargetHeld &&
      event.state === 'observed';
    if (!matchesMountedSample) return;
    counters.current = {
      ...counters.current,
      telemetry: event,
      healthy3d: healthy,
      readyAtMs:
        healthy && counters.current.readyAtMs === null
          ? performance.now() - start.current
          : counters.current.readyAtMs,
    };
  };
  return (
    <aside
      className="attack-die-perf-harness"
      data-testid="attack-die-perf-harness"
      aria-label="Attack die development performance overlay"
    >
      {sample.mode === '3d' ? (
        <AttackDie3D
          result={sample.result}
          presentationToken={sample.token}
          phase="rolling"
          materialMode="magical"
          reducedMotion={sample.reducedMotion}
          fallback={fallback}
          onTelemetry={telemetry}
          onRendererInfo={(info) => {
            counters.current = {
              ...applyAttackDieRendererObservation(counters.current, info),
              rendererObservationLimitation:
                info.observationLimitation ??
                counters.current.rendererObservationLimitation,
            };
          }}
        />
      ) : (
        fallback
      )}
    </aside>
  );
}
