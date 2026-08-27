import type { DungeonDoc } from '../dungeonYaml';
import { fromOffset } from '../hexOffset';
import { referenceTombDoc } from './referenceTomb';

/** The integrated crypt lighting fixture used by the builder and visual gate. */
export function cryptLightingShowcaseDoc(): DungeonDoc {
  const reference = referenceTombDoc();
  const p = (col: number, row: number) => fromOffset('pointy', [col, row]);

  return {
    ...reference,
    key: 'crypt-lighting-showcase',
    name: 'Crypt Lighting Showcase',
    place: [
      {
        ref: 'dnd5e:props:lantern',
        at: p(2, 4),
        blocksMovement: true,
        blocksLos: false,
        facing: 'se',
        offset: [0, 0],
      },
      {
        ref: 'dnd5e:props:torch-ornate',
        at: p(10, 4),
        blocksMovement: true,
        blocksLos: false,
        facing: 'e',
        offset: [0, 0],
      },
      {
        ref: 'dnd5e:props:glowing-orb',
        at: p(18, 1),
        blocksMovement: true,
        blocksLos: false,
        facing: 's',
        offset: [0, 0],
      },
      {
        ref: 'dnd5e:props:rune-marker',
        at: p(26, 6),
        blocksMovement: true,
        blocksLos: false,
        facing: 'n',
        offset: [0, 0],
      },
      ...reference.place.filter(({ ref }) => ref.startsWith('dnd5e:monsters:')),
    ],
  };
}
