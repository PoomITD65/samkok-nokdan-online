import React, { useState } from 'react';
import { emitAsync } from '../socket.js';
import CardPicker from './CardPicker.jsx';
import AttackPickerModal from './AttackPickerModal.jsx';
import { REACTIVE_ONLY_TRICKS } from '../constants.js';

const ACTION_LABELS = {
  attack: { label: '⚔️ โจมตี', desc: 'โจมตีผู้เล่นด้วยการ์ดโจมตี/ทหารราบ' },
  trick: { label: '🎴 ใช้อุบาย', desc: 'เล่นการ์ดอุบาย 1 ใบจากมือ' },
  recruit: { label: '🤝 จ้างขุนพล', desc: 'ทิ้งการ์ด 3 ใบ สุ่มเลือกขุนพล 1 จาก 5' },
  general_ability: { label: '✨ ใช้ความสามารถ', desc: 'ใช้ความสามารถขุนพลแม่ทัพของคุณ' },
  swap: { label: '🔄 สลับแม่ทัพ', desc: 'สลับตำแหน่งแม่ทัพ-รองแม่ทัพ' },
  infantry_draw: { label: '🪖➜🃏 แลกจั่วการ์ด', desc: 'เสียทหารราบ 1 คน เพื่อจั่วการ์ด 2 ใบ' }
};

export default function ActionBar({ state, me, lookups, isMyTurn }) {
  const [open, setOpen] = useState(null); // 'attack' | 'trick' | null
  const [busy, setBusy] = useState(false);

  if (!isMyTurn) {
    return <div className="action-bar disabled-bar">รอตาของผู้เล่นอื่น...</div>;
  }

  const used = state.turnActionsUsed || [];
  const slotsLeft = 2 - used.length;
  const myActiveGeneralId = me.camp?.[me.marshalIndex]?.generalId;
  const activeGen = lookups.generalsById[myActiveGeneralId];
  const generalAbilityAvailable = !!activeGen?.actionSlotEligible;

  const canUse = (type) => slotsLeft > 0 && !used.includes(type);

  async function doAction(actionType, payload) {
    setBusy(true);
    const res = await emitAsync('game:action', { actionType, payload });
    setBusy(false);
    setOpen(null);
    return res;
  }

  async function doEndTurn() {
    setBusy(true);
    await emitAsync('game:endTurn', {});
    setBusy(false);
  }

  const others = state.players.filter((p) => p.id !== me.id && !p.eliminated);
  const trickCards = (me.hand || []).filter((c) => {
    const def = lookups.supplyById[c.cardId];
    return def?.type === 'trick' && !REACTIVE_ONLY_TRICKS.has(c.cardId);
  });

  return (
    <div className="action-bar">
      <div className="action-bar-header">
        ตาของคุณ — ใช้ได้อีก {slotsLeft} การกระทำ (จากทั้งหมด 2, ห้ามซ้ำประเภท)
      </div>
      <div className="action-buttons">
        <button className="btn action" disabled={busy || !canUse('attack') || others.length === 0} onClick={() => setOpen('attack')}>
          {ACTION_LABELS.attack.label}
        </button>
        <button className="btn action" disabled={busy || !canUse('trick') || trickCards.length === 0} onClick={() => setOpen('trick')}>
          {ACTION_LABELS.trick.label}
        </button>
        <button className="btn action" disabled={busy || !canUse('recruit') || me.hand.length < 3} onClick={() => doAction('recruit')}>
          {ACTION_LABELS.recruit.label}
        </button>
        <button
          className="btn action"
          disabled={busy || !canUse('general_ability') || !generalAbilityAvailable}
          onClick={() => doAction('general_ability')}
          title={generalAbilityAvailable ? activeGen.textEn : 'ขุนพลแม่ทัพของคุณไม่มีความสามารถประเภทกระทำ'}
        >
          {ACTION_LABELS.general_ability.label}
        </button>
        <button className="btn action" disabled={busy || !canUse('swap') || !(me.viceMarshalIndices?.length > 0)} onClick={() => doAction('swap')}>
          {ACTION_LABELS.swap.label}
        </button>
        <button className="btn action" disabled={busy || !canUse('infantry_draw') || me.infantry < 1} onClick={() => doAction('infantry_draw')}>
          {ACTION_LABELS.infantry_draw.label}
        </button>
      </div>
      <button className="btn primary end-turn-btn" disabled={busy} onClick={doEndTurn}>
        จบตา ➜
      </button>

      {open === 'attack' && (
        <div className="modal-overlay">
          <div className="modal-panel">
            <AttackPickerModal
              others={others}
              myHand={me.hand || []}
              myInfantry={me.infantry}
              anyCardFuel={myActiveGeneralId === 'g2'}
              myActiveGeneralId={myActiveGeneralId}
              lookups={lookups}
              onConfirm={({ targetId, fuel, cardInstanceId }) => doAction('attack', { targetId, fuel, cardInstanceId })}
              onCancel={() => setOpen(null)}
            />
          </div>
        </div>
      )}

      {open === 'trick' && (
        <div className="modal-overlay">
          <div className="modal-panel">
            <h3>เลือกการ์ดอุบายที่จะเล่น</h3>
            <CardPicker
              cards={trickCards}
              lookups={lookups}
              min={1}
              max={1}
              onConfirm={(ids) => ids[0] && doAction('trick', { cardInstanceId: ids[0] })}
              onCancel={() => setOpen(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
