/**
 * SessionEncounterView — the real 3D game route's slice-1 render of a
 * `dnd5e.api.session.v1alpha1` session: the reference tomb, drawn from the
 * atlas, with the local player's character standing where `GetWhere` says
 * they are. No movement, no combat, no `StreamEvents` yet (rpg-project#227
 * W3 slice 2, issue #762's first small victory) — those are follow-up
 * slices once this one is verified live.
 *
 * # Why this exists beside `EncounterView`, not inside it
 *
 * `EncounterView` speaks the OLD `EncounterService` (v1alpha2), which
 * `rpg-api` `dev` no longer serves (rpg-api#801 deleted that stack) — the
 * game route does not work against `dev` at all without this. The two
 * services are a reimplementation, not versions of each other (see
 * `client.ts`'s `sessionClient` doc comment and `SessionTombConcept.tsx`'s
 * module doc comment for the asymmetry table), so this is a new component
 * on the new wire rather than a branch inside the old one. `EncounterView`
 * and its whole rendering chain (`EncounterMap`/`HexGrid`) are left
 * untouched — `GameView` simply stops mounting them once a session starts.
 *
 * # What this deliberately does NOT do
 *
 * It does not manufacture the old wire's shapes (`CombatState`,
 * `EncounterState`, v1alpha2 `Wall[]`) from the atlas to feed `HexGrid` —
 * that would be the server-side wrapper `rpg-project#227` refused,
 * relocated into the client. It reuses only the LEAF 3D renderers
 * (`SyntyHexFloor`, `HexEntity`, `useCameraControls`, and — via
 * `AtlasWalls` — `GlbInstance`) with a thin atlas -> leaf-props mapping
 * (`atlasToScene3D.ts`).
 *
 * # Full-viewport portal
 *
 * Same reasoning, and the same fix, as `EncounterView`'s own doc comment:
 * App.tsx's shared shell wraps every non-character-sheet view in
 * `max-w-7xl mx-auto p-8`, which caps both width AND height to the
 * padded content box rather than the viewport. A `<Canvas
 * style={{width:'100%',height:'100%'}}>` inside that box inherits a
 * definite WIDTH (max-w-7xl resolves) but no definite HEIGHT (the
 * shell has none), so the percentage height fails to resolve and the
 * canvas falls back to the browser's classic 300x150 default — a
 * hairline strip of the scene, discovered live via a Playwright canvas
 * boundingBox() check, not by inspection. `createPortal` to `document.body`
 * with `position: fixed; inset: 0` escapes that shell entirely, the same
 * way `EncounterView` already does.
 */

import { errorMessage } from '@/utils/combatFormat';
import { create } from '@bufbuild/protobuf';
import {
  GetCharacterRequestSchema,
  type Character,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGetCharacter } from '../../api/characterHooks';
import { useSessionAtlas } from '../../api/useSessionAtlas';
import { useSessionWhere } from '../../api/useSessionWhere';
import { layoutFromWire } from '../../concepts/session-tomb/atlas';
import { CLASS_TEXTURE_SUFFIXES } from '../../config/characterTextures';
import { HEX_SIZE } from '../hex-grid/hexMath';
import { Button } from '../ui/Button';
import { ErrorDisplay, LoadingOverlay } from '../ui/Feedback';
import { buildScene3D, positionToCube } from './atlasToScene3D';
import { SessionCanvas } from './SessionCanvas';

export interface SessionEncounterViewProps {
  /** The session/encounter id `StartEncounter` returned. */
  sessionId: string;
  /** The local player's own character id — the session `member` id
   * (matches `EncounterView`'s own doc comment: the bound `characterId`,
   * never `char-<playerId>`). */
  characterId?: string;
  playerId: string;
  onBack: () => void;
}

type LayoutOutcome =
  | { ok: true; layout: 'pointy' }
  | { ok: false; message: string };

/**
 * Reads the wire's own answer for which way the hexes point and gates on
 * it — never guesses (`layoutFromWire`'s own contract: capabilities are
 * supplied, never defaulted). `hexMath.ts`'s 3D placement math is
 * pointy-top only today, so a flat-top or square atlas is reported as a
 * visible, named limitation rather than drawn wrong or silently dropped.
 */
