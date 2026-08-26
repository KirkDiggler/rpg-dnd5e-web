# Task 6A report

- RED: `npm test -- --run src/concepts/weapon-attachment/WeaponAttachmentPreview.test.tsx` — 4 failed, 3 passed; invalidate was called 0 times.
- GREEN: same command — 1 file passed, 7 tests passed.
- Focused: Preview, WeaponAttachmentConcept, and ClassCharacterModel — 3 files passed, 12 tests passed.
- Typecheck: `npm run typecheck` — passed.
- CI: `npm run ci-check` — exit 1 only because 38 pre-existing `.superpowers` markdown files fail repository-wide formatting; lint, typecheck, build, and tests passed.
- Files: `WeaponAttachmentPreview.tsx`, `WeaponAttachmentPreview.test.tsx`, this report.
- Commit: `fix(concepts): activate weapon cameras in demand mode (#821)` (amended with this report).
- Self-review: shared post-mount effect reads current `invalidate`; all three camera branches request once, ordinary rerenders do not; camera constants, quaternion, geometry, height, and demand mode are unchanged.
