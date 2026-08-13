export type AttackDiePerfMode = 'svg' | '3d';

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
  const frameTime = input.candidateP95 <= input.svgP95 * 1.1;
  const longTasks = input.attributableLongTasks === 0;
  const postUnmount =
    input.candidatePostUnmountP95 <= input.svgPostUnmountP95 * 1.1;
  return {
    frameTime,
    longTasks,
    postUnmount,
    pass: frameTime && longTasks && postUnmount,
  };
}
