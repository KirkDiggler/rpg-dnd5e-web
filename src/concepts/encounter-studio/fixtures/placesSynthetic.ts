import { fromJson } from '@bufbuild/protobuf';
import {
  ReadBackSchema,
  type ReadBack,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';

/** A small read-back in the engine's shapes (rpg-toolkit `readback/ways.go`):
 * one door join whose ways are given. */
export function syntheticJoin(
  ways: {
    kind: string;
    connects: [string, string, string][];
    /** Defaults to the way's own subject. */
    about?: { kind: string; id: string };
  }[]
): ReadBack {
  const conn = ([kind, id, role]: [string, string, string]) => ({
    kind,
    id,
    role,
    value: 0,
  });
  return fromJson(ReadBackSchema, {
    key: 'site',
    name: 'Site',
    sections: [
      {
        title: 'The place',
        groups: [
          {
            title: 'Where the places join',
            about: { kind: 'site', id: 'site' },
            statements: [
              {
                kind: 'place.join.door',
                about: { kind: 'join', id: 'j1' },
                sentence: 'A and B join at the door `d1`.',
                path: 'room.room.doorBindings.d1',
                connects: [
                  ['region', 'a', 'joins'],
                  ['region', 'b', 'joins'],
                  ['door', 'd1', 'by'],
                ].map((c) => conn(c as [string, string, string])),
              },
              ...ways.map((way, index) => ({
                kind: way.kind,
                about:
                  way.about ??
                  (way.kind === 'place.way.none'
                    ? { kind: 'bar', id: `bar:j1:${index}` }
                    : { kind: 'way', id: `way:j1:${index}` }),
                sentence: `Way ${index} (${way.kind}).`,
                path: 'room.room.doorBindings.d1',
                connects: [['join', 'j1', 'through'], ...way.connects].map(
                  (c) => conn(c as [string, string, string])
                ),
              })),
            ],
          },
        ],
      },
    ],
  });
}
