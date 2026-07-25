import React from 'react';
import PlayerPanel from './PlayerPanel.jsx';
import CardImage from './CardImage.jsx';

function seatStyle(index, total) {
  // index 0 (me) sits at the bottom (angle = 90°); others go clockwise around the oval.
  const angle = (index / total) * 2 * Math.PI + Math.PI / 2;
  const rx = 44;
  const ry = 41;
  const x = 50 + rx * Math.cos(angle);
  const y = 50 + ry * Math.sin(angle);
  return { left: `${x}%`, top: `${y}%` };
}

export default function TableOval({ state, myPlayerId, lookups }) {
  const players = state.players;
  const myIdx = players.findIndex((p) => p.id === myPlayerId);
  const seated = myIdx === -1 ? players : players.slice(myIdx).concat(players.slice(0, myIdx));

  return (
    <div className="table-oval">
      <div className="table-center">
        <div className="center-title">กองกลาง</div>
        <div className="center-stats">
          <div className="center-stat">
            <CardImage src="/assets/cards/backs/supply_back.jpg" label="เสบียง" size="xs" />
            <span>{state.deckCount}</span>
          </div>
          <div className="center-stat">
            <CardImage src="/assets/cards/backs/supply_back.jpg" label="ใช้แล้ว" size="xs" />
            <span>{state.discardCount}</span>
          </div>
          <div className="center-stat">
            <CardImage src="/assets/cards/backs/general_back.jpg" label="ขุนพล" size="xs" />
            <span>{state.generalPoolCount}</span>
          </div>
        </div>

        <div className="continuous-box">
          <div className="continuous-title">🔗 การ์ดต่อเนื่อง</div>
          {(!state.continuousTricks || state.continuousTricks.length === 0) ? (
            <p className="empty-note">(ไม่มีการ์ดต่อเนื่องในสนาม)</p>
          ) : (
            <div className="continuous-list">
              {state.continuousTricks.map((ct) => {
                const def = lookups.supplyById[ct.cardId];
                const owner = players.find((p) => p.id === ct.ownerPlayerId);
                return <CardImage key={ct.instanceId} src={def?.image} label={def?.name} sublabel={owner?.name} size="xs" />;
              })}
            </div>
          )}
        </div>
      </div>

      {seated.map((p, i) => (
        <div key={p.id} className="table-seat" style={seatStyle(i, seated.length)}>
          <PlayerPanel player={p} isMe={p.id === myPlayerId} isCurrentTurn={p.id === state.currentTurnPlayerId} lookups={lookups} />
        </div>
      ))}
    </div>
  );
}
