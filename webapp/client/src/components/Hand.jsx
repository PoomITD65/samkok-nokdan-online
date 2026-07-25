import React from 'react';
import CardImage from './CardImage.jsx';

export default function Hand({ hand, lookups }) {
  return (
    <div className="hand-row">
      <div className="hand-label">มือของคุณ ({hand.length} ใบ)</div>
      <div className="hand-cards">
        {hand.map((c) => {
          const def = lookups.supplyById[c.cardId];
          return <CardImage key={c.instanceId} src={def?.image} label={def?.name} size="md" />;
        })}
        {hand.length === 0 && <p className="empty-note">(ไม่มีการ์ดในมือ)</p>}
      </div>
    </div>
  );
}
