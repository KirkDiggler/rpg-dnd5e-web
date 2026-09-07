/** Render-ready point light values shared by composition and dungeon paths. */
export interface RenderablePointLight {
  readonly key: string;
  readonly position: readonly [number, number, number];
  readonly color: string;
  readonly intensity: number;
  readonly distance: number;
}

/** An authored source keeps declaration identities for later consumers. */
export interface VisualPointLightSource extends RenderablePointLight {
  readonly compositionId: string;
  readonly placementId: string;
  readonly partId: string;
}

/** Keep the established nearest-to-view policy with a stable identity tie-break. */
export function selectBoundedVisualPointLights<T extends RenderablePointLight>(
  sources: readonly T[],
  focus: Readonly<{ x: number; z: number }>,
  budget: number
): readonly T[] {
  return [...sources]
    .sort((left, right) => {
      const leftDx = left.position[0] - focus.x;
      const leftDz = left.position[2] - focus.z;
      const rightDx = right.position[0] - focus.x;
      const rightDz = right.position[2] - focus.z;
      const distanceDifference =
        leftDx * leftDx +
        leftDz * leftDz -
        (rightDx * rightDx + rightDz * rightDz);
      if (distanceDifference !== 0) return distanceDifference;
      return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
    })
    .slice(0, Math.max(0, budget));
}
