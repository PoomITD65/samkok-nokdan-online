import React, { useState } from 'react';
import { emitAsync } from '../socket.js';

export default function Lobby({ state, myPlayerId, roomCode, gameData, onLeave }) {
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState(null);
  const isHost = state.hostPlayerId === myPlayerId;
  const lanUrl = `${window.location.protocol}//${window.location.host}`;

  async function handleStart() {
    setStarting(true);
    setErr(null);
    const res = await emitAsync('room:start', {});
    setStarting(false);
    if (!res?.ok) setErr(reasonText(res?.reason));
  }

  function reasonText(reason) {
    if (reason === 'need_at_least_2') return 'ต้องมีผู้เล่นอย่างน้อย 2 คน';
    if (reason === 'too_many') return 'ผู้เล่นเกิน 10 คน';
    if (reason === 'not_host') return 'เฉพาะเจ้าของห้องเท่านั้นที่เริ่มเกมได้';
    return 'เริ่มเกมไม่สำเร็จ';
  }

  return (
    <div className="center-screen">
      <div className="card-panel lobby-panel">
        <h1>ห้องรอ</h1>
        <div className="room-code-display">
          รหัสห้อง: <span>{roomCode}</span>
        </div>
        <p className="subtitle">ให้เพื่อนเปิดเบราว์เซอร์แล้วเข้า</p>
        <div className="lan-url">{lanUrl}</div>
        <p className="subtitle">แล้วกด "เข้าร่วมห้อง" ใส่รหัส {roomCode}</p>

        <h3>ผู้เล่น ({state.players.length}/10)</h3>
        <ul className="player-list">
          {state.players.map((p) => (
            <li key={p.id} className={p.id === myPlayerId ? 'me' : ''}>
              {p.name} {p.isHost && <span className="badge">โฮสต์</span>} {p.id === myPlayerId && <span className="badge">คุณ</span>}
              {!p.connected && <span className="badge offline">ออฟไลน์</span>}
            </li>
          ))}
        </ul>

        {err && <div className="error-banner">{err}</div>}

        {isHost ? (
          <button className="btn primary" disabled={starting || state.players.length < 2} onClick={handleStart}>
            {starting ? 'กำลังเริ่ม...' : `เริ่มเกม (${state.players.length} คน)`}
          </button>
        ) : (
          <p className="waiting-text">รอเจ้าของห้องเริ่มเกม...</p>
        )}

        <button className="btn ghost" onClick={onLeave}>
          ออกจากห้อง
        </button>
      </div>
    </div>
  );
}
