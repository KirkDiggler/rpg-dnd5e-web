/**
 * PromptModal — the skill-check / reaction InputRequired prompt, lifted out
 * of PlaytestHarness (Wave 2.9 / 2.11d) so PlaytestHarness and EncounterView
 * render the exact same modal off the exact same dispatch logic rather than
 * two copies drifting apart. GameView slice 2 (#440).
 *
 * Owns its own RPC dispatch (useSubmitCheck), roll input, transient
 * post-submit result display, and auto-clear timer — callers only pass the
 * current prompt (from useEncounterState) and a dismiss callback. This is a
 * behavior-preserving extraction: testids (skill-check-prompt, prompt-result,
 * reaction-prompt, reaction-take-btn, reaction-skip-btn, unsupported-prompt)
 * and copy match the original harness markup exactly so PlaytestHarness's
 * existing test suite continues to assert through it unchanged.
 */

import type { InputRequired } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useEffect, useRef, useState } from 'react';
import { useSubmitCheck } from '../../api/useSubmitCheck';

export interface PromptModalProps {
  encounterId: string;
  /** The local player's entity id — the character the check/reaction resolves for. */
  entityId: string;
  /** The current pending prompt (null renders nothing). */
  prompt: InputRequired | null;
  /** Called to clear the prompt — on Dismiss, or after the 2s post-submit result window. */
  onDismiss: () => void;
  /** Optional event-log sink (PlaytestHarness's Recent-events log). */
  onLog?: (message: string) => void;
}

