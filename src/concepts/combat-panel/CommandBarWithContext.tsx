/**
 * Composition B: "Verbs + context zone" — Composition A plus a slim strip
 * that TEACHES (prototypes the rpg-dnd5e-web#533 direction). The strip's
 * one job: answer "what is the game waiting for?" in words, driven purely
 * by the same server-given state the bar renders — armed guidance, whose
 * turn it is, free-roam status. It is one line, ~22px, and never grows.
 * (Strip extracted to ContextStrip in round 4 — shared by C/D/E.)
 */

import { CommandBar, type CommandBarProps } from './CommandBar';
import { ContextStrip } from './ContextStrip';

export function CommandBarWithContext(props: CommandBarProps) {
  return (
    <div>
      <ContextStrip fixture={props.fixture} armedKey={props.armedKey} />
      <CommandBar {...props} />
    </div>
  );
}
