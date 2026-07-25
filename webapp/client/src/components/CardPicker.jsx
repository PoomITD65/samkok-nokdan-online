import React, { useState } from 'react';
import CardImage from './CardImage.jsx';

/** Generic "pick N of these cards" widget. cards: [{instanceId, cardId}].
 * disabledIds (optional): shown for context but can't be picked (e.g. Cao
 * Cao's ability shows the whole discard pile, but only trick cards count). */
export default function CardPicker({ cards, lookups, min = 0, max = 1, onConfirm, onCancel, confirmLabel, disabledIds }) {
  const [selected, setSelected] = useState([]);
  const disabledSet = disabledIds instanceof Set ? disabledIds : new Set(disabledIds || []);

  function toggle(instanceId) {
    if (disabledSet.has(instanceId)) return;
    setSelected((prev) => {
      if (prev.includes(instanceId)) return prev.filter((id) => id !== instanceId);
      if (prev.length >= max) return max === 1 ? [instanceId] : prev;
      return [...prev, instanceId];
    });
  }

  const canConfirm = selected.length >= min && selected.length <= max;

  return (
    <div className="card-picker">
      <div className="card-picker-grid">
        {cards.map((c) => {
          const def = lookups.supplyById[c.cardId];
          const isDisabled = disabledSet.has(c.instanceId);
          return (
            <CardImage
              key={c.instanceId}
              src={def?.image}
              label={def?.name}
              text={def?.text}
              size="md"
              selected={selected.includes(c.instanceId)}
              disabled={isDisabled}
              onClick={() => toggle(c.instanceId)}
            />
          );
        })}
        {cards.length === 0 && <p className="empty-note">(ไม่มีการ์ด)</p>}
      </div>
      <div className="card-picker-actions">
        {min === 0 && (
          <button className="btn ghost" onClick={() => onConfirm([])}>
            ข้าม
          </button>
        )}
        <button className="btn primary" disabled={!canConfirm} onClick={() => onConfirm(selected)}>
          {confirmLabel || `ยืนยัน (${selected.length}/${max})`}
        </button>
        {onCancel && (
          <button className="btn ghost" onClick={onCancel}>
            ยกเลิก
          </button>
        )}
      </div>
    </div>
  );
}
