import {
  parseWorldMaterialPreview,
  type WorldMaterialCatalog,
} from './worldMaterialCatalog';

/** One explicit candidate metadata request per application load. A failed
 * candidate stays failed until reload; it never silently installs pinned data. */
export function createWorldMaterialPreviewLoader(
  fetcher: typeof fetch = (...args) => fetch(...args)
): () => Promise<WorldMaterialCatalog> {
  let request: Promise<WorldMaterialCatalog> | undefined;
  return () =>
    (request ??= fetcher('/world-material-preview/catalog.json', {
      cache: 'no-store',
    }).then(async (response) => {
      if (!response.ok)
        throw Error('Candidate wall finishes have not been staged.');
      return parseWorldMaterialPreview(await response.json());
    }));
}
