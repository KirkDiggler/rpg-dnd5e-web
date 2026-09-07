import { parseRef } from '@/utils/refs';

export const COMPOSITION_REF_MODULE = 'composition';
export const COMPOSITION_REF_TYPE = 'props';

/**
 * Encode the content-owned Composition.ID in the existing opaque prop-ref
 * field. WorldID deliberately does not participate: it comes from the reader
 * context that resolves this reference.
 */
export function compositionRef(compositionId: string): string {
  const ref = `${COMPOSITION_REF_MODULE}:${COMPOSITION_REF_TYPE}:${compositionId}`;
  const parsed = parseRef(ref);
  if (
    !parsed ||
    parsed.module !== COMPOSITION_REF_MODULE ||
    parsed.type !== COMPOSITION_REF_TYPE ||
    parsed.idParts.length !== 1
  ) {
    throw new Error(
      'Composition.ID must be one non-empty ref token (letters, digits, underscore, or hyphen).'
    );
  }
  return ref;
}

/** Return the opaque Composition.ID, or null when this is another prop ref. */
export function compositionIdFromRef(ref: string): string | null {
  const parsed = parseRef(ref);
  if (
    !parsed ||
    parsed.module !== COMPOSITION_REF_MODULE ||
    parsed.type !== COMPOSITION_REF_TYPE ||
    parsed.idParts.length !== 1
  ) {
    return null;
  }
  return parsed.id;
}

export function isCompositionRef(ref: string): boolean {
  return compositionIdFromRef(ref) !== null;
}
