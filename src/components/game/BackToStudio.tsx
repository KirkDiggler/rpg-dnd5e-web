/**
 * The way back from the game to the studio watching the same run
 * (rpg-project#1004). Portalled to the body and stacked above everything
 * the game draws (its highest layer is z-index 4201), so no game layer can
 * cover it. It sits in the top-right corner: top-centre holds the game's
 * initiative and free-roam status, the top-left its room label and HUD,
 * and the story log on the right starts lower (88px).
 */
import { createPortal } from 'react-dom';

export const BACK_TO_STUDIO_Z = 10000;

export function BackToStudio({
  onBack,
}: {
  onBack(): void;
}): React.JSX.Element {
  return createPortal(
    <button
      type="button"
      onClick={onBack}
      data-testid="back-to-studio"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: BACK_TO_STUDIO_Z,
        padding: '6px 12px',
        borderRadius: 6,
        border: '1px solid #a7ffeb',
        background: '#0b1418',
        color: '#e6fffa',
        fontSize: 14,
        fontWeight: 600,
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.6)',
        cursor: 'pointer',
      }}
    >
      ← Back to the studio
    </button>,
    document.body
  );
}
