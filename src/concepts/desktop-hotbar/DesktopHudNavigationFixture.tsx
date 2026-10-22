import { FactionLegend } from '@/components/session/FactionLegend';
import { SneakToggle } from '@/components/session/SneakToggle';
import { Button } from '@/components/ui/Button';
import { create } from '@bufbuild/protobuf';
import {
  MemberKind,
  PublicMemberInfoSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

const roster = new Map([
  [
    'fixture-player',
    create(PublicMemberInfoSchema, {
      id: 'fixture-player',
      name: 'Fixture player',
      kind: MemberKind.PLAYER,
      faction: 'party',
    }),
  ],
  ...['guard-a', 'guard-b', 'guard-c'].map(
    (id) =>
      [
        id,
        create(PublicMemberInfoSchema, {
          id,
          name: id,
          kind: MemberKind.MONSTER,
          faction: 'garrison',
        }),
      ] as const
  ),
]);
/** Same controls/legend as the session header, with explicit no-command callbacks. */
export function DesktopHudNavigationFixture({
  world,
  onPreview,
}: {
  world: boolean;
  onPreview: (label: string) => void;
}) {
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => onPreview('Back')}>
        Back
      </Button>
      {world && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPreview('Short rest')}
        >
          Short rest
        </Button>
      )}
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          aria-label="Share discoveries with party"
          onChange={() => onPreview('Share discoveries')}
        />
        Share discoveries
      </label>
      {world && (
        <SneakToggle
          sneaking={false}
          disabled={false}
          onChange={() => onPreview('Sneak')}
        />
      )}
    </>
  );
}
export function DesktopHudFactionFixture() {
  return <FactionLegend roster={roster} inline />;
}
