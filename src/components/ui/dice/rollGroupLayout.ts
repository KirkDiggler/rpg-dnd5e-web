import type { DiceKind, DiceRollGroupDie } from './diceRollGroup';

export interface RollGroupMemberLayout {
  readonly dieId: string;
  readonly center: readonly [number, number];
  readonly radius: number;
}

const HELD_GAP = 0.024;
const RESTING_GAP = 0.042;
const RESTING_LIMIT = 0.66;

const RADIUS_BY_KIND: Readonly<Record<DiceKind, number>> = Object.freeze({
  d4: 0.095,
  d6: 0.105,
  d8: 0.1125,
  d10: 0.1175,
  d12: 0.1225,
  d20: 0.135,
});

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function frozenTuple(x: number, y: number): readonly [number, number] {
  return Object.freeze([x, y] as const);
}

function frozenLayout(
  dieId: string,
  center: readonly [number, number],
  radius: number
): RollGroupMemberLayout {
  return Object.freeze({ dieId, center, radius });
}

function rowSizesFor(count: number): readonly number[] {
  if (count <= 0) return [];
  if (count === 1) return [1];
  if (count === 2) return [2];
  if (count === 3) return [2, 1];
  if (count === 4) return [2, 2];
  if (count === 5) return [3, 2];
  if (count === 6) return [3, 3];
  if (count === 7) return [3, 2, 2];
  if (count === 8) return [3, 2, 3];

  const rows: number[] = [];
  let remaining = count;
  while (remaining > 0) {
    const size = remaining > 4 ? 3 : remaining === 4 ? 2 : remaining;
    rows.push(size);
    remaining -= size;
  }
  return rows;
}

function radiusFor(kind: DiceKind): number {
  return RADIUS_BY_KIND[kind] ?? RADIUS_BY_KIND.d20;
}

function rotate(
  center: readonly [number, number],
  angle: number
): readonly [number, number] {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return frozenTuple(
    center[0] * cosine - center[1] * sine,
    center[0] * sine + center[1] * cosine
  );
}

function hashUnit(seed: number, index: number, salt: number): number {
  let state = (seed ^ Math.imul(index + 1, 0x9e37_79b9) ^ salt) >>> 0;
  state ^= state >>> 16;
  state = Math.imul(state, 0x7feb_352d) >>> 0;
  state ^= state >>> 15;
  state = Math.imul(state, 0x846c_a68b) >>> 0;
  state ^= state >>> 16;
  return state / 0x1_0000_0000;
}

function centerLayouts(
  layouts: readonly RollGroupMemberLayout[]
): readonly RollGroupMemberLayout[] {
  if (layouts.length === 0) return Object.freeze([]);

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const member of layouts) {
    minX = Math.min(minX, member.center[0] - member.radius);
    maxX = Math.max(maxX, member.center[0] + member.radius);
    minY = Math.min(minY, member.center[1] - member.radius);
    maxY = Math.max(maxY, member.center[1] + member.radius);
  }

  const offsetX = (minX + maxX) / 2;
  const offsetY = (minY + maxY) / 2;
  return Object.freeze(
    layouts.map((member) =>
      frozenLayout(
        member.dieId,
        frozenTuple(member.center[0] - offsetX, member.center[1] - offsetY),
        member.radius
      )
    )
  );
}

