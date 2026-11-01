# Notification preview implementation plan

## Agreed scope

Build a Concepts preview using the same components as the game. Preserve Just happened and its loading behavior. Compact icon/name/text communicates activity; attacks and speech are primary, perception is secondary. Toasts expire and dismiss without removing history. No running-stack changes or merge in this pass.

## Approach

Reuse StoryNotices, useStoryNotices, recentEventIdentity and StoryLog rather than create a parallel renderer. Concept-only fixtures supply resolved events. Keep existing three-notice bound and text-length duration. Details expand within a compact notice. Source labels remain provider facts: never infer STR from a weapon or Rage from a generic condition.

## Tasks

- [ ] Pin existing hook baseline with `npm run test:run -- src/components/session/combat-experience/useStoryNotices.test.tsx`.
- [ ] Add failing assertions: combat notices expire without another action; dismiss removes only a notice and replay does not resurrect it. Add rendering test for accessible dismiss, shared identity, and collapsed details.
- [ ] Extend each hook-produced StoryNotice.notice with `dismiss(): void`; replace indefinite combat holding with finite expiry. Preserve catch-up, deduplication, scope reset, and three-item cap tests.
- [ ] Update shared StoryNotices to use recentEventIdentity, show compact headline/outcome and expandable StoryNoticeContent, with interactive dismiss controls. Perception gets secondary styling, never color alone.
- [ ] Register `?concept=notifications` in ConceptsView. Fixture controls release attack, speech, sound and bursts through the real hook. Render real StoryLog alongside it; source-label examples explicitly represent desired provider data, not proof that live data carries it.
- [ ] Run focused tests, typecheck, then browser verification at a separate port. Verify narrow width, dismissal, expiry, history retention and bursts. Record any source-data gap rather than invent a fallback.

## Accepted follow-up: stack interaction and controls

- Whole-stack lifetime protection while any notice is hovered or keyboard-focused; click-away dismisses the visible stack, not history.
- Live `SessionEncounterView` supplies the shared notices and compact Just happened preview on narrow and desktop layouts; Concepts cannot be the only consumer.
- Add notification duration and pause-while-reading to the existing feel-controls registry/drawer. Default duration 1×, playback pause off. Use existing local preference persistence.
- Feed the shared hook's interaction signal through CombatExperience to useSessionCombatExperience, then gate useCombatStoryPacing between beats. Keep authority ingestion and in-flight walks untouched.
- Concepts uses the same drawer, hook and pacing owner; its attack, speech and hearing fixtures carry the real `toastFor` verdicts. Production policy selects own/targeted speech as primary and observer-only hearing as secondary; discovery remains quiet. Two monster attack fixtures let the operator compare both pause settings. Camera centering and broader monster-event selection remain out of this pass.
- Verification: hook fake-timer tests for whole-stack protection/dismissal/duration and playback gate, existing session/walk suites, real-browser comparison of both settings.

## Review focus

Catch-up must not announce. New events must not prolong old notices. Dismissal must not delete history. Interaction must not leak through to map controls. Unknown sources must remain honest.
