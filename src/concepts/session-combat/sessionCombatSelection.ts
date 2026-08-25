import type {
  SessionCombatFixture,
  SessionCombatOffer,
  SessionCombatTargetCandidate,
} from './sessionCombatTypes';

export interface SessionCombatSelection {
  offer: SessionCombatOffer;
  candidates: SessionCombatTargetCandidate[];
  target: SessionCombatTargetCandidate | null;
}

/** Selects exactly one server-authored offer; it never manufactures actions. */
export function selectOffer(
  fixture: SessionCombatFixture,
  offerId: string
): SessionCombatSelection | null {
  const offer = fixture.offers.find((candidate) => candidate.id === offerId);
  if (!offer || !offer.available) return null;
  return { offer, candidates: [...offer.candidates], target: null };
}

/**
 * Selects only an affordable candidate already carried by the chosen offer.
 * Unknown and unavailable targets leave the selection unchanged.
 */
export function selectTarget(
  selection: SessionCombatSelection,
  targetId: string
): SessionCombatSelection {
  const target = selection.candidates.find(
    (candidate) => candidate.id === targetId && candidate.available
  );
  return target ? { ...selection, target } : selection;
}
