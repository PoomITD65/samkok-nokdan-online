import { hasActiveAbility, discardFromHand, log, broadcastState, alivePlayers } from './state.js';
import { promptOne, promptMany } from './prompts.js';
import { checkWinConditions } from './win.js';
import {
  fireOnAttacked,
  fireOnAttackSuccess,
  fireOnInfantryLostFromAttack,
  fireOnAnyInfantryLoss,
  fireOnAnyCardUse,
  continuousChecks
} from './abilities.js';
import { SUPPLY_BY_ID } from '../data/index.js';

export async function offerRevival(ctx, player) {
  const { room } = ctx;
  const eligible = [...room.players.values()].filter((p) => p.id !== player.id && !p.eliminated);
  const options = [];
  for (const p of eligible) {
    if (p.infantry >= 1) options.push({ playerId: p.id, method: 'infantry' });
    if (hasActiveAbility(p, 'g21') && p.hand.length >= 2) options.push({ playerId: p.id, method: 'nanhua' });
  }
  if (options.length === 0) return false;

  const eligibleIds = [...new Set(options.map((o) => o.playerId))];
  const result = await promptMany(
    ctx,
    eligibleIds,
    {
      kind: 'revivalOffer',
      firstResponseWins: true,
      messageTh: `${player.name} เสียทหารราบจนหมด! ใครต้องการช่วยฟื้นทหารราบให้ 1 คนหรือไม่?`,
      message: `${player.name} has lost all infantry! Does anyone want to revive them?`,
      context: { targetId: player.id, options }
    },
    30000
  );
  if (!result) return false;

  const { playerId, payload } = result;
  const rescuer = room.players.get(playerId);
  const method = payload?.method === 'nanhua' && hasActiveAbility(rescuer, 'g21') ? 'nanhua' : 'infantry';

  if (method === 'nanhua' && rescuer.hand.length >= 2) {
    const toDiscard = (payload.cardIds || []).slice(0, 2);
    for (const cid of toDiscard.length === 2 ? toDiscard : rescuer.hand.slice(0, 2).map((c) => c.instanceId)) {
      discardFromHand(room, rescuer, cid);
    }
    log(room, `${rescuer.name} ทิ้งการ์ด 2 ใบ (ความสามารถเซียนหนานหัว) เพื่อฟื้นทหารราบให้ ${player.name}`, `${rescuer.name} discarded 2 cards (Sage of Nanhua) to revive ${player.name}.`);
  } else if (rescuer.infantry >= 1) {
    rescuer.infantry -= 1;
    log(room, `${rescuer.name} ลดทหารราบตัวเอง 1 เพื่อฟื้นทหารราบให้ ${player.name}`, `${rescuer.name} spent 1 of their own infantry to revive ${player.name}.`);
  } else {
    return false;
  }
  player.infantry = 1;
  broadcastState(ctx);
  return true;
}

export async function loseInfantry(ctx, player, amount, { fromAttackBy = null } = {}) {
  const { room } = ctx;
  if (player.eliminated) return true;
  player.infantry = Math.max(0, player.infantry - amount);
  log(room, `${player.name} สูญเสียทหารราบ ${amount} คน (เหลือ ${player.infantry})`, `${player.name} lost ${amount} infantry (${player.infantry} remaining).`);
  broadcastState(ctx);

  if (fromAttackBy) {
    const attacker = room.players.get(fromAttackBy);
    if (attacker) await fireOnInfantryLostFromAttack(ctx, player, attacker);
  }
  await fireOnAnyInfantryLoss(ctx, player);

  if (player.infantry <= 0 && !player.eliminated) {
    const revived = await offerRevival(ctx, player);
    if (!revived) {
      await eliminatePlayer(ctx, player, { inCombatBy: fromAttackBy });
      return true;
    }
  }
  return false;
}

