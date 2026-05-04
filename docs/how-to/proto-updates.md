---
name: updating proto types
description: How to bump rpg-api-protos and regenerate the lock file
updated: 2026-05-02
---

# Updating proto types

`@kirkdiggler/rpg-api-protos` is installed from GitHub. Version bumps require regenerating the lock file.

## Check current version

```bash
grep rpg-api-protos package.json
# Or:
gh release list -R KirkDiggler/rpg-api-protos --limit 5
```

## Bump to a new version

```bash
# Install specific tag
npm i --save github:KirkDiggler/rpg-api-protos#v0.1.87

# If the above doesn't pick up the right commit, regenerate everything:
rm -rf node_modules package-lock.json && npm install
```

Always commit both `package.json` and `package-lock.json`. The lock file must point to the correct commit hash.

## After a proto bump: check these

1. **New fields on EntityPlacement** — update `entityStateToPlacement` in `LobbyView.tsx:120` (or `utils/encounterStateTransforms.ts` after PR #378 merges)
2. **New event types in EncounterEvent oneof** — add a case to the `dispatchEvent` switch in `useEncounterStream.ts:99`
3. **New enum values** — update `enumDisplays.ts` and `enumRegistry.ts` display string maps
4. **New message types** — update relevant hook wrappers in `encounterHooks.ts`
5. Run `npm run ci-check` to verify TypeScript is satisfied

## Why lock file regeneration is required

GitHub dependencies with tags don't always update properly. The lock file can keep pointing to old commits even after `package.json` is updated. CI uses the lock file, not `package.json`, so stale lock files cause CI to use the wrong proto version silently.
