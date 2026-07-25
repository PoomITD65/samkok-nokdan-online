import React, { useState } from 'react';
import CardImage from './CardImage.jsx';

export default function AttackPickerModal({ others, myHand, myInfantry, anyCardFuel, myActiveGeneralId, lookups, onConfirm, onCancel }) {
  const [targetId, setTargetId] = useState(null);

  const target = others.find((p) => p.id === targetId);
  const targetGeneralId = target ? target.camp[target.marshalIndex]?.generalId : null;
  const infantryBlocked = targetGeneralId === 'g18';
  const freeEligible = myActiveGeneralId === 'g11' && target && target.camp.length <= 2;

  const attackCards = myHand.filter((c) => c.cardId === 's_attack');
  const fuelCards = anyCardFuel ? myHand : attackCards;

  if (!targetId) {
    return (
      <div className="attack-picker">
        <h3>เลือกเป้าหมาย</h3>
        <div className="target-grid">
          {others.map((p) => (
            <button key={p.id} className="target-btn" onClick={() => setTargetId(p.id)}>
              {p.name} <span className="mini-stat">🪖{p.infantry}</span>
            </button>
          ))}
        </div>
        <button className="btn ghost" onClick={onCancel}>
          ยกเลิก
        </button>
      </div>
    );
  }

  return (
    <div className="attack-picker">
      <h3>โจมตี {target.name} — เลือกวิธี</h3>
      <div className="fuel-options">
        {freeEligible && (
          <button className="btn primary" onClick={() => onConfirm({ targetId, fuel: 'free' })}>
            ⚡ โจมตีฟรี (ตั๋งโต๊ะ — ค่ายเป้าหมาย ≤ 2 คน)
          </button>
        )}
        {myInfantry >= 1 && !infantryBlocked && (
          <button className="btn secondary" onClick={() => onConfirm({ targetId, fuel: 'infantry' })}>
            🪖 เสียทหารราบ 1 คนเพื่อโจมตี
          </button>
        )}
        {infantryBlocked && <p className="empty-note">(เป้าหมายมีเตียวเหยียง — โจมตีด้วยทหารราบไม่ได้)</p>}
      </div>
      <p className="subtitle">{anyCardFuel ? 'เลือกการ์ดใดก็ได้จากมือ (ความสามารถซุนเกี๋ยน)' : 'เลือกการ์ดโจมตีจากมือ'}</p>
      <div className="card-picker-grid">
        {fuelCards.map((c) => {
          const def = lookups.supplyById[c.cardId];
          return (
            <CardImage
              key={c.instanceId}
              src={def?.image}
              label={def?.name}
              text={def?.text}
              size="md"
              onClick={() => onConfirm({ targetId, fuel: 'card', cardInstanceId: c.instanceId })}
            />
          );
        })}
        {fuelCards.length === 0 && <p className="empty-note">(ไม่มีการ์ดที่ใช้ได้)</p>}
      </div>
      <button className="btn ghost" onClick={() => setTargetId(null)}>
        ย้อนกลับ
      </button>
      <button className="btn ghost" onClick={onCancel}>
        ยกเลิก
      </button>
    </div>
  );
}
