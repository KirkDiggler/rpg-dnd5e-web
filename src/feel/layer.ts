/**
 * Shared stacking-context floor for every dev-tools surface that must
 * paint over a live session route (#906 round 4). `SessionEncounterView`
 * portals its whole view straight into `document.body` at `zIndex: 100`
 * (its own "run ended" overlay reaches `zIndex: 1000`), and the generic
 * `Dialog` reaches `zIndex: 3010`. A dev-tools element at or below any of
 * those loses the tie on DOM order and renders invisibly behind the live
 * game — this happened twice (the drawer first, then the wrench button
 * row), which is why both share this ONE constant rather than each
 * picking their own number.
 *
 * Stays below the app's real toast layer (`zIndex: 99999` in
 * `components/ui/Toast.tsx`) so a critical toast still wins over dev
 * tooling.
 *
 * Tailwind's arbitrary-value classes (`z-[5000]`) are scanned statically
 * at build time, so a class built from this constant at runtime would not
 * be generated — every consumer applies it via an inline `style={{
 * zIndex: FEEL_LAB_LAYER_Z }}` instead of a Tailwind class.
 */
export const FEEL_LAB_LAYER_Z = 5000;
