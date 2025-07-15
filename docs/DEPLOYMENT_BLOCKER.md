# ⚠️ PRODUCTION DEPLOYMENT BLOCKER

This project currently **CANNOT be deployed to production** due to a local file dependency.

## The Problem

```json
"@kirkdiggler/rpg-api-protos": "file:../rpg-api-protos"
```

This dependency structure requires the `rpg-api-protos` directory to exist as a sibling to this project, which is impossible in production deployment environments (Vercel, Netlify, AWS, etc.).

## Why This Exists

- The `rpg-api-protos` repository generates TypeScript code from protobuf definitions
- The generated code is on a `generated` branch
- We need these types for type-safe API communication

## Attempted Solutions

1. **GitHub dependency** (`github:KirkDiggler/rpg-api-protos#generated`)
   - ❌ Failed: The generated branch's package.json has incorrect `files` configuration
   - The TypeScript files exist in `gen/ts/` but package.json expects them in `dnd5e/`

2. **CI Stub files**
   - ❌ Not viable: Creates type mismatches and doesn't solve production deployment

## Required Solution

The `rpg-api-protos` generated branch needs to be fixed:

1. Update package.json `files` field to include the actual generated files:

   ```json
   "files": [
     "gen/ts/**/*.js",
     "gen/ts/**/*.d.ts",
     "gen/ts/**/*.ts"
   ]
   ```

2. Update `main` and `types` fields to point to correct paths:

   ```json
   "main": "gen/ts/dnd5e/api/v1alpha1/character_pb.js",
   "types": "gen/ts/dnd5e/api/v1alpha1/character_pb.d.ts"
   ```

3. OR restructure the generated output to match the current package.json expectations

## Alternative Solutions

1. **Publish to npm** - Most standard approach
2. **Include generated files in this repo** - Not ideal but works
3. **Git submodule** - Complex but viable

## Impact

Until this is resolved:

- ❌ Cannot deploy to Vercel
- ❌ Cannot deploy to Netlify
- ❌ Cannot deploy to any cloud platform
- ❌ Cannot build Docker images
- ✅ Local development works fine

See Issue #14 for tracking.
