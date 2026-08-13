import { DiceTray3DShell } from '../../components/ui/dice/DiceTray3DShell';

export function DiceTray3DConceptPanel() {
  return (
    <section className="dice-tray-3d-concept-panel">
      <header>
        <h3>Empty tray checkpoint</h3>
        <p>No interaction yet.</p>
      </header>
      <DiceTray3DShell label="Player attack tray" phase="empty" />
    </section>
  );
}