export async function eliminatePlayer(ctx, player, { inCombatBy = null } = {}) {
  const { room } = ctx;
  if (player.eliminated) return;
  player.eliminated = true;
  player.eliminatedInCombatBy = inCombatBy;
  player.roleRevealed = true;
  for (const c of player.hand) room.discard.push(c);
  player.hand = [];
  log(
    room,
    `${player.name} หมดทหารราบและออกจากเกม! (บทบาทที่แท้จริง: ${player.role || 'ไม่มี (โหมด 2 คน)'})`,
    `${player.name} is eliminated! (Revealed role: ${player.role || 'none (2-player mode)'})`
  );
  broadcastState(ctx);
  checkWinConditions(room);
  if (room.winner) broadcastState(ctx);
}

/**
 * fuel: 'card' (attacker discards an s_attack card, or any card if Sun Jian) | 'infantry' | 'free' (Dong Zhuo)
 */
export async function performAttack(ctx, attacker, target, fuel, cardInstanceId = null) {
  const { room } = ctx;
  if (attacker.id === target.id || attacker.eliminated || target.eliminated) return { success: false, error: 'invalid' };

  if (fuel === 'infantry') {
    if (continuousChecks.infantryAttackBlocked(ctx, target)) {
      return { success: false, error: 'blocked_infantry_attack' };
    }
    if (attacker.infantry < 1) return { success: false, error: 'no_infantry' };
    const eliminatedSelf = await loseInfantry(ctx, attacker, 1);
    await fireOnAnyCardUse(ctx, attacker); // Infantry is itself a "การ์ดทหารราบ" (Infantry card) per the rules.
    if (eliminatedSelf) return { success: false, error: 'attacker_eliminated' };
  } else if (fuel === 'card') {
    const card = attacker.hand.find((c) => c.instanceId === cardInstanceId);
    if (!card) return { success: false, error: 'no_card' };
    const isAttackCard = card.cardId === 's_attack';
    if (!isAttackCard && !continuousChecks.anyCardAsAttackFuel(ctx, attacker)) {
      return { success: false, error: 'invalid_card' };
    }
    discardFromHand(room, attacker, cardInstanceId);
    await fireOnAnyCardUse(ctx, attacker);

    if (isAttackCard) {
      const inciteHolders = alivePlayers(room).filter((p) => p.hand.some((c) => c.cardId === 't9_incite_army'));
      if (inciteHolders.length > 0) {
        const result = await promptMany(
          ctx,
          inciteHolders.map((p) => p.id),
          {
            kind: 'playInciteArmy',
            firstResponseWins: true,
            messageTh: `${attacker.name} เพิ่งลงการ์ดโจมตี — มีใครต้องการเล่น "ปลุกปั่นกองทัพ" เพื่อบังคับให้ลงการ์ดโจมตีใบที่สองหรือไม่?`,
            message: `${attacker.name} just played an Attack card — does anyone want to play "Incite the Army" to force a second Attack card?`
          },
          10000
        );
        if (result) {
          const player = room.players.get(result.playerId);
          const inciteCard = player.hand.find((c) => c.cardId === 't9_incite_army');
          if (inciteCard) {
            discardFromHand(room, player, inciteCard.instanceId);
            await fireOnAnyCardUse(ctx, player);
          }
          const secondCard = attacker.hand.find((c) => c.cardId === 's_attack');
          if (!secondCard) {
            log(room, `${attacker.name} ไม่มีการ์ดโจมตีใบที่สอง การโจมตีถูกยกเลิก! (ปลุกปั่นกองทัพ)`, `${attacker.name} had no second Attack card — the attack fizzles! (Incite the Army)`);
            broadcastState(ctx);
            return { success: false, error: 'incited_no_second_card' };
          }
          discardFromHand(room, attacker, secondCard.instanceId);
          log(room, `${attacker.name} ถูกบังคับให้ลงการ์ดโจมตีใบที่สองเพื่อโจมตีต่อ`, `${attacker.name} was forced to play a second Attack card to continue the attack.`);
          broadcastState(ctx);
        }
      }
    }
  } else if (fuel === 'free') {
    if (!continuousChecks.freeAttackAllowed(ctx, attacker, target)) {
      return { success: false, error: 'free_attack_not_allowed' };
    }
  }

  log(room, `${attacker.name} โจมตี ${target.name}!`, `${attacker.name} attacks ${target.name}!`);
  broadcastState(ctx);

  // Re-check "onAttacked" hooks against whoever currently holds the target
  // slot — a redirect (Diao Chan) can hand the attack to someone else who
  // has their OWN onAttacked ability (e.g. Luo Zhi's trick-as-defense), which
  // must still apply to them, not just to the original target.
  let finalTarget = target;
  let allowTrickAsDefense = false;
  for (let hop = 0; hop < 5; hop++) {
    const attackedResult = await fireOnAttacked(ctx, attacker, finalTarget);
    allowTrickAsDefense = !!attackedResult.allowTrickAsDefense;
    if (attackedResult.newTarget && attackedResult.newTarget.id !== finalTarget.id) {
      finalTarget = attackedResult.newTarget;
      continue;
    }
    break;
  }

  const defended = await resolveDefense(ctx, attacker, finalTarget, allowTrickAsDefense);

  if (defended) {
    log(room, `${finalTarget.name} ป้องกันการโจมตีสำเร็จ`, `${finalTarget.name} successfully defended!`);
    broadcastState(ctx);
    return { success: false };
  }

  await fireOnAttackSuccess(ctx, attacker, finalTarget, { fuel });
  const baseAmount = hasActiveAbility(attacker, 'g9') ? 2 : 1;
  const eliminated = await loseInfantry(ctx, finalTarget, baseAmount, { fromAttackBy: attacker.id });

  return { success: true, eliminated, targetId: finalTarget.id };
}