function packBaseLayout(
  dice: readonly Pick<DiceRollGroupDie, 'id' | 'kind'>[],
  gap: number
): readonly RollGroupMemberLayout[] {
  const rows = rowSizesFor(dice.length);
  const rowOffsets: number[] = [];
  const rowHeights: number[] = [];
  let diceOffset = 0;
  let previousMaxRadius = 0;
  let currentY = 0;

  for (const size of rows) {
    const slice = dice.slice(diceOffset, diceOffset + size);
    const maxRadius = slice.reduce(
      (largest, die) => Math.max(largest, radiusFor(die.kind)),
      0
    );
    if (rowHeights.length > 0) {
      currentY -= previousMaxRadius + maxRadius + gap * 0.9;
    }
    rowOffsets.push(currentY);
    rowHeights.push(maxRadius);
    previousMaxRadius = maxRadius;
    diceOffset += size;
  }

  const layouts: RollGroupMemberLayout[] = [];
  diceOffset = 0;
  rows.forEach((size, rowIndex) => {
    const slice = dice.slice(diceOffset, diceOffset + size);
    const centers: number[] = [];
    let cursor = 0;
    slice.forEach((die, index) => {
      const radius = radiusFor(die.kind);
      if (index === 0) {
        centers.push(0);
      } else {
        const previousRadius = radiusFor(slice[index - 1].kind);
        cursor += previousRadius + radius + gap;
        centers.push(cursor);
      }
    });

    const rowMin = Math.min(
      ...centers.map((center, index) => center - radiusFor(slice[index].kind))
    );
    const rowMax = Math.max(
      ...centers.map((center, index) => center + radiusFor(slice[index].kind))
    );
    const offsetX = (rowMin + rowMax) / 2;
    slice.forEach((die, index) => {
      layouts.push(
        frozenLayout(
          die.id,
          frozenTuple(centers[index] - offsetX, rowOffsets[rowIndex]),
          radiusFor(die.kind)
        )
      );
    });
    diceOffset += size;
  });

  return centerLayouts(layouts);
}

function containedLayout(
  layouts: readonly RollGroupMemberLayout[]
): readonly RollGroupMemberLayout[] {
  const mutable = layouts.map((member) => ({
    dieId: member.dieId,
    radius: member.radius,
    center: [member.center[0], member.center[1]] as [number, number],
  }));

  for (let pass = 0; pass < 10; pass += 1) {
    for (let index = 0; index < mutable.length; index += 1) {
      for (let other = index + 1; other < mutable.length; other += 1) {
        const first = mutable[index];
        const second = mutable[other];
        const dx = second.center[0] - first.center[0];
        const dy = second.center[1] - first.center[1];
        const distance = Math.hypot(dx, dy);
        const minimumDistance = first.radius + second.radius + 0.001;
        if (distance >= minimumDistance) continue;

        const axisX = distance > 1e-9 ? dx / distance : 1;
        const axisY = distance > 1e-9 ? dy / distance : 0;
        const push = (minimumDistance - Math.max(distance, 1e-9)) / 2;
        first.center[0] -= axisX * push;
        first.center[1] -= axisY * push;
        second.center[0] += axisX * push;
        second.center[1] += axisY * push;
      }
    }

    for (const member of mutable) {
      member.center[0] = clamp(
        member.center[0],
        -RESTING_LIMIT + member.radius,
        RESTING_LIMIT - member.radius
      );
      member.center[1] = clamp(
        member.center[1],
        -RESTING_LIMIT + member.radius,
        RESTING_LIMIT - member.radius
      );
    }
  }

  return Object.freeze(
    mutable.map((member) =>
      frozenLayout(
        member.dieId,
        frozenTuple(member.center[0], member.center[1]),
        member.radius
      )
    )
  );
}

export function layoutHeldRollGroup(
  dice: readonly Pick<DiceRollGroupDie, 'id' | 'kind'>[]
): readonly RollGroupMemberLayout[] {
  return packBaseLayout(dice, HELD_GAP);
}

export function layoutRestingRollGroup(
  dice: readonly Pick<DiceRollGroupDie, 'id' | 'kind'>[],
  motionSeed: number
): readonly RollGroupMemberLayout[] {
  const base = packBaseLayout(dice, RESTING_GAP);
  const globalAngle =
    (hashUnit(motionSeed >>> 0, dice.length, 0x51f2_ea17) - 0.5) * 0.8;
  const rotated = base.map((member, index) => {
    const rotatedCenter = rotate(member.center, globalAngle);
    const jitterAngle =
      hashUnit(motionSeed >>> 0, index, 0x7a1c_2d41) * Math.PI * 2;
    const jitterDistance =
      hashUnit(motionSeed >>> 0, index, 0x193a_6754) * 0.05;
    const jitterX = Math.cos(jitterAngle) * jitterDistance;
    const jitterY = Math.sin(jitterAngle) * jitterDistance;
    return frozenLayout(
      member.dieId,
      frozenTuple(rotatedCenter[0] + jitterX, rotatedCenter[1] + jitterY),
      member.radius
    );
  });

  return containedLayout(centerLayouts(rotated));
}
