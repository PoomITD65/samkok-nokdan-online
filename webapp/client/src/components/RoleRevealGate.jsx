import React, { useState } from 'react';

/** A one-time "flip your role card" moment at the start of the game — mirrors
 * physically flipping the face-down role card in the real game, for suspense. */
export default function RoleRevealGate({ roleDef, storageKey, onDone }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="modal-overlay role-gate-overlay">
      <div className="zoom-panel role-gate-panel">
        {!flipped ? (
          <>
            <h3>บทบาทลับของคุณมาถึงแล้ว</h3>
            <button className="role-flip-card" onClick={() => setFlipped(true)}>
              <div className="role-flip-inner">🂠</div>
            </button>
            <p className="subtitle">กดที่การ์ดเพื่อเปิดดูบทบาทของคุณ</p>
          </>
        ) : (
          <>
            <img className="zoom-img role-reveal-img" src={roleDef.image} alt={roleDef.name} />
            <h3>{roleDef.name}</h3>
            <p className="zoom-text">{roleDef.winCondition}</p>
            <button
              className="btn primary"
              onClick={() => {
                localStorage.setItem(storageKey, 'true');
                onDone();
              }}
            >
              เข้าเกม
            </button>
          </>
        )}
      </div>
    </div>
  );
}
