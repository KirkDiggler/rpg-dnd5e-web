/** Compatibility import for the existing editor owner; resources also serve
 * the shared runtime renderer, without a second catalog or request cache. */
export {
  useWorldMaterialCatalog,
  type WorldMaterialCatalogState,
} from '@/rendering/useWorldMaterialCatalog';
