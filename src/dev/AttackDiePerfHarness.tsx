import { useEffect, useRef, useState } from 'react';
import { AttackDie3D } from '../components/ui/dice/AttackDie3D';
import { DiceTray } from '../components/ui/dice/DiceTray';

import type { AttackDiePerfMode } from './attackDiePerfProtocol';
export interface AttackDiePerfSampleRequest {
  mode: AttackDiePerfMode;
  result: number;
  reducedMotion: boolean;
  token: number;
}
export interface AttackDiePerfCounters {
  mountedMode: AttackDiePerfMode | null;
  mountCount: number;
  unmountCount: number;
  contextsCreated: number | null;
  contextsLost: number | null;
  rendererInfo: null | {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
    programs: number;
  };
  gpuBytes: null;
  gpuBytesLimitation: 'Browser does not expose portable GPU allocation bytes; renderer.info proxies recorded.';
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

const emptyCounters = (): AttackDiePerfCounters => ({
  mountedMode: null,
  mountCount: 0,
  unmountCount: 0,
  contextsCreated: null,
  contextsLost: null,
  rendererInfo: null,
  gpuBytes: null,
  gpuBytesLimitation:
    'Browser does not expose portable GPU allocation bytes; renderer.info proxies recorded.',
});

/** Independent development overlay. It deliberately has no queue/completion props. */
export function AttackDiePerfHarness({
  enabled = import.meta.env.MODE === 'development',
}: {
  enabled?: boolean;
}) {
  const [sample, setSample] = useState<AttackDiePerfSampleRequest | null>(null);
  const counters = useRef(emptyCounters());
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
        counters.current = {
          ...counters.current,
          mountedMode: request.mode,
          mountCount: counters.current.mountCount + 1,
        };
        setSample({ ...request });
      },
      readCounters: () => ({ ...counters.current }),
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
        />
      ) : (
        fallback
      )}
    </aside>
  );
}
