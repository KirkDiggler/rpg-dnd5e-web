# World access configuration

The Server access screen uses the published `api.world.v1alpha1.WorldService`
contract. It is reachable from the game header or `?worldSettings=1`, including
before the world's gameplay role configuration exists. Configuration navigation
is not replaced by automatic lobby resume.

The selected Discord guild is the WorldID. Development uses the explicit
`VITE_DEV_WORLD_ID` fixture. With no guild/world selection, the screen refuses
configuration rather than inventing a default server.

The client requests `guilds.members.read` and `guilds` OAuth scopes, checks the
granted scopes before committing authentication, and sends its selected guild
header on game/configuration RPCs including streams. Discord/API validate the
player, membership, owner identity and role-derived permissions. The UI never
asserts ownership or grants permissions from a role ID supplied by the browser.

## Configuration operations

- Read existing configuration with GetWorld. NotFound offers initial setup.
- Save all roles uses SetWorldRoles and requires the actual Discord server owner.
- Save builder/player roles uses SetWorldMemberRoles, without an admin-role field.
- A successful delegated response restores the server's unchanged admin role.
- Provider/API errors are displayed, never reported as successful saves.
- Changing authentication/world identity remounts the screen and prevents late
  requests from displaying or overwriting another world's configuration.

This first screen accepts Discord role IDs copied using Developer Mode. It does
not yet retrieve a Discord role catalog or provide role-name selection. Discord
administers membership of each role. Permission enforcement is server-side;
visible navigation/buttons are not authorization evidence.

World-role admission does not establish separate-server character or content
isolation. The initial role-access slice and its paired API are tracked in
rpg-project#514 and rpg-api#1065.
