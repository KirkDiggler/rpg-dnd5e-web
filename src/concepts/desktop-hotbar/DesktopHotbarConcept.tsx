import { OrganizedHudConcept } from '../organized-hud/OrganizedHudConcept';
import { DESKTOP_HOTBAR_PROFILES } from './fixtures';

/** Same scene and gates as the existing HUD; only its action presentation differs. */
export function DesktopHotbarConcept() {
  return (
    <OrganizedHudConcept
      profiles={DESKTOP_HOTBAR_PROFILES}
      title="Desktop hotbar"
      conceptId="desktop-hotbar"
      iconExperiment
    />
  );
}
