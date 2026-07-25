import React from 'react';
import CardImage from './CardImage.jsx';

export default function PlayerPanel({ player, isMe, isCurrentTurn, lookups, onClick, selectable }) {
  const marshalEntry = player.camp[player.marshalIndex];
  const marshalGeneral = marshalEntry ? lookups.generalsById[marshalEntry.generalId] : null;
  const viceGenerals = (player.viceMarshalIndices || [])
    .map((idx) => player.camp[idx])
    .filter(Boolean)
    .map((entry) => lookups.generalsById[entry.generalId])
    .filter(Boolean);
  const roleDef = player.role ? lookups.rolesById[player.role] : null;
  const infantry = lookups.infantry;

  return (
    <div
      className={[
        'player-panel',
        isCurrentTurn ? 'current-turn' : '',
        player.eliminated ? 'eliminated' : '',
        !player.connected ? 'disconnected' : '',
        selectable ? 'selectable' : ''
      ].join(' ')}
      onClick={selectable ? onClick : undefined}
    >
      <div className="player-panel-header">
        <span className="player-name">
          {player.name} {isMe && <em>(คุณ)</em>}
        </span>
        {isCurrentTurn && <span className="turn-indicator">🎯 ตานี้</span>}
      </div>

      <div className="player-panel-body">
        <div className="general-slot">
          <CardImage src={marshalGeneral?.image} label={marshalGeneral?.name} text={marshalGeneral?.text} size="sm" badge="แม่ทัพ" />
          {viceGenerals.map((vg) => (
            <CardImage key={vg.id} src={vg.image} label={vg.name} text={vg.text} size="xs" badge="รอง" />
          ))}
        </div>
        <div className="stat-column">
          <div className="stat-card-row">
            <CardImage src={infantry?.image} label="ทหารราบ" text={infantry?.abilities?.map((a) => a.text).join(' / ')} size="xxs" noZoom />
            <span>×{player.infantry}</span>
          </div>
          <div className="stat">🃏 {player.handCount}</div>
          <div className="stat">🏕️ {player.camp.length}</div>
        </div>
      </div>

      {roleDef && (
        <div className="stat-card-row role-row">
          <CardImage src={roleDef.image} label={roleDef.name} text={roleDef.winCondition} size="xxs" />
          <span className="role-name-label">{roleDef.name}</span>
        </div>
      )}
      {!roleDef && player.hasRole && !player.eliminated && (
        <div className="stat-card-row role-row">
          <CardImage faceDown size="xxs" noZoom label="บทบาทลับ" />
          <span className="role-name-label muted">บทบาทลับ</span>
        </div>
      )}

      {player.eliminated && <div className="eliminated-badge">ออกจากเกม</div>}
      {!player.connected && !player.eliminated && <div className="offline-badge">ออฟไลน์</div>}
    </div>
  );
}
