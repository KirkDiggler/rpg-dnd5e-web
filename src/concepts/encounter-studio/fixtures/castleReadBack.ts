/**
 * THE CASTLE, AS THE WALKTHROUGH READS IT BACK (rpg-project#576, S2-Q6).
 *
 * Authored from rpg-project `ideas/encounter-studio/README.md`: the gate
 * guards on `gate-patrol`, the garrison with its mind the captain and its
 * mix, its two dispositions, the cook with its three lines, the intel
 * `cooks-ledger`, and the altar whose examine line writes `king-is-cultist`.
 * Only what the read-back and the fact index need is here; the castle's
 * geometry is `castleWorkspace.ts`'s.
 *
 * THE SEED OF THE MAD-KING REFERENCE CONTENT (rpg-project#569, PR #570): that
 * plan's task D1 promotes it to rpg-api content. The studio never writes
 * rpg-api content itself.
 *
 * No guard patrols a route here, though the single room now reads one
 * (`toward: { path: [{ q, r }, …] }`, rpg-toolkit#2063): the read-back of a
 * route and a cell is pinned beside this castle in `readBack.test.ts`, so the
 * suites that read this fixture are not moved by it.
 */
import {
  createRoomDraft,
  paintCells,
  parseRoomDocumentJson,
  placeRoomMonster,
  stringifyRoomDraft,
  type RoomDraftDocument,
} from '../../world-building/roomDraft';
import { createEmptyScene } from '../../world-building/sceneState';
import type { SiteScope } from '../../world-building/siteScope';
import {
  centeredRoomWorkspace,
  workspaceCells,
} from '../../world-building/workspaceGeometry';

export const CASTLE_GUARD = 'dnd5e:monsters:guard';
export const CASTLE_CAPTAIN = 'dnd5e:monsters:captain';
export const CASTLE_COMMONER = 'dnd5e:monsters:commoner';

const SOLDIER = 'dnd5e:npcs:kingdom:soldier-male-01';
const SOLDIER_F = 'dnd5e:npcs:kingdom:soldier-female-01';
const PEASANT = 'dnd5e:npcs:kingdom:peasant-male-01';
const KING = 'dnd5e:npcs:kingdom:prince-01';

export const CASTLE_SCOPE: SiteScope = {
  templates: {
    guard: { base: 'dnd5e:monsters:human', name: 'Guard' },
    captain: { base: 'dnd5e:monsters:human', name: 'Captain' },
    commoner: { base: 'dnd5e:monsters:human', name: 'Commoner' },
  },
  tables: {
    'gate-patrol': {
      time: [
        { when: { heard: { kind: 'clang', within: 2 } }, toward: 'sound' },
        {
          when: [{ enemy: 'seen' }, { not: { fact: 'alarm-raised' } }],
          say: 'To arms! Intruders in the yard!',
          fact: 'alarm-raised',
        },
        { when: { enemy: 'reach' }, attack: 'enemy' },
      ],
    },
    'keep-patrol': {
      time: [
        {
          when: [
            { heard: { kind: 'voice', within: 1 } },
            { not: { fact: 'alarm-raised' } },
          ],
          say: 'The yard! To the yard!',
          fact: 'alarm-raised',
        },
        {
          when: [{ fact: 'alarm-raised' }, { enemy: 'seen' }],
          toward: 'enemy',
        },
        { when: { enemy: 'reach' }, attack: 'enemy' },
      ],
    },
  },
  factions: [
    {
      id: 'garrison',
      mind: 'captain',
      table: 'gate-patrol',
      temper: { soldier: 2, coward: 1 },
    },
    { id: 'kitchen', mind: 'cook' },
    { id: 'loyalists' },
  ],
  dispositions: [
    {
      between: ['garrison', 'party'],
      stance: 'neutral',
      until: { fact: 'party-recognized' },
    },
    {
      between: ['garrison', 'loyalists'],
      stance: 'neutral',
      until: { fact: 'guards-turned' },
    },
    { between: ['kitchen', 'party'], stance: 'neutral' },
  ],
  intel: [{ id: 'cooks-ledger', reveals: { fact: 'king-burned-village' } }],
};

/** One placement per walkthrough name, on distinct floor cells. */
const PLACEMENTS: Array<{ id: string; ref: string; look: string }> = [
  { id: 'gate-1', ref: CASTLE_GUARD, look: SOLDIER },
  { id: 'gate-2', ref: CASTLE_GUARD, look: SOLDIER_F },
  { id: 'captain', ref: CASTLE_CAPTAIN, look: KING },
  { id: 'reserve-1', ref: CASTLE_GUARD, look: SOLDIER },
  { id: 'reserve-2', ref: CASTLE_GUARD, look: SOLDIER_F },
  { id: 'cook', ref: CASTLE_COMMONER, look: PEASANT },
];

