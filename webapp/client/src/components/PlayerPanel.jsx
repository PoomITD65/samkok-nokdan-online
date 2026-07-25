import React from 'react';
import CardImage from './CardImage.jsx';
import { ROLE_LABEL_TH } from '../gamedata.js';

export default function PlayerPanel({ player, isMe, isCurrentTurn, lookups, onClick, selectable }) {
  const marshalEntry = player.camp[player.marshalIndex];
  const viceEntry = player.viceMarshalIndex !== null ? player.camp[player.viceMarshalIndex] : null;
  const marshalGeneral = marshalEntry ? lookups.generalsById[marshalEntry.generalId] : null;
  const viceGeneral = viceEntry ? lookups.generalsById[viceEntry.generalId] : null;

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
          <CardImage src={marshalGeneral?.image} label={marshalGeneral?.name} size="sm" badge="แม่ทัพ" />
          {viceGeneral && <CardImage src={viceGeneral?.image} label={viceGeneral?.name} size="xs" badge="รอง" />}
        </div>
        <div className="stat-column">
          <div className="stat infantry">🪖 {player.infantry}</div>
          <div className="stat">🃏 {player.handCount}</div>
          <div className="stat">🏕️ {player.camp.length}</div>
        </div>
      </div>

      {(player.roleRevealed || player.eliminated) && player.role && (
        <div className={`role-badge role-${player.role}`}>{ROLE_LABEL_TH[player.role] || player.role}</div>
      )}
      {player.eliminated && <div className="eliminated-badge">ออกจากเกม</div>}
      {!player.connected && !player.eliminated && <div className="offline-badge">ออฟไลน์</div>}
    </div>
  );
}
