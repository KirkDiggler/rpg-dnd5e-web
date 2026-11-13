export interface WallFrameSpan {
  before: number;
  after: number;
}
export interface DoorFrameFaceFinish {
  side: 'positive-z' | 'negative-z';
  materialRef: string;
  phaseU: number;
}
/** Renderer/native-authoring lengths are scene units. The wire adapter scales
 * canonical feet once; phases are unitless. No parent identity or door state. */
export interface DoorFramePresentation {
  span: WallFrameSpan;
  faceFinishes: DoorFrameFaceFinish[];
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error(`${path}: expected an object.`);
  return value as Record<string, unknown>;
}
export function copyWallFrameSpan(
  value: unknown,
  path = 'frame span',
  scale = 1
): WallFrameSpan | undefined {
  if (value === undefined) return undefined;
  const row = object(value, path);
  const length = (key: string): number => {
    const number = row[key];
    if (
      typeof number !== 'number' ||
      !Number.isFinite(number) ||
      number <= 0 ||
      !Number.isFinite(scale) ||
      scale <= 0 ||
      !Number.isFinite(number * scale)
    )
      throw Error(`${path}.${key}: expected finite positive extent.`);
    return number * scale;
  };
  return { before: length('before'), after: length('after') };
}
export function copyDoorFramePresentation(
  value: unknown,
  path = 'door frame',
  scale = 1
): DoorFramePresentation | undefined {
  if (value === undefined) return undefined;
  const row = object(value, path),
    span = copyWallFrameSpan(row.span, `${path}.span`, scale);
  if (!span) throw Error(`${path}: a present frame requires its span.`);
  const faces = row.faceFinishes === undefined ? [] : row.faceFinishes;
  if (!Array.isArray(faces))
    throw Error(`${path}.faceFinishes: expected a list.`);
  const seen = new Set<string>();
  return {
    span,
    faceFinishes: faces.map((value, index) => {
      const at = `${path}.faceFinishes[${index}]`,
        face = object(value, at);
      const { side, materialRef, phaseU } = face;
      if ((side !== 'positive-z' && side !== 'negative-z') || seen.has(side))
        throw Error(`${at}.side: unknown or duplicate fixed face.`);
      if (typeof materialRef !== 'string' || !materialRef.trim())
        throw Error(`${at}.materialRef: expected nonblank ref.`);
      if (
        typeof phaseU !== 'number' ||
        !Number.isFinite(phaseU) ||
        phaseU < 0 ||
        phaseU >= 1
      )
        throw Error(`${at}.phaseU: expected explicit wrapped phase in [0,1).`);
      seen.add(side);
      return { side, materialRef, phaseU };
    }),
  };
}
