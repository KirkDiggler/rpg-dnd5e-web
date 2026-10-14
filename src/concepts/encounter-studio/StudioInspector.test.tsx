import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { projectStudioArrange } from '../world-building/studioArrange';
import { createFakeStudioSession } from './fixtures/fakeStudioSession';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';
import { StudioInspector } from './StudioInspector';
import {
  studioInspectionOf,
  type EncounterStudioSession,
} from './studioSession';

function inspector(session: EncounterStudioSession) {
  return render(
    <StudioInspector
      session={session}
      inspection={studioInspectionOf(
        session.arrange,
        session.document.draft.scene
      )}
      view="layout"
      layoutTool="select"
      armedTool={null}
      onConfigure={vi.fn()}
      onMoveCreature={vi.fn()}
      onFrameChange={vi.fn()}
      onArmTool={vi.fn()}
      onOpenRegion={vi.fn()}
    />
  );
}
const region = () => screen.getByRole('region', { name: 'Inspector' });

describe('StudioInspector', () => {
  it('nothing selected renders the Room heading', () => {
    inspector(createFakeStudioSession());
    expect(
      within(region()).getByRole('heading', { level: 2, name: 'Room' })
    ).toBeTruthy();
  });

  it('a wall selection renders the wall name heading', () => {
    const session = createFakeStudioSession();
    session.document.draft.room.walls = structuredClone(
      createPopulatedStudioDocument().draft.room.walls!
    );
    inspector({
      ...session,
      arrange: projectStudioArrange({
        draft: session.document.draft,
        target: { kind: 'wall', id: 'studio-wall' },
        selectionRevision: 1,
      }),
    });
    expect(
      within(region()).getByRole('heading', {
        level: 2,
        name: 'Studio north wall',
      })
    ).toBeTruthy();
  });
});
