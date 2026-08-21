/**
 * Recaptures `src/concepts/session-tomb/referenceTombCells.json` from a LIVE
 * rpg-api — the fixture `atlas.test.ts` pins the hex layout against.
 *
 * Opt-in, never run by CI: it needs the local stack (game-dev's
 * `scripts/dev-env.sh up <env>`), a seeded sandbox character
 * (`go run ./cmd/sandboxseed` in rpg-api prints one), and:
 *
 *   CAPTURE_TOMB=1 CAPTURE_CHARACTER_ID=char_... npx vitest run scripts/capture-reference-tomb.test.ts
 *
 * It drives the same path a player does — CreateLobby → SetReady →
 * StartEncounter → GetAtlas — with the `Dev` auth scheme, so what lands in the
 * fixture is real wire data, not a hand-built guess. Written as a vitest file
 * only because the proto package ships TypeScript that plain node cannot run.
 */
import { createClient, type Interceptor } from '@connectrpc/connect';
import { createGrpcWebTransport } from '@connectrpc/connect-web';
import { LobbyService } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { SessionService } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { HexLayout } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const enabled = process.env.CAPTURE_TOMB === '1';
const FIXTURE = 'src/concepts/session-tomb/referenceTombCells.json';

describe.skipIf(!enabled)(
  'capture the reference tomb atlas from a live server',
  () => {
    it('writes the fixture from CreateLobby -> StartEncounter -> GetAtlas', async () => {
      const characterId = process.env.CAPTURE_CHARACTER_ID;
      expect(characterId, 'CAPTURE_CHARACTER_ID is required').toBeTruthy();
      const playerId =
        process.env.CAPTURE_PLAYER_ID ?? 'toolkit-sandbox-fighter';
      const baseUrl = process.env.CAPTURE_API ?? 'http://localhost:8080';

      const auth: Interceptor = (next) => (req) => {
        req.header.set('authorization', `Dev ${playerId}`);
        return next(req);
      };
      const transport = createGrpcWebTransport({
        baseUrl,
        interceptors: [auth],
      });
      const lobby = createClient(LobbyService, transport);
      const session = createClient(SessionService, transport);

      const created = await lobby.createLobby({
        campaignId: 'capture',
        characterId,
      });
      await lobby.setReady({ lobbyId: created.lobbyId, ready: true });
      const started = await lobby.startEncounter({ lobbyId: created.lobbyId });
      expect(started.encounterId).toBeTruthy();

      const atlas = await session.getAtlas({ session: started.encounterId });
      expect(atlas.cells.length).toBeGreaterThan(0);

      writeFileSync(
        FIXTURE,
        JSON.stringify(
          {
            layout: HexLayout[atlas.layout],
            cells: atlas.cells.map((c) => ({ x: c.x, y: c.y })),
          },
          null,
          2
        ) + '\n'
      );
      console.log(
        `captured ${atlas.cells.length} cells, layout=${HexLayout[atlas.layout]}, session=${started.encounterId}`
      );
    });
  }
);
