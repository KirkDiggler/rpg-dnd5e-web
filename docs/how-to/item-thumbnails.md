# Item thumbnails

The private assets provider owns static item images and
`harness/catalogs/synty-item-thumbnails.json`. Web commits only generated
metadata in `src/generated/itemThumbnailCatalog.ts`, never licensed images.

## Adopt a provider release

Use an exactly clean provider checkout at the intended commit:

```sh
node scripts/generate-item-thumbnail-catalog.mjs \
  --provider-root /absolute/path/to/rpg-game-assets \
  --output src/generated/itemThumbnailCatalog.ts
RPG_GAME_ASSETS_PATH=/absolute/path/to/rpg-game-assets npm run assets:sync:pinned
```

Generation validates the weapon manifest, exact model hashes and image
paths/hashes/dimensions. The generated provider commit pins `thumbnails/items/`.
Normal pinned sync preserves that subtree even if the provider checkout has
advanced. Image URLs include their PNG digest for cache invalidation.

Verify the committed projection and local image bytes without regenerating:

```sh
node scripts/generate-item-thumbnail-catalog.mjs \
  --provider-root /absolute/path/to/rpg-game-assets \
  --check-pin <commit-from-generated-catalog> \
  --runtime-root public/models/synty \
  --output src/generated/itemThumbnailCatalog.ts
```

## Render

`getItemIconUrl({module, type, id}, iconKey)` preserves explicit wire icon
precedence, then resolves an exact published thumbnail, then legacy sprites.
Incomplete references do not borrow thumbnails by ID. Equipment and inventory
already use this helper; unknown items and failed images retain their existing
named fallback. No GLB capture occurs when opening inventory.

The equipment Concept supplies explicit fixture icon keys; these intentionally
win over default thumbnails. A browser check of default thumbnails must supply
empty `iconKey` values, matching the current production data, rather than
mistaking the fixture's explicit sprite choice for a resolver failure.
