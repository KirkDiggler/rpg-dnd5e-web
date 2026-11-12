// The schema3 target/compatibility/recommendation wire. Geometry validation belongs
// to the exact model adapter; these names alone never certify a loaded model.
const NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const SHA = /^[a-f0-9]{64}$/;
const COLLECTION =
  /^dnd5e:material-collection:[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:_[a-z0-9]+)*$/;
const ASSET =
  /^dnd5e:(?:props|env):[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:_[a-z0-9]+)*$/;
function fail(message) {
  throw new Error(`World material catalog: ${message}`);
}
function keys(value, expected, path) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    expected.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !expected.includes(key))
  )
    fail(`${path} has invalid fields`);
}
function pattern(value, regex, path) {
  if (typeof value !== 'string' || !regex.test(value))
    fail(`${path} is invalid`);
  return value;
}
function rows(value, path) {
  if (!Array.isArray(value) || !value.length)
    fail(`${path} must be a nonempty array`);
  return value;
}
function references(value, known, path) {
  const result = rows(value, path);
  if (result.some((ref) => typeof ref !== 'string' || !known.has(ref)))
    fail(`${path} has an unknown reference`);
  if (new Set(result).size !== result.length)
    fail(`${path} has duplicate references`);
  return [...result];
}

/** Typed metadata views of the same material catalog, never a second source.
 * @param {{collections: unknown, bindings: unknown, atlasRefs: Set<string>, atlasFamilies: Set<string>}} input
 * @returns {{collections: import('./worldMaterialTypes').WorldMaterialCollection[], bindings: import('./worldMaterialTypes').WorldAtlasBinding[]}}
 */
export function parseWorldAtlasMetadata({
  collections,
  bindings,
  atlasRefs,
  atlasFamilies,
}) {
  if (!atlasRefs.size) fail('schema3 must include atlas choices');
  const collectionRefs = new Set();
  const parsedCollections = rows(collections, 'collections').map(
    (row, index) => {
      const at = `collections[${index}]`;
      keys(row, ['ref', 'displayName', 'materials'], at);
      const ref = pattern(row.ref, COLLECTION, `${at}.ref`);
      if (collectionRefs.has(ref)) fail(`duplicate collection ref: ${ref}`);
      collectionRefs.add(ref);
      if (
        typeof row.displayName !== 'string' ||
        !row.displayName.trim() ||
        row.displayName !== row.displayName.trim() ||
        /[\p{C}\p{Zl}\p{Zp}]/u.test(row.displayName)
      )
        fail(`${at}.displayName is invalid`);
      return {
        ref,
        displayName: row.displayName,
        materials: references(row.materials, atlasRefs, `${at}.materials`),
      };
    }
  );
  const assetRefs = new Set();
  const parsedBindings = rows(bindings, 'bindings').map((row, index) => {
    const at = `bindings[${index}]`;
    keys(row, ['assetRef', 'glbSha256', 'surfaces'], at);
    const assetRef = pattern(row.assetRef, ASSET, `${at}.assetRef`);
    if (assetRefs.has(assetRef)) fail(`duplicate asset binding: ${assetRef}`);
    assetRefs.add(assetRef);
    const glbSha256 = pattern(row.glbSha256, SHA, `${at}.glbSha256`);
    const ids = new Set(),
      targets = new Set();
    const surfaces = rows(row.surfaces, `${at}.surfaces`).map((surface, si) => {
      const path = `${at}.surfaces[${si}]`;
      keys(
        surface,
        [
          'id',
          'node',
          'material',
          'texCoord',
          'defaultBaseColorSha256',
          'sampler',
          'compatibleFamilies',
          'suggestedCollections',
        ],
        path
      );
      const id = pattern(surface.id, NAME, `${path}.id`);
      const node = pattern(surface.node, NAME, `${path}.node`);
      const material = pattern(surface.material, NAME, `${path}.material`);
      const target = JSON.stringify([node, material]);
      if (ids.has(id) || targets.has(target))
        fail(`${path} has duplicate surface scope`);
      ids.add(id);
      targets.add(target);
      if (
        !Number.isInteger(surface.texCoord) ||
        surface.texCoord < 0 ||
        surface.texCoord > 3
      )
        fail(`${path}.texCoord is invalid`);
      const defaultBaseColorSha256 = pattern(
        surface.defaultBaseColorSha256,
        SHA,
        `${path}.defaultBaseColorSha256`
      );
      keys(
        surface.sampler,
        ['wrapS', 'wrapT', 'magFilter', 'minFilter'],
        `${path}.sampler`
      );
      const sampler = {};
      for (const [key, allowed] of Object.entries({
        wrapS: [33071, 33648, 10497],
        wrapT: [33071, 33648, 10497],
        magFilter: [9728, 9729],
        minFilter: [9728, 9729, 9984, 9985, 9986, 9987],
      })) {
        const value = surface.sampler[key];
        if (!Number.isInteger(value) || !allowed.includes(value))
          fail(`${path}.sampler.${key} is invalid`);
        sampler[key] = value;
      }
      return {
        id,
        node,
        material,
        texCoord: surface.texCoord,
        defaultBaseColorSha256,
        sampler,
        compatibleFamilies: references(
          surface.compatibleFamilies,
          atlasFamilies,
          `${path}.compatibleFamilies`
        ),
        suggestedCollections: references(
          surface.suggestedCollections,
          collectionRefs,
          `${path}.suggestedCollections`
        ),
      };
    });
    return { assetRef, glbSha256, surfaces };
  });
  return { collections: parsedCollections, bindings: parsedBindings };
}
