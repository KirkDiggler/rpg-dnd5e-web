export type AttackDiePerfMode = 'svg' | '3d';
export type AttackDieProfileCategory =
  | 'desktop-chromium'
  | 'desktop-discord-activity'
  | 'mobile-low-gpu';
const categories: AttackDieProfileCategory[] = [
  'desktop-chromium',
  'desktop-discord-activity',
  'mobile-low-gpu',
];
export interface AvailableAttackDieProfile {
  category: AttackDieProfileCategory;
  status: 'available';
  clientOrBrowser: string;
  os: string;
  hardwareGpu: string;
  powerState: string;
  viewport: string;
  viewportPixels: { width: number; height: number };
  dpr: number;
}
export interface BlockedAttackDieProfile {
  category: AttackDieProfileCategory;
  status: 'blocked';
  reason: string;
}
export type AttackDieProfile =
  | AvailableAttackDieProfile
  | BlockedAttackDieProfile;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
export function parseAttackDieProfiles(value: unknown): {
  profiles: AttackDieProfile[];
  blocked: string[];
} {
  if (
    !object(value) ||
    !Array.isArray(value.profiles) ||
    value.profiles.length !== 3
  )
    throw Error('profile artifact must contain exactly required categories');
  const profiles = value.profiles.map((raw): AttackDieProfile => {
    if (
      !object(raw) ||
      !categories.includes(raw.category as AttackDieProfileCategory)
    )
      throw Error('profile categories invalid');
    const category = raw.category as AttackDieProfileCategory;
    if (raw.status === 'blocked') {
      if (category !== 'mobile-low-gpu')
        throw Error(`${category} must be available with exact human facts`);
      if (!nonempty(raw.reason)) throw Error('blocked profile reason required');
      return { category, status: 'blocked', reason: raw.reason };
    }
    if (
      raw.status !== 'available' ||
      ![
        raw.clientOrBrowser,
        raw.os,
        raw.hardwareGpu,
        raw.powerState,
        raw.viewport,
      ].every(nonempty) ||
      typeof raw.dpr !== 'number' ||
      !Number.isFinite(raw.dpr) ||
      raw.dpr <= 0
    )
      throw Error('available profile facts invalid');
    const match = /^\s*(\d+)\s*x\s*(\d+)\s*$/i.exec(raw.viewport as string);
    if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0)
      throw Error('profile viewport must be WIDTHxHEIGHT');
    return {
      category,
      status: 'available',
      clientOrBrowser: raw.clientOrBrowser as string,
      os: raw.os as string,
      hardwareGpu: raw.hardwareGpu as string,
      powerState: raw.powerState as string,
      viewport: raw.viewport as string,
      viewportPixels: { width: Number(match[1]), height: Number(match[2]) },
      dpr: raw.dpr,
    };
  });
  if (
    new Set(profiles.map((profile) => profile.category)).size !== 3 ||
    categories.some(
      (category) => !profiles.some((profile) => profile.category === category)
    )
  )
    throw Error('profile artifact must contain exactly required categories');
  return {
    profiles,
    blocked: profiles
      .filter(
        (profile): profile is BlockedAttackDieProfile =>
          profile.status === 'blocked'
      )
      .map((profile) => `${profile.category}: ${profile.reason}`),
  };
}
export function performanceExitCode(
  outcomes: ReadonlyArray<{ status: string }>
): 0 | 1 {
  return outcomes.length > 0 &&
    outcomes.every((outcome) => outcome.status === 'pass')
    ? 0
    : 1;
}
export function alternatingAttackDieModes(
  samplesPerMode: number
): AttackDiePerfMode[] {
  if (!Number.isInteger(samplesPerMode) || samplesPerMode <= 0)
    throw Error('samples per mode must be a positive integer');
  return Array.from({ length: samplesPerMode * 2 }, (_, index) =>
    index % 2 === 0 ? 'svg' : '3d'
  );
}
export function evaluateAttackDieBudgets(input: {
  svgP95: number;
  candidateP95: number;
  svgPostUnmountP95: number;
  candidatePostUnmountP95: number;
  attributableLongTasks: number;
}) {
  const frameTime =
    Number.isFinite(input.svgP95) &&
    Number.isFinite(input.candidateP95) &&
    input.candidateP95 <= input.svgP95 * 1.1;
  const longTasks = input.attributableLongTasks === 0;
  const postUnmount =
    Number.isFinite(input.svgPostUnmountP95) &&
    Number.isFinite(input.candidatePostUnmountP95) &&
    input.candidatePostUnmountP95 <= input.svgPostUnmountP95 * 1.1;
  return {
    frameTime,
    longTasks,
    postUnmount,
    pass: frameTime && longTasks && postUnmount,
  };
}
export function evaluateAttackDieRun(input: {
  samples: Array<{
    mode: AttackDiePerfMode;
    healthy3d: boolean;
    longTasks: unknown[];
  }>;
  svgP95: number;
  candidateP95: number;
  svgPostUnmountP95: number;
  candidatePostUnmountP95: number;
  postUnmountCounters: {
    contextsActive: number | null;
    geometries: number | null;
    textures: number | null;
    programs: number | null;
  };
  release: {
    releaseKnown: boolean;
    resourcesReleased: boolean;
    releaseBasis: 'owned-canvas-webglcontextlost' | null;
  };
}) {
  const healthy =
    input.samples.filter((sample) => sample.mode === '3d').length > 0 &&
    input.samples
      .filter((sample) => sample.mode === '3d')
      .every((sample) => sample.healthy3d);
  const resourcesKnown = input.release.releaseKnown;
  const resourcesReleased = input.release.resourcesReleased;
  const budget = evaluateAttackDieBudgets({
    ...input,
    attributableLongTasks: input.samples.reduce(
      (sum, sample) => sum + sample.longTasks.length,
      0
    ),
  });
  return {
    ...budget,
    healthy,
    resourcesKnown,
    resourcesReleased,
    pass: budget.pass && healthy && resourcesKnown && resourcesReleased,
  };
}

