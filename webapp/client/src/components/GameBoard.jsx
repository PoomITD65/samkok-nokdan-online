import React, { useState } from 'react';
import { buildLookups, ROLE_LABEL_TH } from '../gamedata.js';
import TableOval from './TableOval.jsx';
import Hand from './Hand.jsx';
import ActionBar from './ActionBar.jsx';
import LogPanel from './LogPanel.jsx';
import WinScreen from './WinScreen.jsx';

export default function GameBoard({ state, myPlayerId, roomCode, gameData, onLeave }) {
  const [showLog, setShowLog] = useState(false);
  const lookups = buildLookups(gameData);
  const me = state.players.find((p) => p.id === myPlayerId);
  const isMyTurn = state.currentTurnPlayerId === myPlayerId;
  const myRole = me?.role ? lookups.rolesById[me.role] : null;

  if (!me) return null;

  return (
    <div className="game-board">
      <header className="board-header">
        <span>ห้อง {roomCode}</span>
        <button className="btn ghost small" onClick={() => setShowLog((s) => !s)}>
          📜 บันทึก
        </button>
        <button className="btn ghost small" onClick={onLeave}>
          ออก
        </button>
      </header>

      {myRole && (
        <div className="my-role-banner">
          <strong>บทบาทของคุณ: {ROLE_LABEL_TH[myRole.id] || myRole.name}</strong>
          <span>{myRole.winCondition}</span>
        </div>
      )}

      <TableOval state={state} myPlayerId={myPlayerId} lookups={lookups} />

      {state.waitingOn && state.waitingOn.length > 0 && (
        <div className="waiting-banner">
          {state.waitingOn.map((w) => (
            <div key={w.id}>⏳ {w.messageTh || w.message}</div>
          ))}
        </div>
      )}

      <Hand hand={me.hand || []} lookups={lookups} />

      <ActionBar state={state} me={me} lookups={lookups} isMyTurn={isMyTurn} />

      {showLog && <LogPanel log={state.log || []} />}

      {state.winner && <WinScreen winner={state.winner} players={state.players} onLeave={onLeave} />}
    </div>
  );
}
