# Notification preview evidence

The lab at `?concept=notifications` uses production `StoryNotices`, `useStoryNotices`, `StoryNoticeContent`, `recentEventIdentity` and `StoryLog`. The live `CombatExperience` consumes the same notice hook and renderer. No live server or running castle changes.

## Checked

- Latest focused run: 312 tests pass across 13 files covering the dial registry/store/drawer, notification lifecycle, playback, walk lifecycle, combat component, and session view.
- Full `npm run ci-check` passes: formatting, lint, typecheck, production build, asset guards and full Vitest suite.
- Typecheck and targeted ESLint pass.
- Browser interaction: burst of five produces three notices; dismiss leaves two; remaining notices expire; history still contains the speech.
- Hover and keyboard focus protect the entire visible stack. New events may fill empty slots but never evict protected notices; overflow remains in history. Clicking outside dismisses the stack without consuming the underlying action.
- Existing feel-controls drawer exposes notification duration (0.5–3×, default 1×) and pause-turn-playback (off/on, default off). The existing local dial store persists both. Duration changes apply to new notices, not existing deadlines.
- Browser checks verify the whole stack survives 15 seconds of hover, outside click dismisses it, and the real playback hook pauses/resumes with the option on while continuing with it off. The pause is between presented beats: authority still accepts delivery and an in-flight walk is allowed to finish.
- Desktop screenshot inspected; 390px page has no horizontal overflow or page exceptions.

## Preview limitations

- At 390px, browser geometry confirms the toast is positioned below the Just happened control, remains 270px wide, and the document has no horizontal overflow. Expanded log interaction remains a candidate for the operator's walk.
- Provider RollModifier source/name/ref/label flow was traced through toolkit and API conversion. The renderer was displaying a generic DamageComponent category instead of the sourced modifier; canonical ability and condition refs now render as STR and Raging. Concept fixtures exercise this exact wire shape.
- Fixture controls deliberately announce each sample; they do not redefine live toast selection policy. Monster playback uses the real pacing hook with two delivered attack fixtures. Camera centering and broader monster-event selection are not implemented by this preview.
- Existing static StoryNotice fixtures may omit the optional dismiss callback. The live hook and this lab supply it.
- Independent review, PR creation and operator walk are still pending; no merge.
