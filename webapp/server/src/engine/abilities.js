import {
  activeGeneralId,
  viceGeneralIds,
  drawCards,
  discardFromHand,
  log,
  broadcastState,
  alivePlayers,
  ensureDeck,
  nextAlivePlayerId,
  removeCampEntry,
  MAX_VICE_MARSHALS
} from './state.js';
import { promptOne, promptMany } from './prompts.js';
import { GENERALS_BY_ID, SUPPLY_BY_ID } from '../data/index.js';
import { newId, shuffle, pick } from './util.js';

// NOTE: combat.js and this module reference each other (attack resolution needs
// ability hooks; some abilities need to inflict combat damage). This is a safe
// circular import in ESM because every usage below happens inside function
// bodies that run well after both modules have finished loading.
import { loseInfantry, performAttack } from './combat.js';

// ---------------------------------------------------------------------------
// Continuous / passive checks (icon: purple ∞) — no prompts, just rule queries.
// ---------------------------------------------------------------------------
export const continuousChecks = {
  freeAttackAllowed(ctx, attacker, target) {
    return activeGeneralId(attacker) === 'g11' && target.camp.length <= 2;
  },
  infantryAttackBlocked(ctx, target) {
    return activeGeneralId(target) === 'g18';
  },
  anyCardAsAttackFuel(ctx, attacker) {
    return activeGeneralId(attacker) === 'g2';
  },
  trickBlockedForTarget(ctx, target, sourcePlayer) {
    return activeGeneralId(target) === 'g5' && (!sourcePlayer || sourcePlayer.id !== target.id);
  }
};

// ---------------------------------------------------------------------------
// "onAttacked" — fires on the DEFENDER's active general, before defense is asked.
// May return { newTarget, allowTrickAsDefense }.
// ---------------------------------------------------------------------------
async function hook_g8_diaochan(ctx, attacker, defender) {
  const hasAttackCard = defender.hand.some((c) => c.cardId === 's_attack');
  const others = alivePlayers(ctx.room).filter((p) => p.id !== defender.id);
  if (!hasAttackCard || others.length === 0) return {};
  const res = await promptOne(ctx, defender.id, {
    kind: 'yesNo',
    messageTh: 'ใช้ความสามารถเตียวเสี้ยน? ทิ้งการ์ดโจมตี 1 ใบ เพื่อให้ผู้เล่นอื่นรับการโจมตีนี้แทนคุณ',
    message: 'Use Diao Chan\'s ability? Discard an Attack card to redirect this attack to another player.'
  }, 15000);
  if (!res?.yes) return {};
  const targetRes = await promptOne(ctx, defender.id, {
    kind: 'chooseTarget',
    messageTh: 'เลือกผู้เล่นที่จะรับการโจมตีแทนคุณ',
    message: 'Choose who receives the attack instead.',
    options: others.map((p) => p.id)
  }, 15000);
  const newTargetId = targetRes?.choice;
  if (!newTargetId) return {};
  const card = defender.hand.find((c) => c.cardId === 's_attack');
  discardFromHand(ctx.room, defender, card.instanceId);
  log(ctx.room, `${defender.name} ใช้ความสามารถเตียวเสี้ยน โยนการโจมตีไปให้ ${ctx.room.players.get(newTargetId).name}`, `${defender.name} redirected the attack using Diao Chan's ability.`);
  return { newTarget: ctx.room.players.get(newTargetId) };
}

function hook_g10_luozhi(ctx, attacker, defender) {
  return { allowTrickAsDefense: true };
}

const onAttackedHooks = { g8: hook_g8_diaochan, g10: hook_g10_luozhi };

