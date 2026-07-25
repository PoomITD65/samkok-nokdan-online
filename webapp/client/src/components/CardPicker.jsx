import React, { useState } from 'react';
import CardImage from './CardImage.jsx';

/** Generic "pick N of these cards" widget. cards: [{instanceId, cardId}] */
export default function CardPicker({ cards, lookups, min = 0, max = 1, onConfirm, onCancel, confirmLabel }) {
  const [selected, setSelected] = useState([]);

  function toggle(instanceId) {
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
          return (
            <CardImage
              key={c.instanceId}
              src={def?.image}
              label={def?.name}
              sublabel={def?.textEn}
              size="md"
              selected={selected.includes(c.instanceId)}
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
