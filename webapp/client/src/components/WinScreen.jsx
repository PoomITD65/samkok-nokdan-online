import React from 'react';
import { ROLE_LABEL_TH } from '../gamedata.js';

export default function WinScreen({ winner, players, onLeave }) {
  const winners = players.filter((p) => winner.playerIds.includes(p.id));
  return (
    <div className="modal-overlay">
      <div className="modal-panel win-panel">
        <h1>🏆 จบเกม!</h1>
        <p className="win-text">{winner.textTh}</p>
        <div className="winners-list">
          {winners.map((p) => (
            <div key={p.id} className="winner-chip">
              {p.name} {p.role && <span className="badge">{ROLE_LABEL_TH[p.role] || p.role}</span>}
            </div>
          ))}
        </div>
        <button className="btn primary" onClick={onLeave}>
          ออกจากห้อง
        </button>
      </div>
    </div>
  );
}