async function resolveDefense(ctx, attacker, target, allowTrickAsDefense, depth = 0) {
  const { room } = ctx;
  if (depth > 5) return false; // safety cap on ambush chains

  const validDefenseCards = target.hand.filter(
    (c) => c.cardId === 's_defense' || (allowTrickAsDefense && SUPPLY_BY_ID[c.cardId]?.type === 'trick')
  );
  let usedCardId = null;

  if (validDefenseCards.length > 0) {
    const response = await promptOne(ctx, target.id, {
      kind: 'chooseCards',
      messageTh: `คุณถูก ${attacker.name} โจมตี! เลือกการ์ดป้องกัน หรือข้ามเพื่อรับความเสียหาย`,
      message: `${attacker.name} is attacking you! Choose a defense card, or skip to take the hit.`,
      options: validDefenseCards.map((c) => c.instanceId),
      min: 0,
      max: 1
    }, 30000);
    const chosenId = response?.choice;
    if (chosenId && validDefenseCards.some((c) => c.instanceId === chosenId)) {
      const card = discardFromHand(room, target, chosenId);
      usedCardId = card?.cardId;
      await fireOnAnyCardUse(ctx, target);
    }
  }

  if (!usedCardId) return false; // no defense played -> attack succeeds

  // "Ambush" (t5) reactive window: anyone holding it may force a second defense.
  const ambushHolders = [...room.players.values()].filter(
    (p) => !p.eliminated && p.hand.some((c) => c.cardId === 't5_ambush')
  );
  if (ambushHolders.length > 0) {
    const result = await promptMany(
      ctx,
      ambushHolders.map((p) => p.id),
      {
        kind: 'playAmbush',
        firstResponseWins: true,
        messageTh: `${target.name} เพิ่งป้องกันสำเร็จ — มีใครต้องการเล่น "ลอบโจมตี" เพื่อยกเลิกการป้องกันนี้หรือไม่?`,
        message: `${target.name} just defended — does anyone want to play "Ambush" to cancel that defense?`
      },
      12000
    );
    if (result) {
      const player = room.players.get(result.playerId);
      const card = player.hand.find((c) => c.cardId === 't5_ambush');
      if (card) {
        discardFromHand(room, player, card.instanceId);
        log(room, `${player.name} เล่น "ลอบโจมตี" ยกเลิกการป้องกันของ ${target.name}!`, `${player.name} played "Ambush" — ${target.name} must defend again!`);
        broadcastState(ctx);
        await fireOnAnyCardUse(ctx, player);
        return resolveDefense(ctx, attacker, target, allowTrickAsDefense, depth + 1);
      }
    }
  }

  return true; // defended successfully
}
