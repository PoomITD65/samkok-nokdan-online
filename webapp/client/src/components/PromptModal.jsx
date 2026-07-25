import React, { useState } from 'react';
import CardImage from './CardImage.jsx';
import CardPicker from './CardPicker.jsx';
import AttackPickerModal from './AttackPickerModal.jsx';
import { emitAsync } from '../socket.js';

const OPTION_LABELS = {
  infantry: '🪖 ใช้/เสียทหารราบ',
  demote_vice: '⬇️ ปลดรองแม่ทัพกลับกองขุนพล',
  card: '🃏 ใช้การ์ดโจมตี',
  nanhua: '📜 ทิ้งการ์ด 2 ใบ (เซียนหนานหัว)'
};

export default function PromptModal({ prompt, state, myPlayerId, lookups }) {
  const [busy, setBusy] = useState(false);
  const me = state.players.find((p) => p.id === myPlayerId);

  async function respond(payload) {
    setBusy(true);
    await emitAsync('prompt:respond', { promptId: prompt.id, payload });
    setBusy(false);
  }

  const title = prompt.messageTh || prompt.message;

  return (
    <div className="modal-overlay">
      <div className="modal-panel">
        <p className="modal-message">{title}</p>
        <div className="modal-body">{busy ? <p>กำลังส่ง...</p> : renderBody()}</div>
      </div>
    </div>
  );

  function renderBody() {
    switch (prompt.kind) {
      case 'yesNo':
        return (
          <div className="row-actions">
            <button className="btn primary" onClick={() => respond({ yes: true })}>
              ใช่
            </button>
            <button className="btn ghost" onClick={() => respond({ yes: false })}>
              ไม่
            </button>
          </div>
        );

      case 'playCounterTrick':
      case 'playAmbush':
      case 'playInciteArmy':
        return (
          <div className="row-actions">
            <button className="btn primary" onClick={() => respond({})}>
              เล่นการ์ดนี้
            </button>
            <button className="btn ghost" onClick={() => respond({ skip: true })}>
              ข้าม
            </button>
          </div>
        );

      case 'chooseTarget': {
        const options = (prompt.options || []).map((id) => state.players.find((p) => p.id === id)).filter(Boolean);
        return (
          <div className="target-grid">
            {options.map((p) => (
              <button key={p.id} className="target-btn" onClick={() => respond({ choice: p.id })}>
                {p.name}
              </button>
            ))}
          </div>
        );
      }

      case 'chooseGeneral': {
        const options = prompt.options || [];
        return (
          <div className="card-picker-grid">
            {options.map((gid) => {
              const gen = lookups.generalsById[gid];
              return (
                <CardImage
                  key={gid}
                  src={gen?.image}
                  label={gen?.name}
                  text={gen?.text}
                  size="lg"
                  onClick={() => respond({ choice: gid })}
                />
              );
            })}
          </div>
        );
      }

      case 'chooseCards': {
        const source = prompt.context?.source === 'discard' ? state.discard || [] : me?.hand || [];
        const cards = (prompt.options || []).map((id) => source.find((c) => c.instanceId === id)).filter(Boolean);
        return (
          <CardPicker
            cards={cards}
            lookups={lookups}
            min={prompt.min ?? 0}
            max={prompt.max ?? 1}
            onConfirm={(ids) => respond({ choice: ids[0] || null, choices: ids })}
          />
        );
      }

      case 'chooseOption': {
        const options = prompt.options || [];
        return (
          <div className="row-actions">
            {options.map((opt) => (
              <button key={opt} className="btn secondary" onClick={() => respond({ choice: opt })}>
                {OPTION_LABELS[opt] || opt}
              </button>
            ))}
          </div>
        );
      }

      case 'chooseAttack': {
        const others = state.players.filter((p) => p.id !== myPlayerId && !p.eliminated);
        const ctxData = prompt.context || {};
        const myActiveGeneralId = me?.camp?.[me.marshalIndex]?.generalId;
        return (
          <AttackPickerModal
            others={others}
            myHand={me?.hand || []}
            myInfantry={me?.infantry || 0}
            anyCardFuel={!!ctxData.anyCardFuel}
            myActiveGeneralId={myActiveGeneralId}
            lookups={lookups}
            onConfirm={({ targetId, fuel, cardInstanceId }) => respond({ targetId, fuel, cardInstanceId })}
            onCancel={() => respond({ targetId: null })}
          />
        );
      }

      case 'reorderCards': {
        const ids = prompt.options || [];
        const cardIds = prompt.context?.cards || [];
        const items = ids.map((instanceId, i) => ({ instanceId, cardId: cardIds[i] }));
        return <ReorderPicker items={items} lookups={lookups} onConfirm={(order) => respond({ order })} />;
      }

      case 'revivalOffer': {
        const myOptions = (prompt.context?.options || []).filter((o) => o.playerId === myPlayerId);
        return (
          <div className="row-actions">
            {myOptions.map((o) => (
              <button key={o.method} className="btn secondary" onClick={() => respond({ method: o.method })}>
                {OPTION_LABELS[o.method] || o.method}
              </button>
            ))}
            <button className="btn ghost" onClick={() => respond({ skip: true })}>
              ข้าม
            </button>
          </div>
        );
      }

      default:
        return (
          <div className="row-actions">
            <button className="btn ghost" onClick={() => respond({ skip: true })}>
              ข้าม
            </button>
          </div>
        );
    }
  }
}

function ReorderPicker({ items, lookups, onConfirm }) {
  const [order, setOrder] = useState(items.map((it) => it.instanceId));

  function moveUp(idx) {
    if (idx === 0) return;
    const next = [...order];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setOrder(next);
  }
  function moveDown(idx) {
    if (idx === order.length - 1) return;
    const next = [...order];
    [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
    setOrder(next);
  }

  const byId = Object.fromEntries(items.map((it) => [it.instanceId, it]));

  return (
    <div className="reorder-picker">
      <p className="subtitle">อันดับแรก = บนสุดของกอง (จั่วก่อน)</p>
      <div className="reorder-list">
        {order.map((id, idx) => {
          const def = lookups.supplyById[byId[id]?.cardId];
          return (
            <div key={id} className="reorder-item">
              <span className="reorder-index">{idx + 1}</span>
              <CardImage src={def?.image} label={def?.name} size="sm" />
              <div className="reorder-buttons">
                <button className="btn ghost small" onClick={() => moveUp(idx)}>
                  ▲
                </button>
                <button className="btn ghost small" onClick={() => moveDown(idx)}>
                  ▼
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button className="btn primary" onClick={() => onConfirm(order)}>
        ยืนยันลำดับ
      </button>
    </div>
  );
}
