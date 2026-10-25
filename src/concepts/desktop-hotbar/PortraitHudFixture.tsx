import { CombatExperience } from '@/components/session/combat-experience/CombatExperience';
import type { CombatExperienceLogMode } from '@/components/session/combat-experience/types';
import { useDesktopHotbarFrame } from '@/components/session/combat-experience/useDesktopHotbarFrame';
import { create } from '@bufbuild/protobuf';
import {
  ClockKind,
  ParticipantSchema,
  type PublicMemberInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useMemo, useState, type ReactElement } from 'react';
import { SESSION_COMBAT_FIXTURES } from '../session-combat/fixtures';

/** Real HUD + provider, supplied public appearances; no gameplay calls. */
export function PortraitHudFixture({
  members,
  scopeKey,
}: {
  members: readonly PublicMemberInfo[];
  scopeKey: string;
}): ReactElement {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const desktop = useDesktopHotbarFrame(frame);
  const [logMode, setLogMode] = useState<CombatExperienceLogMode>('story');
  const [intent, setIntent] = useState(
    'Portrait-only fixture · no game commands'
  );
  const previewIntent = (): void =>
    setIntent('Preview only — no gameplay intent sent.');
  const viewer = members[0]!;
  const participants = useMemo(
    () =>
      members.map((member, index) =>
        create(ParticipantSchema, {
          member: member.id,
          name: member.name,
          active: index === 0,
        })
      ),
    [members]
  );
  return (
    <div
      ref={setFrame}
      style={{
        height: 'min(760px, 80vh)',
        minHeight: 500,
        position: 'relative',
        containerType: 'size',
      }}
    >
      <CombatExperience
        layout="fill-parent"
        portraits={{ scopeKey, members }}
        viewerMember={viewer.id}
        viewerName={viewer.name}
        viewerClassRefId={viewer.classRef}
        clock={ClockKind.TURN}
        round={1}
        participants={participants}
        declarations={[]}
        characterData={SESSION_COMBAT_FIXTURES[0]!.characterData}
        privateStatus="ready"
        authorityFresh
        presentationState={{
          armedDeclarationId: null,
          selectedCandidateMember: null,
          changedOptionNotice: null,
        }}
        phase="fresh"
        showTurnNotice={false}
        logMode={logMode}
        onLogModeChange={setLogMode}
        memberNames={new Map(members.map((member) => [member.id, member.name]))}
        onSelectDeclaration={previewIntent}
        onTargetClick={previewIntent}
        onEndTurn={previewIntent}
        diceWitnessRole="spectator"
        streamState="live"
        story={[]}
        diceEvents={[]}
        actionPresentation={{
          mode: 'organized-hud',
          ...(desktop ? { desktopIcons: {} } : {}),
        }}
        location={{
          name: 'Portrait HUD fixture',
          area: 'Public appearance data only',
        }}
        renderMap={() => (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              background:
                'radial-gradient(ellipse at center, #293a44, #10171c)',
              color: '#9caeb7',
            }}
          >
            <span role="status">{intent}</span>
          </div>
        )}
      />
    </div>
  );
}
