/**
 * Equipment concept page (rpg-dnd5e-web#531) — fixture-first design bench
 * for the equip screen: EquipmentSlots (worn/wielded) + InventoryLight
 * (carried list) + the server-owned stat readout + a live INTENT LOG that
 * prints exactly what each click would send over the wire.
 *
 * The intent log is the point: equip = send a Reference; everything else
 * (AC, damage, two-handed off-hand clearing) comes BACK from the server.
 * The fixture reducer plays the server here — see fixtures.ts header and
 * CONTRACT.md for the wire gaps this bench exposes.
 */

import { useMemo, useState } from 'react';
import { EquipmentPopover } from '../../components/game/equipment/EquipmentPopover';
import { EquipmentSlots } from '../../components/game/equipment/EquipmentSlots';
import { InventoryLight } from '../../components/game/equipment/InventoryLight';
import type { EquippedMap } from '../../components/game/equipment/equipmentTypes';
import type { EquipIntent } from './fixtures';
import { applyIntent, EQUIP_CASTS } from './fixtures';

export function EquipmentConcept() {
  const [castId, setCastId] = useState(EQUIP_CASTS[0].id);
  const cast = EQUIP_CASTS.find((c) => c.id === castId) ?? EQUIP_CASTS[0];
  const [equippedByCast, setEquippedByCast] = useState<
    Record<string, EquippedMap>
  >(() =>
    Object.fromEntries(EQUIP_CASTS.map((c) => [c.id, { ...c.equipped }]))
  );
  const [intentLog, setIntentLog] = useState<string[]>([]);

  const equipped = equippedByCast[cast.id];
  const stats = useMemo(() => cast.serverStats(equipped), [cast, equipped]);

  const onIntent = (intent: EquipIntent) => {
    const wire =
      intent.kind === 'EquipItem'
        ? `EquipItem { ref: "${intent.ref.module}:${intent.ref.type}:${intent.ref.id}", slot: "${intent.slotKey}" }`
        : intent.kind === 'UnequipItem'
          ? `UnequipItem { slot: "${intent.slotKey}" }`
          : `Unpack { ref: "${intent.ref.module}:${intent.ref.type}:${intent.ref.id}", quantity: ${intent.quantity} }`;
    setIntentLog((log) => [...log.slice(-7), wire]);
    setEquippedByCast((all) => ({
      ...all,
      [cast.id]: applyIntent(all[cast.id], cast.items, intent),
    }));
  };

  // Isolated visual proof with current-production-shaped empty icon keys.
  // The ordinary bench retains its explicit fixture sprite choices.
  const thumbnailPreview =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('thumbnailPreview') === '1';
  if (thumbnailPreview) {
    return (
      <section>
        <h2>Equipment thumbnail sizing</h2>
        <p>
          Real in-game panel, fixture data only. Clicks change this preview, not
          a saved character.
        </p>
        <label>
          Preview character{' '}
          <select
            aria-label="Preview character"
            value={castId}
            onChange={(event) => setCastId(event.target.value)}
          >
            {EQUIP_CASTS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} ({entry.classLabel})
              </option>
            ))}
          </select>
        </label>
        <div
          style={{
            position: 'fixed',
            zIndex: 40,
            left: 0,
            right: 0,
            bottom: 174,
            height: 0,
          }}
        >
          <EquipmentPopover
            open
            characterName={cast.name}
            classLabel={cast.classLabel}
            slots={cast.slots}
            equipped={equipped}
            items={cast.items.map((item) => ({ ...item, iconKey: '' }))}
            armorClass={{ total: stats.ac, note: stats.acNote }}
            mainHandDamage={stats.damage}
            onIntent={onIntent}
          />
        </div>
      </section>
    );
  }

  return (
    <div>
      <p
        className="text-sm mb-4"
        style={{ color: 'var(--text-secondary)', maxWidth: '72rem' }}
      >
        Equipment concept (web#531), fixture-first: slots and item compatibility
        are DATA (per-cast fixtures typed like the wire we want), stat lines are
        server-composed strings, and every click emits the intent the real RPC
        would carry — shown verbatim in the intent log. AC/damage under the
        slots is the SERVER&apos;s recompute (the fixture plays the server; the
        web only displays). Gaps this bench exposes are enumerated in
        CONTRACT.md → the feature request to the platform team. Casts: Fighter
        (sword+board vs two-hander swap), Barbarian (sparse — one item), Rogue
        (dual-wield + light armor + no-slot gear).
      </p>

      <div className="flex gap-2 mb-4 flex-wrap">
        {EQUIP_CASTS.map((c) => (
          <button
            key={c.id}
            onClick={() => setCastId(c.id)}
            className="px-3 py-1.5 rounded text-sm"
            style={{
              backgroundColor:
                c.id === castId
                  ? 'var(--accent-primary)'
                  : 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: `1px solid ${c.id === castId ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
            }}
          >
            {c.name} ({c.classLabel})
          </button>
        ))}
      </div>

      <div className="equip-bench">
        <div>
          <EquipmentSlots
            slots={cast.slots}
            equipped={equipped}
            items={cast.items}
            onIntent={onIntent}
          />
          <div
            className="equip-server-stats hud-skin"
            data-testid="server-stats"
          >
            <span className="equip-stats-title">
              Server recompute (displayed, never derived client-side)
            </span>
            <span>
              AC <strong>{stats.ac}</strong>{' '}
              <em className="equip-stats-note">({stats.acNote})</em>
            </span>
            <span>
              Damage <strong>{stats.damage}</strong>
            </span>
          </div>
        </div>

        <InventoryLight
          slots={cast.slots}
          equipped={equipped}
          items={cast.items}
          onIntent={onIntent}
        />

        <div className="equip-intent-log" data-testid="intent-log">
          <div className="equip-inventory-header">
            Intent log — what the wire would carry
          </div>
          {intentLog.length === 0 && (
            <div className="equip-inventory-empty">
              Click an item to equip it, a socket to unequip.
            </div>
          )}
          {intentLog.map((line, i) => (
            <code key={i}>{line}</code>
          ))}
        </div>
      </div>
    </div>
  );
}