export function PromptModal({
  encounterId,
  entityId,
  prompt,
  onDismiss,
  onLog,
}: PromptModalProps) {
  const {
    submitCheck,
    loading: submitCheckLoading,
    error: submitCheckError,
  } = useSubmitCheck();
  const [rollValue, setRollValue] = useState(10);
  const [promptResult, setPromptResult] = useState<{
    success: boolean;
    total: number;
    roll: number;
  } | null>(null);

  // Ref to the prompt that is currently being auto-cleared; guards against
  // clearing a newer prompt when the timer from a prior submit fires late.
  const clearResultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const clearingPromptRef = useRef<InputRequired | null>(null);
  // Always-fresh mirror of the current prompt prop. handleSubmitReaction
  // compares the prompt-at-await-start to the freshest prompt after the
  // await so a newer prompt arriving during the RPC isn't clobbered.
  const latestPromptRef = useRef<InputRequired | null>(prompt);
  useEffect(() => {
    latestPromptRef.current = prompt;
  }, [prompt]);

  // Reset transient result state whenever a NEW prompt identity arrives —
  // generalizes what the harness previously did at each call site that
  // published a prompt (the stream's onInputRequiredDelivered and
  // handleOpenDoor's inline RPC response). Doing it here means every
  // pendingPrompt change is covered from one place regardless of source.
  const promptIdentityRef = useRef<InputRequired | null>(null);
  useEffect(() => {
    if (prompt !== promptIdentityRef.current) {
      promptIdentityRef.current = prompt;
      if (clearResultTimerRef.current) {
        clearTimeout(clearResultTimerRef.current);
        clearResultTimerRef.current = null;
      }
      clearingPromptRef.current = null;
      setPromptResult(null);
    }
  }, [prompt]);

  useEffect(() => {
    return () => {
      if (clearResultTimerRef.current) {
        clearTimeout(clearResultTimerRef.current);
      }
    };
  }, []);

  if (prompt === null) {
    return null;
  }

  const handleSubmitCheck = async () => {
    const promptBeingResolved = prompt;
    try {
      const response = await submitCheck({
        encounterId,
        entityId,
        roll: rollValue,
      });
      onLog?.(
        `SubmitCheck → rolled ${rollValue.toString()}, total ${response.total.toString()}, ${response.success ? 'success!' : 'failed.'}`
      );
      setPromptResult({
        success: response.success,
        total: response.total,
        roll: rollValue,
      });
      if (clearResultTimerRef.current) {
        clearTimeout(clearResultTimerRef.current);
      }
      clearingPromptRef.current = promptBeingResolved;
      clearResultTimerRef.current = setTimeout(() => {
        if (clearingPromptRef.current === promptBeingResolved) {
          setPromptResult(null);
          onDismiss();
        }
        clearResultTimerRef.current = null;
        clearingPromptRef.current = null;
      }, 2000);
    } catch {
      // error is surfaced via submitCheckError state below
    }
  };

  const handleSubmitReaction = async (takeReaction: boolean) => {
    const promptBeingResolved = prompt;
    try {
      await submitCheck({
        encounterId,
        entityId,
        roll: 0, // ignored for reaction prompts
        takeReaction,
      });
      onLog?.(
        `SubmitCheck{take_reaction:${takeReaction.toString()}} → reaction ${takeReaction ? 'taken' : 'skipped'}`
      );
      if (latestPromptRef.current === promptBeingResolved) {
        onDismiss();
      }
    } catch {
      // error is surfaced via submitCheckError state below
    }
  };

  if (prompt.kind?.case === 'skillCheck') {
    const sc = prompt.kind.value;
    return (
      <div
        data-testid="skill-check-prompt"
        style={{
          margin: '16px 0 8px',
          padding: '12px',
          background: '#1a1a2e',
          border: '1px solid #4a4aaa',
          borderRadius: 4,
        }}
      >
        <h3 style={{ margin: '0 0 8px', color: '#aaf' }}>Skill check prompt</h3>
        <div style={{ fontSize: 13, marginBottom: 8 }}>
          <strong>
            Skill check: {sc.ability} (DC {sc.dc})
          </strong>
          {sc.tool && (
            <span style={{ color: '#aaa', marginLeft: 8 }}>
              — requires: {sc.tool.id}
            </span>
          )}
        </div>
        {promptResult !== null ? (
          <div
            data-testid="prompt-result"
            style={{
              color: promptResult.success ? '#8f8' : '#f88',
              fontWeight: 'bold',
              fontSize: 13,
            }}
          >
            rolled {promptResult.roll}, total {promptResult.total},{' '}
            {promptResult.success ? 'success!' : 'failed.'}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <label style={{ fontSize: 12 }}>
              Roll (1-20){' '}
              <input
                type="number"
                min={1}
                max={20}
                step={1}
                value={rollValue}
                aria-label="roll value"
                onChange={(e) =>
                  setRollValue(
                    Math.min(
                      20,
                      Math.max(1, Math.trunc(Number(e.target.value)))
                    )
                  )
                }
                style={{
                  width: 60,
                  background: '#333',
                  color: '#eee',
                  border: '1px solid #555',
                  padding: '2px 4px',
                }}
              />
            </label>
            <button
              onClick={() => void handleSubmitCheck()}
              disabled={submitCheckLoading}
              style={{
                padding: '4px 12px',
                background: '#2a2a4a',
                color: '#aaf',
                border: '1px solid #4a4aaa',
                cursor: submitCheckLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {submitCheckLoading ? 'Submitting…' : 'Submit roll'}
            </button>
            <button
              onClick={onDismiss}
              style={{
                padding: '4px 8px',
                background: '#2a2a2a',
                color: '#888',
                border: '1px solid #444',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              Dismiss
            </button>
          </div>
        )}
        {submitCheckError && (
          <div style={{ color: '#f88', marginTop: 8, fontSize: 12 }}>
            SubmitCheck error: {submitCheckError.message}
          </div>
        )}
      </div>
    );
  }

  if (prompt.kind?.case === 'reactionPrompt') {
    const rp = prompt.kind.value;
    const refStr = rp.reactionRef
      ? `${rp.reactionRef.module}:${rp.reactionRef.type}:${rp.reactionRef.id}`
      : 'unknown reaction';
    const description =
      rp.displayText !== ''
        ? rp.displayText
        : `${rp.triggerKind} reaction from ${rp.triggerSourceEntityId}`;
    return (
      <div
        data-testid="reaction-prompt"
        style={{
          margin: '16px 0 8px',
          padding: '12px',
          background: '#2a1a1a',
          border: '1px solid #aa4a4a',
          borderRadius: 4,
        }}
      >
        <h3 style={{ margin: '0 0 8px', color: '#faa' }}>
          Reaction prompt: {refStr}
        </h3>
        <div style={{ fontSize: 13, marginBottom: 8 }}>{description}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            data-testid="reaction-take-btn"
            onClick={() => void handleSubmitReaction(true)}
            disabled={submitCheckLoading}
            style={{
              padding: '4px 12px',
              background: '#3a2a2a',
              color: '#faa',
              border: '1px solid #aa4a4a',
              cursor: submitCheckLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {submitCheckLoading ? 'Submitting…' : 'Take'}
          </button>
          <button
            data-testid="reaction-skip-btn"
            onClick={() => void handleSubmitReaction(false)}
            disabled={submitCheckLoading}
            style={{
              padding: '4px 12px',
              background: '#2a2a2a',
              color: '#bbb',
              border: '1px solid #555',
              cursor: submitCheckLoading ? 'not-allowed' : 'pointer',
            }}
          >
            Skip
          </button>
        </div>
        {submitCheckError && (
          <div style={{ color: '#f88', marginTop: 8, fontSize: 12 }}>
            SubmitCheck error: {submitCheckError.message}
          </div>
        )}
      </div>
    );
  }

  // dialogue / targetSelect — Wave 2.10+
  return (
    <div
      data-testid="unsupported-prompt"
      style={{
        margin: '16px 0 8px',
        padding: '8px 12px',
        background: '#1a1a1a',
        border: '1px solid #555',
        borderRadius: 4,
        color: '#888',
        fontSize: 12,
      }}
    >
      Prompt type {prompt.kind?.case ?? 'unknown'}: not yet supported (Wave
      2.10+)
    </div>
  );
}
