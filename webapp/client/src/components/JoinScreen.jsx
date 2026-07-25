import React, { useState } from 'react';
import { emitAsync } from '../socket.js';

export default function JoinScreen({ onJoined, error, setError }) {
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState('create'); // 'create' | 'join'
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return setError('กรุณาใส่ชื่อของคุณ');
    setBusy(true);
    const res = await emitAsync('room:create', { name: name.trim() });
    setBusy(false);
    if (res?.ok) onJoined(res);
    else setError(res?.reason || 'สร้างห้องไม่สำเร็จ');
  }

  async function handleJoin() {
    if (!name.trim()) return setError('กรุณาใส่ชื่อของคุณ');
    if (!joinCode.trim()) return setError('กรุณาใส่รหัสห้อง');
    setBusy(true);
    const res = await emitAsync('room:join', { roomCode: joinCode.trim().toUpperCase(), name: name.trim() });
    setBusy(false);
    if (res?.ok) onJoined(res);
    else setError(reasonText(res?.reason));
  }

  function reasonText(reason) {
    switch (reason) {
      case 'room_not_found':
        return 'ไม่พบห้องนี้ ตรวจสอบรหัสห้องอีกครั้ง';
      case 'already_started':
        return 'ห้องนี้เริ่มเกมไปแล้ว';
      case 'room_full':
        return 'ห้องเต็มแล้ว (สูงสุด 10 คน)';
      default:
        return 'เข้าห้องไม่สำเร็จ';
    }
  }

  return (
    <div className="center-screen">
      <div className="card-panel join-panel">
        <h1>สามก๊ก: นอกด่านรุกราน</h1>
        <p className="subtitle">เล่นออนไลน์กับเพื่อนในวง LAN เดียวกัน</p>

        <div className="tabs">
          <button className={mode === 'create' ? 'tab active' : 'tab'} onClick={() => setMode('create')}>
            สร้างห้องใหม่
          </button>
          <button className={mode === 'join' ? 'tab active' : 'tab'} onClick={() => setMode('join')}>
            เข้าร่วมห้อง
          </button>
        </div>

        <label className="field">
          <span>ชื่อของคุณ</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="เช่น เป้" />
        </label>

        {mode === 'join' && (
          <label className="field">
            <span>รหัสห้อง</span>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={4}
              placeholder="เช่น A1B2"
              style={{ textTransform: 'uppercase', letterSpacing: '0.2em' }}
            />
          </label>
        )}

        {error && <div className="error-banner">{error}</div>}

        {mode === 'create' ? (
          <button className="btn primary" disabled={busy} onClick={handleCreate}>
            สร้างห้อง
          </button>
        ) : (
          <button className="btn primary" disabled={busy} onClick={handleJoin}>
            เข้าร่วม
          </button>
        )}
      </div>
    </div>
  );
}
