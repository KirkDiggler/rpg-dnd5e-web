# Local Development Setup

## rpg-api-protos Integration

Currently, the project uses a local file dependency for `@kirkdiggler/rpg-api-protos`:

```json
"@kirkdiggler/rpg-api-protos": "file:../rpg-api-protos"
```

### Why Local Development?

- The proto definitions are slow-changing and part of the API contract
- During development, it's convenient to work on both repos simultaneously
- Changes to protos should be driven by API requirements, not UI needs

### Current Workaround for CI

The CI uses a stub script (`scripts/ci-setup-protos.sh`) to create minimal type definitions. This is a **temporary solution**.

### Production Deployment Issue ⚠️

**This setup will NOT work in production deployments** because:

- The `../rpg-api-protos` directory won't exist on deployment servers
- `file:` dependencies are not suitable for production builds
- The deployment process can't access local filesystem paths outside the project

### Proper Solutions (TODO)

1. **Publish to npm** (Recommended)
   - Publish `@kirkdiggler/rpg-api-protos` as a proper npm package
   - Use semantic versioning for proto changes
   - Update via normal `npm install @kirkdiggler/rpg-api-protos@latest`

2. **Git Submodule**
   - Add rpg-api-protos as a git submodule
   - Ensures consistent versions across environments
   - More complex but keeps everything in version control

3. **Build-time Generation**
   - Generate TypeScript clients during build from proto files
   - Requires build tooling changes

See Issue #14 for tracking this work.

## Local Development Steps

1. Clone both repositories:

   ```bash
   git clone git@github.com:KirkDiggler/rpg-dnd5e-web.git
   git clone git@github.com:KirkDiggler/rpg-api-protos.git
   ```

2. Ensure they're siblings in the same parent directory:

   ```
   parent-dir/
   ├── rpg-dnd5e-web/
   └── rpg-api-protos/
   ```

3. In rpg-api-protos, generate the TypeScript client:

   ```bash
   cd rpg-api-protos
   npm install
   npm run generate
   ```

4. In rpg-dnd5e-web, install dependencies:
   ```bash
   cd rpg-dnd5e-web
   npm install
   ```

## Updating Proto Definitions

When the API changes require proto updates:

1. Update the proto files in rpg-api-protos
2. Regenerate the TypeScript client
3. The changes will automatically be available in rpg-dnd5e-web
4. No need to reinstall - the file: dependency points to the local directory