/** The castle read-back document, normalized through the storage codec. */
export function createCastleReadBackDocument(): RoomDraftDocument {
  const scene = createEmptyScene('castle-scene');
  scene.name = 'Castle';
  scene.version = 7;
  let draft = createRoomDraft(scene, 'castle');
  draft.name = 'The mad king’s castle';
  // A 12 × 8 floor centred on the origin, painted into the implicit region.
  const cells = workspaceCells(centeredRoomWorkspace(12, 8));
  draft = paintCells(draft, cells);
  const cell = (index: number) => cells[Math.floor(cells.length / 2) + index]!;
  draft.room.partyStart = { ...cell(0) };
  PLACEMENTS.forEach((placement, index) => {
    draft = placeRoomMonster(draft, {
      id: placement.id,
      ref: placement.ref,
      appearanceRef: placement.look,
      startingCell: { location: { ...cell(2 + index * 2) } },
    });
  });
  draft.scene.actorNames = Object.fromEntries(
    PLACEMENTS.map((placement) => [placement.id, placement.id])
  );
  const props: Array<{
    id: string;
    assetRef: string;
    label: string;
    x: number;
  }> = [
    {
      id: 'purse',
      assetRef: 'dnd5e:props:fantasy-kingdom:bag_explorer_01',
      label: 'Purse',
      x: -3,
    },
    {
      id: 'ledger',
      assetRef: 'dnd5e:props:dark-fortress:book_03',
      label: 'Ledger',
      x: -1.5,
    },
    {
      id: 'altar',
      assetRef: 'dnd5e:props:dark-fortress:altar_01',
      label: 'Altar',
      x: 3,
    },
  ];
  for (const prop of props) {
    draft.scene.items.push({
      id: prop.id,
      kind: 'prop',
      assetRef: prop.assetRef,
      label: prop.label,
      transform: { x: prop.x, y: 0, z: -2, rotationY: 0 },
    });
    draft.room.propDeclarations[prop.id] = {
      blocksMovement: false,
      blocksLineOfSight: false,
      footprint: { width: 0.8, depth: 0.8, offsetX: 0, offsetZ: 0 },
    };
  }
  draft.room.propBindings = {
    purse: { holdable: true },
    ledger: { holdable: true, holds: ['cooks-ledger'] },
    altar: {
      options: [
        {
          id: 'examine',
          say: 'Examine the altar.',
          check: [{ ability: 'investigation', dc: 12 }],
          success: [
            {
              say: 'Ash, and a sigil of the old god.',
              fact: 'king-is-cultist',
            },
          ],
        },
      ],
    },
  };
  draft.room.monsterBindings = {
    'gate-1': { faction: 'garrison', table: 'gate-patrol' },
    'gate-2': { faction: 'garrison', table: 'gate-patrol' },
    captain: {
      faction: 'garrison',
      table: 'keep-patrol',
      options: [
        {
          id: 'troupe',
          say: 'We are the players for the feast.',
          check: [{ ability: 'deception', dc: 13 }],
          requires: { fact: 'feast-tonight' },
          success: [{ say: 'Then get to the hall.' }],
          failure: [
            {
              say: 'Players? I know every face here.',
              fact: 'party-recognized',
            },
          ],
        },
        {
          id: 'turn',
          say: 'Your king burned Ashford.',
          check: [{ ability: 'persuasion', dc: 15 }],
          requires: { fact: 'king-burned-village' },
          success: [
            { say: 'Then he is no king of mine.', fact: 'guards-turned' },
          ],
          failure: [{ say: 'Lies.' }],
        },
      ],
    },
    'reserve-1': {
      faction: 'garrison',
      table: 'keep-patrol',
      arrives: { fact: 'alarm-raised' },
    },
    'reserve-2': {
      faction: 'garrison',
      table: 'keep-patrol',
      arrives: { fact: 'alarm-raised' },
    },
    cook: {
      faction: 'kitchen',
      options: [
        {
          id: 'gossip',
          say: 'Busy night?',
          check: [{ ability: 'persuasion', dc: 10 }],
          success: [
            { say: 'Feast for the whole court…', fact: 'feast-tonight' },
          ],
          failure: [{ say: 'Out of my kitchen.' }],
        },
        {
          id: 'ashford',
          say: 'What did he do to Ashford?',
          check: [{ ability: 'persuasion', dc: 12 }],
          requires: { fact: 'feast-tonight' },
          success: [{ fact: 'king-burned-village' }],
          failure: [{ say: 'I’ve said too much already.' }],
        },
        {
          id: 'bribe',
          say: 'Ten gold says you never saw us.',
          check: [{ ability: 'persuasion', dc: 8 }],
          requires: { holds: 'purse' },
          success: [{ say: 'Saw who?', fact: 'feast-tonight' }],
          failure: [{ say: 'Keep your coin.' }],
        },
      ],
    },
  };
  return parseRoomDocumentJson(stringifyRoomDraft(draft, CASTLE_SCOPE));
}
