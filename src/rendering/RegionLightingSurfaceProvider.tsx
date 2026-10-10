import type { RegionLightingProjection } from '@/concepts/world-building/regionLighting';
import { toSpatialBackgroundAreas } from '@/concepts/world-building/regionLightingGeometry';
import { useThree } from '@react-three/fiber';
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import {
  createRegionLightingFieldTextures,
  REGION_LIGHTING_SHADER_MARKER,
  updateRegionLightingPoints,
  type RegionLightingDiagnostic,
  type RegionLightingFieldTextures,
  type RegionLightingMaterialBinding,
} from './regionLightingMaterials';
import { buildSpatialBackgroundField } from './spatialBackgroundField';
import type { RenderablePointLight } from './visualPointLightSelection';

/** Canvas-scoped resource owner. It owns no document, selection or light policy. */
export function RegionLightingSurfaceProvider({
  projection,
  pointLights,
  onDiagnostic,
  onDiagnosticsChange,
  children,
}: {
  projection: RegionLightingProjection;
  pointLights: readonly RenderablePointLight[];
  onDiagnostic(diagnostic: RegionLightingDiagnostic): void;
  onDiagnosticsChange?(diagnostics: readonly RegionLightingDiagnostic[]): void;
  children(binding: RegionLightingMaterialBinding | undefined): ReactNode;
}): ReactNode {
  const { gl, invalidate } = useThree();
  const callback = useRef(onDiagnostic);
  callback.current = onDiagnostic;
  const statusCallback = useRef(onDiagnosticsChange);
  statusCallback.current = onDiagnosticsChange;
  // Current render status, not a lifetime log. Material refusals survive field
  // uploads because the stable binding does not rerun material treatment.
  const reported = useRef(new Map<string, RegionLightingDiagnostic>());
  const shaderFailed = useRef(false);
  const retire = useCallback((all: boolean, keep?: string): void => {
    let changed = false;
    for (const [key, diagnostic] of reported.current) {
      if (
        key !== keep &&
        (all ||
          diagnostic.reason === 'field-build' ||
          diagnostic.reason === 'gpu-capacity')
      ) {
        reported.current.delete(key);
        changed = true;
      }
    }
    if (changed) statusCallback.current?.([...reported.current.values()]);
  }, []);
  const [binding, setBinding] = useState<RegionLightingMaterialBinding>();
  const active = useRef<RegionLightingMaterialBinding | undefined>(undefined);
  const resources = useRef<RegionLightingFieldTextures | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const report = useCallback(
    (diagnostic: RegionLightingDiagnostic): void => {
      const key = JSON.stringify(diagnostic);
      if (!reported.current.has(key)) {
        reported.current.set(key, diagnostic);
        callback.current(diagnostic);
        statusCallback.current?.([...reported.current.values()]);
      }
      if (
        diagnostic.reason === 'shader-compile' ||
        diagnostic.reason === 'shader-contract'
      ) {
        shaderFailed.current = true;
        setFailed(true);
        invalidate();
      }
    },
    [invalidate]
  );

  useLayoutEffect(() => {
    const previous = gl.debug.onShaderError;
    const handler: NonNullable<typeof previous> = (
      context,
      program,
      vertex,
      fragment
    ) => {
      previous?.(context, program, vertex, fragment);
      const sources =
        (context.getShaderSource(vertex) ?? '') +
        (context.getShaderSource(fragment) ?? '');
      if (sources.includes(REGION_LIGHTING_SHADER_MARKER)) {
        report({
          reason: 'shader-compile',
          message: `Region lighting shader failed; field disabled. ${context.getProgramInfoLog(program) ?? ''} ${context.getShaderInfoLog(vertex) ?? ''} ${context.getShaderInfoLog(fragment) ?? ''}`,
        });
      }
    };
    gl.debug.onShaderError = handler;
    return () => {
      gl.debug.onShaderError = previous;
    };
  }, [gl, report]);

  useLayoutEffect(() => {
    const retireField = (): void => {
      retire(true);
      shaderFailed.current = false;
      setFailed(false);
      setBinding(undefined);
      invalidate();
    };
    if (!projection.areas.length) {
      retireField();
      return;
    }
    let field;
    try {
      field = buildSpatialBackgroundField(toSpatialBackgroundAreas(projection));
    } catch (error) {
      setBinding(undefined);
      const diagnostic: RegionLightingDiagnostic = {
        reason: 'field-build',
        message: String(error),
      };
      retire(false, JSON.stringify(diagnostic));
      report(diagnostic);
      invalidate();
      return;
    }
    if (!field.triangles.length) {
      retireField();
      return;
    }
    // Upload success cannot repair a material/program contract failure. Keep
    // the fallback until lighting retires, when material treatment also retires.
    if (shaderFailed.current) {
      retire(false);
      setBinding(undefined);
      invalidate();
      return;
    }
    let textures;
    try {
      textures = createRegionLightingFieldTextures(
        field,
        gl.capabilities.maxTextureSize
      );
      // Force upload here so capacity/upload failures cannot leave the old field alive.
      for (const texture of [
        textures.triangles,
        textures.heads,
        textures.candidates,
      ])
        gl.initTexture(texture);
      const context = gl.getContext();
      const error = context.getError();
      if (context.isContextLost() || error !== context.NO_ERROR)
        throw new Error(`Region lighting texture upload failed (GL ${error}).`);
    } catch (error) {
      textures?.dispose();
      setBinding(undefined);
      const diagnostic: RegionLightingDiagnostic = {
        reason: 'gpu-capacity',
        message: String(error),
      };
      retire(false, JSON.stringify(diagnostic));
      report(diagnostic);
      invalidate();
      return;
    }
    retire(false);
    resources.current = textures;
    const b = active.current ?? {
      uniforms: {
        rlTriangles: { value: textures.triangles },
        rlHeads: { value: textures.heads },
        rlCandidates: { value: textures.candidates },
        rlBounds: { value: new THREE.Vector4() },
        rlGridSize: { value: 64 },
        rlPointPositions: {
          value: Array.from({ length: 12 }, () => new THREE.Vector4()),
        },
        rlPointColors: {
          value: Array.from({ length: 12 }, () => new THREE.Vector3()),
        },
        rlPointCount: { value: 0 },
      },
      reportDiagnostic: report,
    };
    b.uniforms.rlTriangles.value = textures.triangles;
    b.uniforms.rlHeads.value = textures.heads;
    b.uniforms.rlCandidates.value = textures.candidates;
    const bounds = field.bounds;
    b.uniforms.rlBounds.value.set(
      bounds.minX,
      bounds.maxX,
      bounds.minZ,
      bounds.maxZ
    );
    active.current = b;
    setBinding(b);
    invalidate();
    return () => {
      textures.dispose();
      if (resources.current === textures) resources.current = undefined;
    };
  }, [projection, gl, invalidate, report, retire]);
  useLayoutEffect(() => {
    if (failed) {
      resources.current?.dispose();
      resources.current = undefined;
    }
  }, [failed]);
  useLayoutEffect(() => {
    if (!binding) return;
    try {
      updateRegionLightingPoints(binding.uniforms, pointLights);
    } catch (error) {
      setBinding(undefined);
      report({ reason: 'gpu-capacity', message: String(error) });
    }
    invalidate();
  }, [binding, pointLights, invalidate, report]);
  return children(projection.areas.length && !failed ? binding : undefined);
}