export type AttackDieRendererLifecycle =
  | 'created'
  | 'sampled'
  | 'release-requested'
  | 'release-observed'
  | 'release-timeout'
  | 'unexpected-loss';
export interface AttackDieContextLifecycle {
  contextId: number;
  state: AttackDieRendererLifecycle;
  releaseRequested: boolean;
}
export interface AttackDieRendererObservation {
  calls: number | null;
  triangles: number | null;
  geometries: number | null;
  textures: number | null;
  programs: number | null;
  lifecycle: AttackDieRendererLifecycle;
  contextId: number;
}
export function evaluateAttackDieRelease(
  lifecycles: Record<number, AttackDieContextLifecycle>
) {
  const values = Object.values(lifecycles);
  const released =
    values.length > 0 &&
    values.every(
      (value) => value.releaseRequested && value.state === 'release-observed'
    );
  return {
    releaseKnown: released,
    resourcesReleased: released,
    releaseBasis: released ? ('owned-canvas-webglcontextlost' as const) : null,
  };
}
export function applyAttackDieRendererObservation<
  T extends {
    activeContextIds: number[];
    contextLifecycles: Record<number, AttackDieContextLifecycle>;
    rendererInfo: {
      calls: number | null;
      triangles: number | null;
      geometries: number | null;
      textures: number | null;
      programs: number | null;
    };
  },
>(counters: T, info: AttackDieRendererObservation): T {
  const previous = counters.contextLifecycles[info.contextId];
  let next: AttackDieContextLifecycle | undefined;
  if (info.lifecycle === 'created' && !previous)
    next = {
      contextId: info.contextId,
      state: 'created',
      releaseRequested: false,
    };
  if (info.lifecycle === 'sampled' && previous && !previous.releaseRequested)
    next = { ...previous, state: 'sampled' };
  if (
    info.lifecycle === 'release-requested' &&
    previous &&
    previous.state !== 'release-observed'
  )
    next = { ...previous, state: 'release-requested', releaseRequested: true };
  if (info.lifecycle === 'release-observed' && previous?.releaseRequested)
    next = { ...previous, state: 'release-observed' };
  if (
    info.lifecycle === 'release-timeout' &&
    previous?.releaseRequested &&
    previous.state !== 'release-observed'
  )
    next = { ...previous, state: 'release-timeout' };
  if (
    info.lifecycle === 'unexpected-loss' &&
    previous &&
    !previous.releaseRequested
  )
    next = { ...previous, state: 'unexpected-loss' };
  if (!next) return counters;
  const contextLifecycles = {
    ...counters.contextLifecycles,
    [info.contextId]: next,
  };
  const activeContextIds = Object.values(contextLifecycles)
    .filter(
      (value) =>
        !['release-observed', 'release-timeout', 'unexpected-loss'].includes(
          value.state
        )
    )
    .map((value) => value.contextId);
  return {
    ...counters,
    contextLifecycles,
    activeContextIds,
    rendererInfo: {
      calls: info.calls,
      triangles: info.triangles,
      geometries: info.geometries,
      textures: info.textures,
      programs: info.programs,
    },
  };
}
