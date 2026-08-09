import {
  validateVisualAssetCatalog,
  validateVisualAssetProviderLock,
  verifyCatalogProvenance,
} from './catalogValidation';
import rawProviderLock from './provider-lock.json';
import rawCatalog from './synty-web-assets.json';

/** Exact, build-bundled, license-safe projection from the locked provider. */
export const VISUAL_ASSET_CATALOG = validateVisualAssetCatalog(rawCatalog);
export const VISUAL_ASSET_PROVIDER_LOCK =
  validateVisualAssetProviderLock(rawProviderLock);

verifyCatalogProvenance(VISUAL_ASSET_PROVIDER_LOCK, {
  sha256: '0b816d6f08584e66c90556f9ad4d040c71086c1dbf698bf7d5030fb05c490669',
  schemaVersion: VISUAL_ASSET_CATALOG.schemaVersion,
  catalogId: VISUAL_ASSET_CATALOG.catalogId,
  toolName: VISUAL_ASSET_CATALOG.tool.name,
  toolVersion: VISUAL_ASSET_CATALOG.tool.version,
});
