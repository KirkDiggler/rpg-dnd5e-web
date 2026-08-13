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
    contextsActive: number;
    geometries: number;
    textures: number;
    programs: number;
  };
}) {
  const healthy =
    input.samples.filter((sample) => sample.mode === '3d').length > 0 &&
    input.samples
      .filter((sample) => sample.mode === '3d')
      .every((sample) => sample.healthy3d);
  const resourcesReleased = Object.values(input.postUnmountCounters).every(
    (value) => value === 0
  );
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
    resourcesReleased,
    pass: budget.pass && healthy && resourcesReleased,
  };
}
