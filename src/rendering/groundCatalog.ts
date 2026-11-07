export interface GroundStyle {
  readonly ref: string;
  readonly displayName: string;
  readonly diffuse: `ground/images/${string}.png`;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly worldUnitsPerRepeat: number;
}

export interface GroundCatalog {
  readonly schemaVersion: 1;
  readonly styles: readonly GroundStyle[];
}

export type GroundCatalogResult =
  | { readonly ok: true; readonly catalog: GroundCatalog }
  | { readonly ok: false; readonly reason: string };

const REF = /^dnd5e:ground:[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:_[a-z0-9]+)*$/;
const SHA = /^[a-f0-9]{64}$/;
const STYLE_KEYS = [
  'ref',
  'displayName',
  'diffuse',
  'sha256',
  'width',
  'height',
  'worldUnitsPerRepeat',
] as const;

function record(
  value: unknown,
  keys: readonly string[],
  label: string
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  const own = Reflect.ownKeys(value);
  if (
    own.length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key))
  )
    throw new Error(`${label} has invalid keys`);
  return value as Record<string, unknown>;
}

/** Parse only public runtime metadata; no local source path can enter a style. */
export function parseGroundCatalog(value: unknown): GroundCatalogResult {
  try {
    const source = record(value, ['schemaVersion', 'styles'], 'ground catalog');
    if (
      source.schemaVersion !== 1 ||
      !Array.isArray(source.styles) ||
      source.styles.length === 0
    )
      throw new Error('unsupported or empty ground catalog');
    const refs = new Set<string>();
    const images = new Map<string, string>();
    const styles = source.styles.map((item): GroundStyle => {
      const row = record(item, STYLE_KEYS, 'ground style');
      if (
        typeof row.ref !== 'string' ||
        !REF.test(row.ref) ||
        refs.has(row.ref)
      )
        throw new Error('invalid or duplicate ground ref');
      refs.add(row.ref);
      if (
        typeof row.displayName !== 'string' ||
        !row.displayName.trim() ||
        row.displayName !== row.displayName.trim()
      )
        throw new Error('ground display name is required');
      if (
        typeof row.sha256 !== 'string' ||
        !SHA.test(row.sha256) ||
        row.diffuse !== `ground/images/${row.sha256}.png`
      )
        throw new Error('ground image must be hash-bound and contained');
      const { width, height, worldUnitsPerRepeat } = row;
      if (
        typeof width !== 'number' ||
        !Number.isSafeInteger(width) ||
        width <= 0 ||
        typeof height !== 'number' ||
        !Number.isSafeInteger(height) ||
        height <= 0
      )
        throw new Error('invalid ground image dimensions');
      if (
        typeof worldUnitsPerRepeat !== 'number' ||
        !Number.isFinite(worldUnitsPerRepeat) ||
        worldUnitsPerRepeat <= 0
      )
        throw new Error('ground repeat must be positive and finite');
      const dimensions = `${width},${height}`;
      const prior = images.get(row.sha256);
      if (prior !== undefined && prior !== dimensions)
        throw new Error('shared ground image has conflicting dimensions');
      images.set(row.sha256, dimensions);
      return Object.freeze({
        ref: row.ref,
        displayName: row.displayName,
        diffuse: row.diffuse as GroundStyle['diffuse'],
        sha256: row.sha256,
        width,
        height,
        worldUnitsPerRepeat,
      });
    });
    return {
      ok: true,
      catalog: Object.freeze({
        schemaVersion: 1,
        styles: Object.freeze(styles),
      }),
    };
  } catch (cause) {
    return {
      ok: false,
      reason: cause instanceof Error ? cause.message : 'invalid ground catalog',
    };
  }
}

/** Explicit missing appearances are errors; only absent authored refs default. */
export function requireGroundStyle(
  catalog: GroundCatalog,
  ref: string
): GroundStyle {
  const style = catalog.styles.find((row) => row.ref === ref);
  if (!style) throw new Error(`Ground appearance unavailable: ${ref}`);
  return style;
}

export type GroundCatalogSnapshot =
  | { readonly status: 'idle' | 'loading' }
  | {
      readonly status: 'ready';
      readonly catalog: GroundCatalog;
      readonly preview?: boolean;
    }
  | { readonly status: 'error'; readonly message: string };

export interface GroundCatalogStore {
  getSnapshot(): GroundCatalogSnapshot;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
}

/** One request owner shared by Studio and play. A store owns no image resources. */
export function createGroundCatalogStore({
  fetcher = fetch,
}: { fetcher?: typeof fetch } = {}): GroundCatalogStore {
  let snapshot: GroundCatalogSnapshot = Object.freeze({ status: 'idle' });
  let owner: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: GroundCatalogSnapshot): void => {
    snapshot = Object.freeze(next);
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load: () => {
      if (owner) return owner;
      owner = Promise.resolve().then(async () => {
        try {
          const response = await fetcher('/models/synty/ground/manifest.json');
          if (!response.ok)
            throw new Error(
              `Ground catalog unavailable (HTTP ${response.status})`
            );
          const parsed = parseGroundCatalog(await response.json());
          if (!parsed.ok) throw new Error(parsed.reason);
          publish({
            status: 'ready',
            catalog: parsed.catalog,
            ...(response.headers.get('X-RPG-Ground-Preview') === '1'
              ? { preview: true }
              : {}),
          });
        } catch (cause) {
          publish({
            status: 'error',
            message:
              cause instanceof Error
                ? cause.message
                : 'Ground catalog unavailable',
          });
        }
      });
      publish({ status: 'loading' });
      return owner;
    },
  };
}
