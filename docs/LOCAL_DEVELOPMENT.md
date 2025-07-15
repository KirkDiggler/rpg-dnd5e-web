# Local Development Setup

## rpg-api-protos Integration

The project uses the generated TypeScript client from the `rpg-api-protos` repository:

```json
"@kirkdiggler/rpg-api-protos": "github:KirkDiggler/rpg-api-protos#generated"
```

This pulls directly from the `generated` branch which contains the compiled TypeScript code.

### How It Works

- The `rpg-api-protos` repository has a `generated` branch
- This branch contains the compiled TypeScript code from the proto definitions
- npm/yarn can install directly from this GitHub branch
- Works in all environments: local, CI, and production deployments

### Updating Proto Definitions

When the API changes require proto updates:

1. The rpg-api-protos repository will update and regenerate the TypeScript code
2. The `generated` branch will be updated with new compiled code
3. To get the latest changes in this project:
   ```bash
   npm update @kirkdiggler/rpg-api-protos
   ```

### Benefits

- ✅ Works in production deployments (Vercel, Netlify, etc.)
- ✅ No need for local file dependencies
- ✅ CI/CD works without workarounds
- ✅ Version controlled through git commits
- ✅ Can pin to specific commits if needed

## Local Development Steps

1. Clone the repository:

   ```bash
   git clone git@github.com:KirkDiggler/rpg-dnd5e-web.git
   cd rpg-dnd5e-web
   ```

2. Install dependencies (this will pull the protos from GitHub):

   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

That's it! The proto definitions are automatically installed from the GitHub generated branch.

## Environment Variables

Create a `.env.local` file for local development:

```env
VITE_API_HOST=http://localhost:8080
VITE_DISCORD_CLIENT_ID=your_discord_client_id
```

See `.env.example` for all available environment variables.
