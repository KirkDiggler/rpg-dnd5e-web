---
name: Discord Activity wiring
description: DiscordProvider, guild-scoped composition auth, and sandbox constraints
updated: 2026-09-08
confidence: high — provider, auth decision, transport selector, and source epochs have focused tests
---

# Discord Activity wiring

`src/discord/` owns Discord Embedded App SDK initialization and the React auth
context. `src/api/auth.ts` is the small in-memory bridge to the Connect
transport; bearer credentials are not exposed through React context or source
objects.

## Authentication and consent

1. `DiscordProvider` authorizes `identify`, `applications.commands`, and
   `guilds.members.read`. It omits `prompt`, allowing SDK 2.5 to display the
   consent modal when the existing grant is insufficient.
2. The authorization code is exchanged by the API and passed to
   `sdk.commands.authenticate()`.
3. Returned scopes are retained only as UI evidence. A cancelled/denied grant,
   missing membership scope, or other authentication failure clears the prior
   local auth state and offers reconnect behavior.
4. The provider reads the selected guild from `DiscordSDK.guildId`, not the
   URL-derived debug context. The successful token/player/guild tuple is stored
   in `src/api/auth.ts`.

The provider exposes a non-secret, monotonically increasing `authSessionId`.
Every successful login or clear replaces the credential epoch. A source reports
`Unauthenticated` with its captured epoch, and the provider clears auth only if
that epoch still owns the current session. Thus a late failure from source A
cannot sign out replacement session B.

## Shared auth decision and transport

`getAuthDecision()` is the single non-secret discriminant used by both the
Connect auth interceptor and composition source selection:

- Discord credentials win in every build, including Vite development.
- Actual Dev credentials are accepted only in a development build.
- Production Dev and missing credentials are unauthenticated.

All Discord RPCs receive `authorization: Discord <token>`. Only
`CompositionService` Discord calls also receive `x-rpg-guild-id`; global
character, lobby, session, and other RPCs remain guild-free. Dev composition
calls send no guild selector.

The composition source uses the canonical SDK GuildID directly as WorldID.
There is no registry, picker, role check, or `test-world` fallback for Discord.
Without an SDK guild the World Builder is disabled with a server-launch message.
The explicit `VITE_DEV_WORLD_ID`/`test-world` path remains development-only.

A source is scoped to `(authSessionId, GuildID, WorldID)`. The adapter checks
that its epoch is current before dispatch, preventing an old same-guild editor
from using the global transport's replacement-session credential. Source/list/
resolution object guards prevent late results and errors from publishing after
a replacement. Local editor drafts remain independent of the remote source.

## Trust boundary

The browser's GuildID is an untrusted selector. The API verifies membership
with the same user token and derives trusted WorldID server-side. Returned SDK
scopes improve error copy but do not authorize data access. Membership proves
guild membership, not the active Activity instance/channel, and adds no role or
Discord permission policy.

## Sandbox constraints

The Activity runs in a sandboxed `discordsays.com` iframe:

- API calls use the `/.proxy` path.
- Discord CSP restricts external script sources.
- The SDK communicates with the parent frame through `postMessage`.
- URL environment values remain useful for diagnostics only; GuildID authority
  is never derived from them.

Real consent, provider membership, and proxy forwarding still require a
coordinated deployed Discord walkthrough; unit/render tests do not replace that
proof.