export async function fireOnAttacked(ctx, attacker, defender) {
  const gid = activeGeneralId(defender);
  const hook = onAttackedHooks[gid];
  if (!hook) return {};
  try {
    return (await hook(ctx, attacker, defender)) || {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// "onAttackSuccess" — fires on the ATTACKER's active general after a successful hit
// (before infantry loss is applied to the target).
// ---------------------------------------------------------------------------
async function hook_g1_caocao(ctx, attacker) {
  const tricks = ctx.room.discard.filter((c) => SUPPLY_BY_ID[c.cardId]?.type === 'trick');
  if (tricks.length === 0) return;
  const res = await promptOne(ctx, attacker.id, {
    kind: 'chooseCards',
    messageTh: 'ความสามารถโจโฉ: เลือกการ์ดอุบาย 1 ใบจากกองใช้แล้วขึ้นมือ',
    message: 'Cao Cao: pick 1 trick card from the discard pile into your hand.',
    options: tricks.map((c) => c.instanceId),
    min: 0,
    max: 1,
    context: { source: 'discard' }
  }, 15000);
  const chosen = res?.choice;
  if (!chosen) return;
  const idx = ctx.room.discard.findIndex((c) => c.instanceId === chosen);
  if (idx === -1) return;
  const [card] = ctx.room.discard.splice(idx, 1);
  attacker.hand.push(card);
  log(ctx.room, `${attacker.name} ใช้ความสามารถโจโฉ นำการ์ดอุบายจากกองใช้แล้วขึ้นมือ`, `${attacker.name} used Cao Cao's ability to reclaim a trick card.`);
  broadcastState(ctx);
}

async function hook_g3_zhangliang(ctx, attacker, defender) {
  if (defender.hand.length === 0) return;
  const idx = Math.floor(Math.random() * defender.hand.length);
  const [card] = defender.hand.splice(idx, 1);
  attacker.hand.push(card);
  log(ctx.room, `${attacker.name} ใช้ความสามารถเตียวเหลียง สุ่มขโมยการ์ด 1 ใบจาก ${defender.name}`, `${attacker.name} randomly stole a card from ${defender.name} (Zhang Liang).`);
  broadcastState(ctx);
}

async function hook_g13_guanyu(ctx, attacker, defender) {
  const p = ctx.room.players.get(attacker.id);
  if (p.socketId) {
    ctx.io.to(p.socketId).emit('reveal:hand', {
      playerId: defender.id,
      playerName: defender.name,
      cards: defender.hand.map((c) => c.cardId)
    });
  }
  log(ctx.room, `${defender.name} ต้องเปิดมือให้ ${attacker.name} ดู (ความสามารถกวนอู)`, `${defender.name} reveals their hand to ${attacker.name} (Guan Yu).`);
  const atk = defender.hand.find((c) => c.cardId === 's_attack');
  if (atk) {
    discardFromHand(ctx.room, defender, atk.instanceId);
    log(ctx.room, `พบการ์ดโจมตีในมือ ${defender.name} ➜ ทิ้งการ์ดนั้นและเสียทหารราบเพิ่ม 1`, `An Attack card was found — it's discarded and ${defender.name} loses 1 more infantry.`);
    await loseInfantry(ctx, defender, 1, { fromAttackBy: attacker.id });
  }
}

async function hook_g14_zhangfei(ctx, attacker) {
  drawCards(ctx.room, attacker, 2);
  log(ctx.room, `${attacker.name} ใช้ความสามารถเตียวหุย จั่วการ์ด 2 ใบ`, `${attacker.name} drew 2 cards (Zhang Fei).`);
  broadcastState(ctx);
}

async function hook_g22_huangfusong(ctx, attacker, defender, meta) {
  if (meta?.fuel !== 'infantry') return;
  drawCards(ctx.room, attacker, 1);
  log(ctx.room, `${attacker.name} ใช้ความสามารถฮองฮูสง เสียทหารราบเพิ่ม 1 ให้ ${defender.name} และจั่วการ์ด 1 ใบ`, `${attacker.name} used Huangfu Song: ${defender.name} loses 1 more infantry and ${attacker.name} draws 1 card.`);
  await loseInfantry(ctx, defender, 1, { fromAttackBy: attacker.id });
  broadcastState(ctx);
}

async function hook_g23_zhaoyun(ctx, attacker) {
  if (ctx.room._zhaoYunUsedBy === attacker.id) return;
  const res = await promptOne(ctx, attacker.id, {
    kind: 'yesNo',
    messageTh: 'ใช้ความสามารถจูล่ง? โจมตีอีกครั้งได้ทันที (ใช้ได้ตาละ 1 ครั้ง)',
    message: 'Use Zhao Yun\'s ability? Attack again immediately (once per turn).'
  }, 15000);
  if (!res?.yes) return;
  ctx.room._zhaoYunUsedBy = attacker.id;
  const choice = await promptChooseAttackTargetAndFuel(ctx, attacker);
  if (!choice) return;
  const target = ctx.room.players.get(choice.targetId);
  if (target) await performAttack(ctx, attacker, target, choice.fuel, choice.cardInstanceId);
}

async function hook_g25_sunquan_success(ctx, attacker) {
  drawCards(ctx.room, attacker, 1);
  log(ctx.room, `${attacker.name} ใช้ความสามารถซุนกวน จั่วการ์ด 1 ใบ`, `${attacker.name} drew 1 card (Sun Quan).`);
  broadcastState(ctx);
}

const onAttackSuccessHooks = {
  g1: hook_g1_caocao,
  g3: hook_g3_zhangliang,
  g13: hook_g13_guanyu,
  g14: hook_g14_zhangfei,
  g22: hook_g22_huangfusong,
  g23: hook_g23_zhaoyun,
  g25: hook_g25_sunquan_success
};

export async function fireOnAttackSuccess(ctx, attacker, defender, meta = {}) {
  const gid = activeGeneralId(attacker);
  const hook = onAttackSuccessHooks[gid];
  if (!hook) return;
  try {
    await hook(ctx, attacker, defender, meta);
  } catch (e) {
    log(ctx.room, `เกิดข้อผิดพลาดกับความสามารถขุนพล: ${e.message}`, `General ability error: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// "onInfantryLostFromAttack" — fires on the DEFENDER's active general right after
// they lose infantry from a hostile attack.
// ---------------------------------------------------------------------------
async function hook_g15_xiahoudun(ctx, defender, attacker) {
  const atkCard = defender.hand.find((c) => c.cardId === 's_attack');
  const defCard = defender.hand.find((c) => c.cardId === 's_defense');
  if (!atkCard || !defCard) return;
  const res = await promptOne(ctx, defender.id, {
    kind: 'yesNo',
    messageTh: `ใช้ความสามารถแฮหัวต้น? ทิ้งการ์ดโจมตี+ป้องกันอย่างละ 1 ใบ เพื่อให้ ${attacker.name} เสียทหารราบ 2 คน`,
    message: `Use Xiahou Dun's ability? Discard 1 Attack + 1 Defense card to make ${attacker.name} lose 2 infantry.`
  }, 15000);
  if (!res?.yes) return;
  discardFromHand(ctx.room, defender, atkCard.instanceId);
  discardFromHand(ctx.room, defender, defCard.instanceId);
  log(ctx.room, `${defender.name} ใช้ความสามารถแฮหัวต้น ตอบโต้ ${attacker.name}!`, `${defender.name} retaliates with Xiahou Dun's ability!`);
  await loseInfantry(ctx, attacker, 2);
}

const onInfantryLostFromAttackHooks = { g15: hook_g15_xiahoudun };

export async function fireOnInfantryLostFromAttack(ctx, defender, attacker) {
  const gid = activeGeneralId(defender);
  const hook = onInfantryLostFromAttackHooks[gid];
  if (!hook) return;
  try {
    await hook(ctx, defender, attacker);
  } catch (e) {
    log(ctx.room, `เกิดข้อผิดพลาดกับความสามารถขุนพล: ${e.message}`, `General ability error: ${e.message}`);
  }
}

// Sun Quan's card says "when we lose infantry" with no qualifier — unlike
// Xiahou Dun's (which explicitly requires "attacked"), so it must fire for
// ANY infantry loss (combat, Clay Golem, Lightning Strike, spending it
// yourself, etc.), not just losses inflicted by an attacker.
async function hook_g25_sunquan_anyloss(ctx, player) {
  drawCards(ctx.room, player, 1);
  log(ctx.room, `${player.name} ใช้ความสามารถซุนกวน จั่วการ์ด 1 ใบ (เสียทหารราบ)`, `${player.name} drew 1 card (Sun Quan, triggered by losing infantry).`);
  broadcastState(ctx);
}

const onAnyInfantryLossHooks = { g25: hook_g25_sunquan_anyloss };

export async function fireOnAnyInfantryLoss(ctx, player) {
  const gid = activeGeneralId(player);
  const hook = onAnyInfantryLossHooks[gid];
  if (!hook) return;
  try {
    await hook(ctx, player);
  } catch (e) {
    log(ctx.room, `เกิดข้อผิดพลาดกับความสามารถขุนพล: ${e.message}`, `General ability error: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// "onAnyCardUse" — fires on every OTHER alive player's active general whenever
// a player plays an Attack / Defense / Trick card.
// ---------------------------------------------------------------------------
export async function fireOnAnyCardUse(ctx, actingPlayer) {
  const { room } = ctx;
  const watchers = alivePlayers(room).filter((p) => p.id !== actingPlayer.id && activeGeneralId(p) === 'g6');
  for (const watcher of watchers) {
    const atkCard = watcher.hand.find((c) => c.cardId === 's_attack');
    if (!atkCard || actingPlayer.eliminated) continue;
    const res = await promptOne(ctx, watcher.id, {
      kind: 'yesNo',
      messageTh: `ใช้ความสามารถม้าอ้วนยี่? ทิ้งการ์ดโจมตี 1 ใบ เพื่อให้ ${actingPlayer.name} เสียทหารราบ 1 คน`,
      message: `Use Ma Wan-yi's ability? Discard an Attack card to make ${actingPlayer.name} lose 1 infantry.`
    }, 10000);
    if (res?.yes) {
      const card = watcher.hand.find((c) => c.cardId === 's_attack');
      if (card) {
        discardFromHand(room, watcher, card.instanceId);
        log(room, `${watcher.name} ใช้ความสามารถม้าอ้วนยี่ ลงโทษ ${actingPlayer.name}`, `${watcher.name} punished ${actingPlayer.name} with Ma Wan-yi's ability.`);
        await loseInfantry(ctx, actingPlayer, 1);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Turn-start / turn-end hooks
// ---------------------------------------------------------------------------
export async function fireOnTurnStart(ctx, player) {
  const { room } = ctx;
  if (activeGeneralId(player) === 'g16') {
    ensureDeck(room);
    const top2 = [];
    if (room.deck.length) top2.push(room.deck.pop());
    ensureDeck(room);
    if (room.deck.length) top2.push(room.deck.pop());
    if (top2.length === 0) return false;
    if (top2.length === 1) {
      player.hand.push(top2[0]);
      log(room, `${player.name} ใช้ความสามารถชุนยก จั่วการ์ด 1 ใบ (เหลือใบเดียวในกอง)`, `${player.name} used Xun You's ability (only 1 card was left).`);
      return true;
    }
    const res = await promptOne(ctx, player.id, {
      kind: 'chooseCards',
      messageTh: 'ความสามารถชุนยก: เลือก 1 ใบขึ้นมือ อีกใบไปไว้ก้นกองเสบียง',
      message: 'Xun You: choose 1 of these 2 cards to keep, the other goes to the bottom of the deck.',
      options: top2.map((c) => c.instanceId),
      min: 1,
      max: 1,
      context: { source: 'inline', cards: top2.map((c) => c.cardId) }
    }, 20000);
    const chosenId = res?.choice || top2[0].instanceId;
    const chosen = top2.find((c) => c.instanceId === chosenId) || top2[0];
    const other = top2.find((c) => c.instanceId !== chosen.instanceId);
    player.hand.push(chosen);
    if (other) room.deck.unshift(other);
    log(room, `${player.name} ใช้ความสามารถชุนยกแทนการจั่วปกติ`, `${player.name} used Xun You's ability instead of the normal draw.`);
    return true; // handled the draw itself
  }
  return false;
}

export async function fireOnTurnEndNoAction(ctx, player) {
  if (activeGeneralId(player) === 'g19' && ctx.room.turnActionsUsed.length === 0) {
    drawCards(ctx.room, player, 2);
    log(ctx.room, `${player.name} ใช้ความสามารถชุนฮิว (ไม่ได้ทำอะไรในตานี้) จั่วการ์ด 2 ใบ`, `${player.name} did nothing this turn — Xun Yu draws 2 cards.`);
  }
}

// ---------------------------------------------------------------------------
// Shared action implementations (used by both the base action slots AND by
// "action"-icon general abilities that duplicate a base action).
// ---------------------------------------------------------------------------
export async function performRecruit(ctx, player, opts = {}) {
  const { room } = ctx;
  if (player.hand.length < 3) return { ok: false, reason: 'not_enough_cards' };
  const res = await promptOne(ctx, player.id, {
    kind: 'chooseCards',
    messageTh: 'เลือกการ์ด 3 ใบเพื่อทิ้ง (จ้างขุนพล)',
    message: 'Choose 3 cards to discard to recruit a General.',
    options: player.hand.map((c) => c.instanceId),
    min: 3,
    max: 3,
    cancellable: true
  }, 25000);
  const chosen = res?.cancel ? [] : res?.choices || [];
  if (chosen.length !== 3) return { ok: false, reason: 'cancelled' };
  for (const id of chosen) discardFromHand(room, player, id);

  if (room.generalPool.length === 0) {
    log(room, `${player.name} ทิ้งการ์ด 3 ใบ แต่กองขุนพลว่างเปล่า`, `${player.name} discarded 3 cards, but the general pool is empty.`);
    broadcastState(ctx);
    return { ok: false, reason: 'empty_pool' };
  }

  let chosenGeneral;
  if (opts.openPool) {
    // Liu Bei's own card text has no "random draw of 5" qualifier (unlike the
    // base action) — he gets to hand-pick anyone from the whole pool.
    const candidatePool = room.generalPool.slice();
    const pickRes = await promptOne(ctx, player.id, {
      kind: 'chooseGeneral',
      messageTh: 'ความสามารถเล่าปี่: เลือกขุนพลคนใดก็ได้จากกองขุนพลทั้งหมด เพื่อเข้าค่ายของคุณ',
      message: "Liu Bei's ability: choose ANY general from the whole pool to join your camp.",
      options: candidatePool
    }, 30000);
    chosenGeneral = pickRes?.choice && candidatePool.includes(pickRes.choice) ? pickRes.choice : candidatePool[0];
    room.generalPool = room.generalPool.filter((g) => g !== chosenGeneral);
  } else {
    const draw = pick(room.generalPool, Math.min(5, room.generalPool.length));
    const pickRes = await promptOne(ctx, player.id, {
      kind: 'chooseGeneral',
      messageTh: 'เลือกขุนพล 1 คนจาก 5 คนนี้ เพื่อเข้าค่ายของคุณ',
      message: 'Choose 1 of these 5 Generals to join your camp.',
      options: draw
    }, 25000);
    chosenGeneral = pickRes?.choice && draw.includes(pickRes.choice) ? pickRes.choice : draw[0];

    const remainingPool = room.generalPool.filter((g) => !draw.includes(g));
    room.generalPool = shuffle(remainingPool.concat(draw.filter((g) => g !== chosenGeneral)));
  }

  const newIndex = player.camp.length;
  player.camp.push({ instanceId: newId('gen'), generalId: chosenGeneral });

  if (player.viceMarshalIndices.length < MAX_VICE_MARSHALS) {
    player.viceMarshalIndices.push(newIndex);
  } else {
    const replaceRes = await promptOne(ctx, player.id, {
      kind: 'chooseOption',
      messageTh: `รองแม่ทัพเต็มแล้ว (สูงสุด ${MAX_VICE_MARSHALS} คน) — ตั้ง ${GENERALS_BY_ID[chosenGeneral]?.name} แทนคนเดิมคนไหน หรือเก็บไว้ในค่ายเฉยๆ?`,
      message: `Vice-Marshal slots are full (max ${MAX_VICE_MARSHALS}) — replace which one with ${GENERALS_BY_ID[chosenGeneral]?.nameEn || chosenGeneral}, or keep them as reserve?`,
      options: [...player.viceMarshalIndices.map((idx) => player.camp[idx].generalId), 'keep_as_reserve']
    }, 15000);
    const choice = replaceRes?.choice;
    if (choice && choice !== 'keep_as_reserve') {
      const replaceIdx = player.viceMarshalIndices.find((idx) => player.camp[idx].generalId === choice);
      if (replaceIdx !== undefined) {
        player.viceMarshalIndices = player.viceMarshalIndices.map((idx) => (idx === replaceIdx ? newIndex : idx));
      }
    }
  }

  log(room, `${player.name} จ้างขุนพล ${GENERALS_BY_ID[chosenGeneral]?.name} เข้าค่าย`, `${player.name} recruited ${GENERALS_BY_ID[chosenGeneral]?.nameEn || chosenGeneral} into their camp.`);
  broadcastState(ctx);
  return { ok: true };
}

export async function performInfantryDraw(ctx, player) {
  if (player.infantry < 1) return { ok: false, reason: 'no_infantry' };
  const eliminated = await loseInfantry(ctx, player, 1);
  await fireOnAnyCardUse(ctx, player); // Infantry is itself a "การ์ดทหารราบ" (Infantry card) per the rules.
  if (eliminated) return { ok: true, eliminated: true };
  drawCards(ctx.room, player, 2);
  log(ctx.room, `${player.name} เสียทหารราบ 1 เพื่อจั่วการ์ด 2 ใบ`, `${player.name} spent 1 infantry to draw 2 cards.`);
  broadcastState(ctx);
  return { ok: true };
}

export async function promptChooseAttackTargetAndFuel(ctx, attacker) {
  const { room } = ctx;
  const others = alivePlayers(room).filter((p) => p.id !== attacker.id);
  if (others.length === 0) return null;
  const res = await promptOne(ctx, attacker.id, {
    kind: 'chooseAttack',
    messageTh: 'เลือกเป้าหมายและวิธีโจมตี',
    message: 'Choose a target and how to fuel the attack.',
    options: others.map((p) => p.id),
    context: {
      hasAttackCards: attacker.hand.filter((c) => c.cardId === 's_attack').map((c) => c.instanceId),
      anyCardFuel: continuousChecks.anyCardAsAttackFuel(ctx, attacker),
      handCardIds: attacker.hand.map((c) => c.instanceId),
      infantry: attacker.infantry
    }
  }, 20000);
  if (!res?.targetId) return null;
  return { targetId: res.targetId, fuel: res.fuel, cardInstanceId: res.cardInstanceId || null };
}

// ---------------------------------------------------------------------------
// "action"-icon general abilities, used via the general_ability action slot.
// ---------------------------------------------------------------------------
export async function performGeneralAbilityAction(ctx, player, opts = {}) {
  const gid = opts.asGeneralId || activeGeneralId(player);
  switch (gid) {
    case 'g7':
      return performRecruit(ctx, player, { openPool: true });
    case 'g12':
      return performInfantryDraw(ctx, player);
    case 'g17':
      return abilityDemandCard(ctx, player);
    case 'g20':
      return abilityPeekTop3(ctx, player);
    case 'g24':
      return abilitySearchTaiping(ctx, player);
    case 'g4':
      return abilityBorrowViceAbility(ctx, player);
    default:
      return { ok: false, reason: 'no_action_ability' };
  }
}

async function abilityDemandCard(ctx, player) {
  const { room } = ctx;
  const others = alivePlayers(room).filter((p) => p.id !== player.id);
  if (others.length === 0) return { ok: false };
  const targetRes = await promptOne(ctx, player.id, {
    kind: 'chooseTarget',
    messageTh: 'เลือกผู้เล่นที่จะขอการ์ด 1 ใบ',
    message: 'Choose a player to demand a card from.',
    options: others.map((p) => p.id),
    cancellable: true
  }, 15000);
  const target = room.players.get(targetRes?.choice);
  if (!target) return { ok: false, reason: 'cancelled' };

  let gave = false;
  if (target.hand.length > 0) {
    const giveRes = await promptOne(ctx, target.id, {
      kind: 'chooseCards',
      messageTh: `${player.name} ขอการ์ด 1 ใบจากคุณ (ตั๊กอิ๋ว) เลือกใบที่จะให้ หรือข้ามเพื่อปฏิเสธ`,
      message: `${player.name} demands a card from you (Tuo Yiu). Choose one to give, or skip to refuse.`,
      options: target.hand.map((c) => c.instanceId),
      min: 0,
      max: 1
    }, 15000);
    const cardId = giveRes?.choice;
    if (cardId) {
      const idx = target.hand.findIndex((c) => c.instanceId === cardId);
      if (idx !== -1) {
        const [card] = target.hand.splice(idx, 1);
        player.hand.push(card);
        gave = true;
      }
    }
  }

  if (!gave) {
    const punishOptions = target.viceMarshalIndices.length > 0 ? ['infantry', 'demote_vice'] : ['infantry'];
    const punishRes = await promptOne(ctx, player.id, {
      kind: 'chooseOption',
      messageTh: `${target.name} ไม่ให้การ์ด! เลือกบทลงโทษ`,
      message: `${target.name} refused! Choose a punishment.`,
      options: punishOptions
    }, 15000);
    if (punishRes?.choice === 'demote_vice' && target.viceMarshalIndices.length > 0) {
      let demoteIdx = target.viceMarshalIndices[0];
      if (target.viceMarshalIndices.length > 1) {
        const pickRes = await promptOne(ctx, player.id, {
          kind: 'chooseGeneral',
          messageTh: `เลือกรองแม่ทัพของ ${target.name} ที่จะปลด`,
          message: `Choose which of ${target.name}'s Vice-Marshals to demote.`,
          options: target.viceMarshalIndices.map((idx) => target.camp[idx].generalId)
        }, 15000);
        const match = target.viceMarshalIndices.find((idx) => target.camp[idx].generalId === pickRes?.choice);
        if (match !== undefined) demoteIdx = match;
      }
      const gone = removeCampEntry(target, demoteIdx);
      room.generalPool.push(gone.generalId);
      room.generalPool = shuffle(room.generalPool);
      log(room, `${target.name} ถูกนำรองแม่ทัพกลับกองขุนพล (ความสามารถตั๊กอิ๋ว)`, `${target.name}'s Vice-Marshal was returned to the general pool (Tuo Yiu).`);
    } else {
      await loseInfantry(ctx, target, 1);
    }
  } else {
    log(room, `${target.name} มอบการ์ดให้ ${player.name} ตามคำขอ`, `${target.name} handed over a card as demanded.`);
  }
  broadcastState(ctx);
  return { ok: true };
}

async function abilityPeekTop3(ctx, player) {
  const { room } = ctx;
  ensureDeck(room);
  const top = [];
  for (let i = 0; i < 3 && room.deck.length; i++) {
    ensureDeck(room);
    if (room.deck.length) top.push(room.deck.pop());
  }
  if (top.length === 0) return { ok: false };
  const res = await promptOne(ctx, player.id, {
    kind: 'reorderCards',
    messageTh: 'ความสามารถเขาเฉียว: ดูการ์ด 3 ใบบนสุด แล้วจัดเรียงใหม่ก่อนวางกลับ',
    message: 'Khao Qiao: peek at the top 3 cards and reorder them before placing them back.',
    options: top.map((c) => c.instanceId),
    context: { cards: top.map((c) => c.cardId) }
  }, 25000);
  let order = res?.order && Array.isArray(res.order) ? res.order : top.map((c) => c.instanceId);
  const byId = Object.fromEntries(top.map((c) => [c.instanceId, c]));
  order = order.filter((id) => byId[id]);
  for (const id of top.map((c) => c.instanceId)) if (!order.includes(id)) order.push(id);
  // The deck is drawn via pop() (last element = top of deck / drawn first), so
  // order[0] ("rank 1 / top of deck" per the UI) must be pushed LAST.
  for (const id of [...order].reverse()) room.deck.push(byId[id]);
  log(room, `${player.name} ใช้ความสามารถเขาเฉียว จัดเรียงการ์ดบนสุดของกองเสบียงใหม่`, `${player.name} peeked and reordered the top of the deck (Khao Qiao).`);
  broadcastState(ctx);
  return { ok: true };
}

async function abilitySearchTaiping(ctx, player) {
  const { room } = ctx;
  // Card text has no "if you have one" qualifier — returning a trick card is
  // the mandatory cost of this ability, not an optional step. No trick card
  // in hand means the ability simply can't be used.
  const tricksInHand = player.hand.filter((c) => SUPPLY_BY_ID[c.cardId]?.type === 'trick');
  if (tricksInHand.length === 0) return { ok: false, reason: 'no_trick_to_return' };

  const res = await promptOne(ctx, player.id, {
    kind: 'chooseCards',
    messageTh: 'ความสามารถเตียวก๊ก: เลือกการ์ดอุบาย 1 ใบจากมือ นำกลับเข้ากองเสบียง (จำเป็นต้องเลือก)',
    message: 'Zhang Jiao: choose 1 trick card from your hand to return to the deck (required).',
    options: tricksInHand.map((c) => c.instanceId),
    min: 1,
    max: 1,
    cancellable: true
  }, 15000);
  if (res?.cancel) return { ok: false, reason: 'cancelled' };
  const cardId = res?.choice;
  if (!cardId) return { ok: false, reason: 'cancelled' };
  const idx = player.hand.findIndex((c) => c.instanceId === cardId);
  const [card] = player.hand.splice(idx, 1);
  room.deck.unshift(card);

  const matches = room.deck.filter((c) => SUPPLY_BY_ID[c.cardId]?.tag === 'taiping');
  if (matches.length === 0) {
    log(room, `${player.name} ใช้ความสามารถเตียวก๊ก แต่ไม่พบการ์ดไท่ผิงในกองเสบียง`, `${player.name} used Zhang Jiao's ability, but no Taiping card was found in the deck.`);
    broadcastState(ctx);
    return { ok: false };
  }

  let foundInstanceId = matches[0].instanceId;
  if (matches.length > 1) {
    // The card text says "เลือก" (CHOOSE) — if more than one Taiping card is
    // in the deck, the player picks which one, it isn't auto-selected.
    const pickRes = await promptOne(ctx, player.id, {
      kind: 'chooseCards',
      messageTh: `ความสามารถเตียวก๊ก: พบการ์ดไท่ผิง ${matches.length} ใบในกองเสบียง เลือก 1 ใบ`,
      message: `Zhang Jiao: found ${matches.length} Taiping cards in the deck — choose 1.`,
      options: matches.map((c) => c.instanceId),
      min: 1,
      max: 1,
      context: { source: 'inline', cards: matches.map((c) => c.cardId) }
    }, 20000);
    if (pickRes?.choice && matches.some((c) => c.instanceId === pickRes.choice)) {
      foundInstanceId = pickRes.choice;
    }
  }
  const idx2 = room.deck.findIndex((c) => c.instanceId === foundInstanceId);
  const [foundCard] = room.deck.splice(idx2, 1);
  player.hand.push(foundCard);
  log(room, `${player.name} ใช้ความสามารถเตียวก๊ก ค้นหาการ์ดไท่ผิงขึ้นมือ`, `${player.name} searched the deck for a Taiping card (Zhang Jiao).`);
  broadcastState(ctx);
  return { ok: true };
}

async function abilityBorrowViceAbility(ctx, player) {
  const candidates = viceGeneralIds(player)
    .filter((gid) => gid !== 'g4')
    .map((gid) => GENERALS_BY_ID[gid])
    .filter((gen) => gen && gen.actionSlotEligible);

  if (candidates.length === 0) return { ok: false, reason: 'no_valid_vice' };

  let chosen = candidates[0];
  if (candidates.length > 1) {
    const res = await promptOne(ctx, player.id, {
      kind: 'chooseGeneral',
      messageTh: 'ความสามารถโยจิ๋น: เลือกความสามารถของรองแม่ทัพที่จะยืมใช้',
      message: "He Jin: choose which Vice-Marshal's ability to borrow.",
      options: candidates.map((gen) => gen.id),
      cancellable: true
    }, 15000);
    if (res?.cancel) return { ok: false, reason: 'cancelled' };
    chosen = candidates.find((gen) => gen.id === res?.choice) || chosen;
  }

  log(ctx.room, `${player.name} ใช้ความสามารถโยจิ๋น ยืมความสามารถของ ${chosen.name} (รองแม่ทัพ)`, `${player.name} used He Jin's ability to borrow ${chosen.nameEn || chosen.name}'s ability.`);
  return performGeneralAbilityAction(ctx, player, { asGeneralId: chosen.id });
}

export function isActionAbilityAvailable(player) {
  const gid = activeGeneralId(player);
  const gen = gid && GENERALS_BY_ID[gid];
  return !!gen && !!gen.actionSlotEligible;
}
