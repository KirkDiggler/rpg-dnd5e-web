import type { AttackResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface AttackResultToastProps {
  attackResult: AttackResponse | null;
  onClose: () => void;
  /** Duration in milliseconds to show the toast (default: 4000) */
  duration?: number;
}

/**
 * AttackResultToast - Shows attack results in a dismissible toast
 *
 * Displays hit/miss status, damage dealt, and critical hit indicators
 * using protobuf AttackResponse as the single source of truth.
 */
export function AttackResultToast({
  attackResult,
  onClose,
  duration = 4000,
}: AttackResultToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null
  );

  // Create portal container
  useEffect(() => {
    let container = document.getElementById('toast-portal');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-portal';
      container.style.position = 'fixed';
      container.style.top = '20px';
      container.style.right = '20px';
      container.style.zIndex = '3000';
      container.style.pointerEvents = 'none';
      document.body.appendChild(container);
    }
    setPortalContainer(container);
  }, []);

  // Show/hide animation and auto-close
  useEffect(() => {
    if (attackResult) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300); // Wait for fade out animation
      }, duration);

      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [attackResult, duration, onClose]);

  // Don't render if no attack result
  if (!attackResult || !attackResult.result || !portalContainer) {
    return null;
  }

  const { result } = attackResult;
  const isHit = result.hit;
  const isCritical = result.critical;
  const damage = result.damage;
  const damageType = result.damageType;

  const toastContent = (
    <div
      style={{
        transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
        opacity: isVisible ? 1 : 0,
        transition: 'all 0.3s ease-in-out',
        pointerEvents: 'auto',
        minWidth: '300px',
        maxWidth: '400px',
        backgroundColor: isHit ? '#065F46' : '#7F1D1D', // Dark green for hit, dark red for miss
        border: `2px solid ${isHit ? '#10B981' : '#EF4444'}`,
        borderRadius: '12px',
        padding: '16px',
        color: 'white',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Header with hit/miss status */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: 'bold',
            color: isHit ? '#34D399' : '#F87171',
          }}
        >
          {isCritical ? '💥 CRITICAL HIT!' : isHit ? '⚔️ HIT!' : '🛡️ MISS!'}
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.6)',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '0',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Attack roll details */}
      <div style={{ fontSize: '14px', marginBottom: '12px', opacity: 0.9 }}>
        <div>
          <strong>Roll:</strong> {result.attackRoll} + modifiers ={' '}
          {result.attackTotal}
        </div>
        <div>
          <strong>Target AC:</strong> {result.targetAc}
        </div>
      </div>

      {/* Damage details (only if hit) */}
      {isHit && damage > 0 && (
        <div
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '8px',
            padding: '12px',
            marginTop: '8px',
          }}
        >
          <div
            style={{
              fontSize: '20px',
              fontWeight: 'bold',
              textAlign: 'center',
            }}
          >
            💔 {damage} {damageType} damage
          </div>
          {isCritical && (
            <div
              style={{
                fontSize: '12px',
                textAlign: 'center',
                marginTop: '4px',
                color: '#FCD34D',
              }}
            >
              Double damage dice rolled!
            </div>
          )}
        </div>
      )}
    </div>
  );

  return createPortal(toastContent, portalContainer);
}
