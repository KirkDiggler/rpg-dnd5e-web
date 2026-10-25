import { NPC_APPEARANCE_CATALOG } from '@/generated/npcAppearanceCatalog';
import { PortraitProvider, usePortrait } from '@/portraits';
import { create } from '@bufbuild/protobuf';
import {
  MemberKind,
  PublicMemberInfoSchema,
  type PublicMemberInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useMemo, useState } from 'react';
import { PortraitHudFixture } from '../desktop-hotbar/PortraitHudFixture';

/** This lab changes supplied fixture appearances, never a player's saved sheet. */
function roster(changed: boolean): PublicMemberInfo[] {
  const goblin =
    NPC_APPEARANCE_CATALOG.find((a) =>
      a.sourcePack.toLowerCase().includes('goblin')
    ) ?? NPC_APPEARANCE_CATALOG[0];
  const villager =
    NPC_APPEARANCE_CATALOG.find((a) =>
      a.sourceName.toLowerCase().includes('peasant')
    ) ?? goblin;
  return [
    create(PublicMemberInfoSchema, {
      id: 'hero',
      name: 'Customized fighter',
      kind: MemberKind.PLAYER,
      raceRef: 'human',
      classRef: 'fighter',
      customization: {
        hair: { colorSrgb: changed ? 0x181818 : 0xe6bd59, roughness: 0.6 },
        outfit: {
          primaryColorSrgb: changed ? 0xb52c36 : 0x285cd4,
          secondaryColorSrgb: 0xf0b83b,
        },
      },
    }),
    create(PublicMemberInfoSchema, {
      id: 'dwarf',
      name: 'Customized dwarf',
      kind: MemberKind.PLAYER,
      raceRef: 'dwarf',
      classRef: 'fighter',
      customization: {
        hair: { colorSrgb: 0xbe572d },
        outfit: { primaryColorSrgb: 0x3c815a },
      },
    }),
    create(PublicMemberInfoSchema, {
      id: 'goblin',
      name: 'Exact goblin appearance',
      kind: MemberKind.MONSTER,
      monsterRef: 'dnd5e:monsters:skeleton',
      appearanceRef: goblin.assetRef,
    }),
    create(PublicMemberInfoSchema, {
      id: 'villager',
      name: 'World NPC',
      kind: MemberKind.WORLD,
      appearanceRef: villager.assetRef,
    }),
    create(PublicMemberInfoSchema, {
      id: 'skeleton',
      name: 'Legacy skeleton',
      kind: MemberKind.MONSTER,
      monsterRef: 'dnd5e:monsters:skeleton',
    }),
    create(PublicMemberInfoSchema, {
      id: 'missing',
      name: 'Missing explicit appearance',
      kind: MemberKind.MONSTER,
      monsterRef: 'dnd5e:monsters:skeleton',
      appearanceRef: 'missing:portrait',
    }),
  ];
}

function ImageConsumer({
  member,
  compact = false,
}: {
  member: PublicMemberInfo;
  compact?: boolean;
}) {
  const portrait = usePortrait(member.id);
  const [failedImage, setFailedImage] = useState<string>();
  const image =
    portrait.status === 'ready' && portrait.image !== failedImage
      ? portrait.image
      : undefined;
  const state =
    portrait.status === 'ready' && !image ? 'error' : portrait.status;
  const size = compact ? 64 : 128;
  return (
    <article
      data-member={member.id}
      data-portrait-state={state}
      style={{
        padding: 12,
        background: '#211f25',
        border: '1px solid #51495b',
        borderRadius: 8,
        minWidth: size + 24,
      }}
    >
      {image ? (
        <img
          src={image}
          alt={`${member.name} portrait`}
          width={size}
          height={size}
          onError={() => setFailedImage(image)}
        />
      ) : (
        <div
          role="img"
          aria-label={`${member.name}: ${state}`}
          style={{
            width: size,
            height: size,
            display: 'grid',
            placeItems: 'center',
            color: '#aaa',
          }}
        >
          {state}
        </div>
      )}
      <div style={{ marginTop: 8 }}>{member.name}</div>
      {!compact && (
        <small>
          {portrait.status === 'error' || portrait.status === 'unavailable'
            ? portrait.message
            : state}
        </small>
      )}
    </article>
  );
}

export function PortraitProviderConcept() {
  const [changed, setChanged] = useState(false);
  const [scope, setScope] = useState(0);
  const [showHud, setShowHud] = useState(
    new URLSearchParams(window.location.search).get('hud') === '1'
  );
  const members = useMemo(() => roster(changed), [changed]);
  return (
    <section style={{ color: '#e8e1ed', padding: 16 }}>
      <h2 style={{ fontSize: 24 }}>Portrait provider · real model captures</h2>
      <p>
        Generated roster fixtures → production appearance/customization → shared
        PNG images. No API calls or gameplay commands.
      </p>
      <div style={{ display: 'flex', gap: 12, margin: '16px 0' }}>
        <button
          className="px-4 py-2 rounded bg-purple-800"
          onClick={() => setChanged((value) => !value)}
        >
          Change confirmed appearance
        </button>
        <button
          className="px-4 py-2 rounded bg-purple-800"
          onClick={() => setScope((value) => value + 1)}
        >
          Change observer scope
        </button>
        <button
          className="px-4 py-2 rounded bg-purple-800"
          aria-pressed={showHud}
          onClick={() => setShowHud((value) => !value)}
        >
          Show HUD integration
        </button>
      </div>
      {showHud ? (
        <PortraitHudFixture
          members={members}
          scopeKey={`portrait-hud/${scope}`}
        />
      ) : (
        <PortraitProvider
          scopeKey={`portrait-proof/${scope}`}
          members={members}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {members.map((member) => (
              <ImageConsumer key={member.id} member={member} />
            ))}
          </div>
          <h3 style={{ margin: '20px 0 8px' }}>
            Second consumer · same images, no extra capture
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {members.slice(0, 5).map((member) => (
              <ImageConsumer key={member.id} member={member} compact />
            ))}
          </div>
        </PortraitProvider>
      )}
    </section>
  );
}