function resolveLayout(
  layout: Parameters<typeof layoutFromWire>[0] | undefined,
  grid: Parameters<typeof layoutFromWire>[1] | undefined
): LayoutOutcome | null {
  if (layout === undefined || grid === undefined) {
    return null;
  }
  try {
    const resolved = layoutFromWire(layout, grid);
    if (resolved === 'pointy') {
      return { ok: true, layout: 'pointy' };
    }
    if (resolved === 'flat') {
      return {
        ok: false,
        message:
          "This session's map is flat-top hex — the 3D route only draws " +
          'pointy-top today (hexMath.ts is pointy-top only; tracked as ' +
          'rpg-dnd5e-web#763), not silently guessed.',
      };
    }
    return {
      ok: false,
      message:
        "This session's map is a square grid — the 3D route only draws " +
        'hex maps today.',
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** A centered message card, matching the shape (not the fixed positioning)
 * every early-exit state below shares — loading/error/gap all read the
 * same way, just with different content. */
function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 32,
      }}
    >
      {children}
    </div>
  );
}

export function SessionEncounterView({
  sessionId,
  characterId,
  onBack,
}: SessionEncounterViewProps) {
  const {
    atlas,
    loading: atlasLoading,
    error: atlasError,
    refetch: refetchAtlas,
  } = useSessionAtlas(sessionId);
  const {
    position: wherePosition,
    loading: whereLoading,
    error: whereError,
    refetch: refetchWhere,
  } = useSessionWhere(sessionId, characterId ?? '');

  const { getCharacter } = useGetCharacter();
  const [character, setCharacter] = useState<Character | null>(null);
  const [characterLoading, setCharacterLoading] = useState(!!characterId);
  const [characterError, setCharacterError] = useState<Error | null>(null);

  useEffect(() => {
    if (!characterId) {
      setCharacter(null);
      setCharacterLoading(false);
      setCharacterError(null);
      return;
    }
    let cancelled = false;
    setCharacterLoading(true);
    setCharacterError(null);
    getCharacter(create(GetCharacterRequestSchema, { characterId }))
      .then((response) => {
        if (!cancelled) {
          setCharacter(response.character ?? null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCharacterError(
            err instanceof Error ? err : new Error('GetCharacter RPC failed')
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCharacterLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [characterId, getCharacter]);

  const layoutOutcome = useMemo(
    () => resolveLayout(atlas?.layout, atlas?.grid),
    [atlas]
  );

  const scene = useMemo(() => {
    if (!atlas || !layoutOutcome?.ok) {
      return null;
    }
    return buildScene3D(atlas, HEX_SIZE);
  }, [atlas, layoutOutcome]);

  const classRefId = character
    ? CLASS_TEXTURE_SUFFIXES[character.class]
    : undefined;

  const loading = atlasLoading || whereLoading || characterLoading;
  const blockingError = atlasError ?? whereError ?? characterError;

  let content: React.ReactNode;
  if (!characterId) {
    content = (
      <CenteredCard>
        <ErrorDisplay
          title="No character selected"
          message="Can't place you in this session without a character."
        />
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      </CenteredCard>
    );
  } else if (loading) {
    content = <LoadingOverlay visible text="Loading the tomb…" />;
  } else if (blockingError) {
    content = (
      <CenteredCard>
        <ErrorDisplay
          title="Couldn't load the session"
          message={errorMessage(blockingError)}
          onRetry={() => {
            void refetchAtlas();
            void refetchWhere();
          }}
        />
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      </CenteredCard>
    );
  } else if (layoutOutcome && !layoutOutcome.ok) {
    content = (
      <CenteredCard>
        <ErrorDisplay
          title="Can't draw this map yet"
          message={layoutOutcome.message}
        />
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      </CenteredCard>
    );
  } else if (!scene || !wherePosition) {
    content = (
      <CenteredCard>
        <ErrorDisplay
          title="Nothing to draw"
          message="The session has no atlas cells, or no known position for you yet."
        />
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      </CenteredCard>
    );
  } else {
    content = (
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <SessionCanvas
          scene={scene}
          hexSize={HEX_SIZE}
          characterId={characterId}
          characterName={character?.name ?? 'You'}
          character={character ?? undefined}
          classRefId={classRefId}
          myPosition={positionToCube(wherePosition)}
        />
        <div style={{ position: 'absolute', top: 12, left: 12 }}>
          <Button variant="ghost" size="sm" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return createPortal(
    <div
      data-testid="session-encounter-view"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary, #0a0a0a)',
      }}
    >
      {content}
    </div>,
    document.body
  );
}
