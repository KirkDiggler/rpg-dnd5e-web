/**
 * THE PLACES MODE'S STATE (rpg-project#972): whether the Layout shows the
 * places (a per-viewer convenience, remembered in this browser), the joins
 * the engine said in the read-back the inspector reads, and the selected
 * join. A join is a selection: selecting one clears the map selection, and
 * any other selection clears it.
 */
import { useEffect, useMemo, useState } from 'react';
import type { LayoutPlaces } from './PlacesOverlay';
import { STALE_READ_BACK_SENTENCE } from './ReadBack';
import { joinName, placesOf, type PlaceJoin, type Places } from './placesView';
import type { StudioReadBack } from './studioPublishing';
import type { EncounterStudioSession } from './studioSession';

export const PLACES_VIEW_STORAGE_KEY = 'encounter-studio.places-view';
export const NO_PLACES_SENTENCE = 'The engine has not said the places yet.';

function remembered(): boolean {
  try {
    return localStorage.getItem(PLACES_VIEW_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export interface PlacesView {
  on: boolean;
  toggle(): void;
  places: Places | null;
  /** The stale or none notice, or null while current. */
  notice: string | null;
  current: boolean;
  selectedJoin: PlaceJoin | null;
  selectJoin(id: string): void;
  /** Select no join: a click on empty canvas, as the map's selection. */
  clearJoin(): void;
  /** For the Layout surface; null while the mode is off or nothing is
   * said. */
  layer: LayoutPlaces | null;
  regionName(id: string): string;
  nameOf(join: PlaceJoin): string;
}

export function usePlacesView(
  session: Pick<
    EncounterStudioSession,
    'document' | 'arrange' | 'clearSelection'
  >,
  readBack: StudioReadBack
): PlacesView {
  const [on, setOn] = useState(remembered);
  const [joinId, setJoinId] = useState<string | null>(null);
  const places = useMemo(
    () => (readBack.readBack ? placesOf(readBack.readBack) : null),
    [readBack.readBack]
  );
  // Any other selection takes the inspector from the join.
  useEffect(() => {
    if (session.arrange) setJoinId(null);
  }, [session.arrange]);
  // Another draft drops the join in the same render, so a same-id join in
  // that draft is never reselected unchosen (the read-back's own fence).
  const draftId = session.document.draft.id;
  const [joinDraft, setJoinDraft] = useState(draftId);
  if (draftId !== joinDraft) {
    setJoinDraft(draftId);
    setJoinId(null);
  }
  // Escape clears the selection, the join as the map's.
  useEffect(() => {
    if (joinId === null) return;
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setJoinId(null);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [joinId]);
  const regions = session.document.draft.room.regions;
  const regionName = (id: string): string => {
    const region = regions.find((entry) => entry.id === id);
    return region?.name || id;
  };
  const nameOf = (join: PlaceJoin): string => joinName(join, regionName);
  const selectedJoin =
    (draftId === joinDraft &&
      joinId &&
      places?.joins.find((join) => join.id === joinId)) ||
    null;
  const selectJoin = (id: string): void => {
    session.clearSelection();
    setJoinId(id);
  };
  const toggle = (): void => {
    setOn((was) => {
      try {
        localStorage.setItem(PLACES_VIEW_STORAGE_KEY, was ? 'off' : 'on');
      } catch {
        // No storage: the choice lasts as long as the studio.
      }
      return !was;
    });
  };
  const notice = !readBack.readBack
    ? `${NO_PLACES_SENTENCE}${readBack.unavailable ? ` ${readBack.unavailable}` : ''}`
    : readBack.readBackIsCurrent
      ? null
      : STALE_READ_BACK_SENTENCE;
  return {
    on,
    toggle,
    places,
    notice,
    current: readBack.readBackIsCurrent,
    selectedJoin,
    selectJoin,
    clearJoin: () => setJoinId(null),
    regionName,
    nameOf,
    layer:
      on && places
        ? {
            places,
            selectedJoinId: selectedJoin?.id ?? null,
            onSelectJoin: selectJoin,
            nameOf,
            regionName,
          }
        : null,
  };
}
