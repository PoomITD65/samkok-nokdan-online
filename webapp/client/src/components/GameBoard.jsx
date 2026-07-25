import React, { useState } from 'react';
import { buildLookups } from '../gamedata.js';
import TableOval from './TableOval.jsx';
import Hand from './Hand.jsx';
import ActionBar from './ActionBar.jsx';
import LogPanel from './LogPanel.jsx';
import WinScreen from './WinScreen.jsx';
import EventToasts from './EventToasts.jsx';
import RoleRevealGate from './RoleRevealGate.jsx';
import CardImage from './CardImage.jsx';

export default function GameBoard({ state, myPlayerId, roomCode, gameData, onLeave }) {
  const [showLog, setShowLog] = useState(false);
  const lookups = buildLookups(gameData);
  const me = state.players.find((p) => p.id === myPlayerId);
  const isMyTurn = state.currentTurnPlayerId === myPlayerId;
  const myRole = me?.role ? lookups.rolesById[me.role] : null;

  const roleGateKey = `samkok_role_seen_${roomCode}_${myPlayerId}`;
  const [roleGateDismissed, setRoleGateDismissed] = useState(() => localStorage.getItem(roleGateKey) === 'true');
  const needsRoleGate = myRole && myRole.id !== 'royal' && !roleGateDismissed;

  if (!me) return null;

  if (needsRoleGate) {
    return <RoleRevealGate roleDef={myRole} storageKey={roleGateKey} onDone={() => setRoleGateDismissed(true)} />;
  }

  return (
    <div className="game-board">
      <EventToasts log={state.log || []} />
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
          <CardImage src={myRole.image} label={myRole.name} noZoom size="xs" />
          <div className="my-role-text">
            <strong>บทบาทของคุณ: {myRole.name}</strong>
            <span>{myRole.winCondition}</span>
          </div>
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
