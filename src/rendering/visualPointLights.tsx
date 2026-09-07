import type { ReactElement } from 'react';
import type { RenderablePointLight } from './visualPointLightSelection';

export function VisualPointLights({
  lights,
}: {
  lights: readonly RenderablePointLight[];
}): ReactElement {
  return (
    <>
      {lights.map((light) => (
        <pointLight
          key={light.key}
          position={light.position}
          color={light.color}
          intensity={light.intensity}
          distance={light.distance}
          decay={2}
        />
      ))}
    </>
  );
}
