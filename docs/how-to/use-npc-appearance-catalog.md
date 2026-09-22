# Consume NPC appearances and thumbnails

The NPC appearance catalog is a generated, exact-identity presentation catalog. It is deliberately separate from `WORLD_BUILDING_CATALOG`, which contains placeable props.

The committed catalog records the provider commit it was generated from. A
serving sync reproduces exactly that revision and never rewrites the catalog:

```bash
npm run assets:sync:pinned
```

Adopting a newer provider revision moves the pin, so it is an explicit,
reviewed change that regenerates the catalog in the same step:

```bash
RPG_GAME_ASSETS_PATH=/path/to/rpg-game-assets npm run assets:sync:bump
```

## Enumerate and resolve metadata

```ts
import {
  NPC_APPEARANCE_CATALOG,
  resolveNpcAppearance,
} from '@/npc-appearances';

for (const appearance of NPC_APPEARANCE_CATALOG) {
  console.log(appearance.assetRef, appearance.displayName);
}

const appearance = resolveNpcAppearance('dnd5e:npcs:goblin:warrior-male-01');
if (appearance) {
  console.log(appearance.standingUrl, appearance.downedUrl);
}
```

Lookup is exact-only. The catalog does not infer species, faction, statistics, a combat default, or a rules identity; every current `rulesRef` is `null`.

## Request a thumbnail

Render one producer for the active item in the caller's serial queue. The component computes its cache key from the exact asset ref and standing-model SHA-256, then uses the shared thumbnail surface around the skeleton-safe `ClassCharacterModel` path.

```tsx
import {
  NpcAppearanceThumbnailProducer,
  npcAppearanceThumbnailKey,
  type GeneratedNpcAppearance,
} from '@/npc-appearances';

function ActiveNpcThumbnail({
  appearance,
  cache,
}: {
  appearance: GeneratedNpcAppearance;
  cache: Map<string, string>;
}) {
  const key = npcAppearanceThumbnailKey(appearance);
  if (cache.has(key)) return null;

  return (
    <NpcAppearanceThumbnailProducer
      appearance={appearance}
      onComplete={(completedKey, image) => cache.set(completedKey, image)}
      onError={(failedKey, message) =>
        console.warn('NPC thumbnail failed', failedKey, message)
      }
      onRootError={(message) =>
        console.warn('thumbnail surface failed', message)
      }
    />
  );
}
```

The completion value is a PNG data URL, matching existing palette thumbnail behavior. Keep at most one producer mounted for a serial batch; unmount it after completion or failure.

World Builder (or another future consumer) owns placement and any association between an appearance asset ref and a monster/rules ref. This producer slice does **not** implement either concern.
