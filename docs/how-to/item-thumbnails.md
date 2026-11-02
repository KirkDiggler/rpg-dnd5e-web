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
paths/hashes/dimensions. It accepts the explicit legacy v1/128px contract and
item-owned v2/512px contract; unknown versions, renderer identities and mixed
dimensions refuse. The generated provider commit pins `thumbnails/items/`.
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

The ordinary equipment Concept supplies explicit fixture icon keys; these
intentionally win over default thumbnails. Use
`?concept=equipment&thumbnailPreview=1` to exercise the real equipment panel with
empty fixture `iconKey` values, matching current production data. Its clicks
change only the fixture. `node scripts/check-equipment-thumbnails.mjs <origin>`
checks decoded art, layout and the existing fixture equip/unequip behavior.

Owned inventory uses 128px image frames; equipped slots use 160px (128px on narrow
screens). The owned panel can use up to 960px of the available viewport, retaining
containment without cropping the source image. Vendor lists retain their existing
compact dimensions. These are display sizes, not another capture or image source.

## Local art review

The existing dev server can serve a candidate gallery at `/item-art-preview/`.
Place only its `index.html`, `request.json` and `images/*.png` under ignored
`.local/item-art-preview/`. The narrow mount is dev-only and refuses traversal,
symlinks, writes and model/script routes. Candidate bytes stay outside `public/`
and are not copied into production builds. Reuse the current preview server
rather than creating a server per art iteration.
