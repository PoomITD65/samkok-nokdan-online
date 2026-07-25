import { alivePlayers, discardFromHand, removeFromHand, drawCards, log, broadcastState, ensureDeck } from './state.js';
import { promptOne, promptMany } from './prompts.js';
import { loseInfantry, performAttack } from './combat.js';
import { continuousChecks, fireOnAnyCardUse } from './abilities.js';
import { SUPPLY_BY_ID } from '../data/index.js';
import { newId } from './util.js';

// Trick cards whose printed condition is a *reaction to something else happening*
// rather than a proactive play — they are only usable via the dedicated reactive
// windows opened elsewhere (combat.js for ambush/incite-army, playTrick() below
// for counter-scheme). Selecting them as your own turn's "play a trick" action
// has nothing to trigger, so it's rejected there.
export const REACTIVE_ONLY_TRICKS = new Set(['t1_counter_trick', 't5_ambush', 't9_incite_army']);

/** Opens the "ซ้อนกลข้าศึก" (Counter-Scheme) window for a trick about to resolve. Returns true if negated. */
export async function offerCounterTrick(ctx, aboutToResolveCardId) {
  const { room } = ctx;
  const holders = alivePlayers(room).filter((p) => p.hand.some((c) => c.cardId === 't1_counter_trick'));
  if (holders.length === 0) return false;
  const result = await promptMany(
    ctx,
    holders.map((p) => p.id),
    {
      kind: 'playCounterTrick',
      firstResponseWins: true,
      messageTh: `มีการ์ดอุบาย (${SUPPLY_BY_ID[aboutToResolveCardId]?.name}) กำลังจะทำงาน — ใครต้องการเล่น "ซ้อนกลข้าศึก" เพื่อยกเลิกหรือไม่?`,
      message: `A trick card (${SUPPLY_BY_ID[aboutToResolveCardId]?.nameEn}) is about to resolve — does anyone want to play "Counter-Scheme" to negate it?`
    },
    10000
  );
  if (!result) return false;
  const player = room.players.get(result.playerId);
  const card = player.hand.find((c) => c.cardId === 't1_counter_trick');
  if (!card) return false;
  discardFromHand(room, player, card.instanceId);
  log(room, `${player.name} เล่น "ซ้อนกลข้าศึก" ยกเลิกการ์ดอุบายนั้น!`, `${player.name} played "Counter-Scheme" — the trick card is negated!`);
  broadcastState(ctx);
  return true;
}

function blockedByImmunity(ctx, target, actingPlayer) {
  if (continuousChecks.trickBlockedForTarget(ctx, target, actingPlayer)) {
    log(ctx.room, `${target.name} มีภูมิคุ้มกัน (ง่อฮูหยิน) การ์ดอุบายนี้ไม่มีผลกับเขา`, `${target.name} is immune (Lady Wu) — this trick has no effect on them.`);
    return true;
  }
  return false;
}

async function effect_t2_restore(ctx, player) {
  const targets = alivePlayers(ctx.room);
  const res = await promptOne(ctx, player.id, {
    kind: 'chooseTarget',
    messageTh: 'เลือกผู้เล่นที่จะฟื้นทหารราบให้ 2 คน',
    message: 'Choose a player to restore 2 infantry to.',
    options: targets.map((p) => p.id)
  }, 15000);
  const target = ctx.room.players.get(res?.choice);
  if (!target) return;
  if (blockedByImmunity(ctx, target, player)) return;
  target.infantry += 2;
  log(ctx.room, `${player.name} ฟื้นทหารราบ 2 คนให้ ${target.name}`, `${player.name} restored 2 infantry to ${target.name}.`);
  broadcastState(ctx);
}

async function effect_t3_clay_golem(ctx, player, cardInstanceId, cardId) {
  ctx.room.continuousTricks.push({ instanceId: cardInstanceId, cardId, ownerPlayerId: player.id });
  log(ctx.room, `${player.name} วางการ์ด "ไท่ผิงหุ่นดิน" ต่อเนื่องในสนาม`, `${player.name} placed "Taiping Clay Golem" as a continuous effect on the table.`);
  broadcastState(ctx);
}

async function effect_t4_incite_rebellion(ctx, player) {
  const others = alivePlayers(ctx.room).filter((p) => p.id !== player.id);
  if (others.length === 0) return;
  const orderedRes = await promptOne(ctx, player.id, {
    kind: 'chooseTarget',
    messageTh: 'เลือกผู้เล่นที่จะถูกสั่งให้โจมตี',
    message: 'Choose the player who will be ordered to attack.',
    options: others.map((p) => p.id)
  }, 15000);
  const ordered = ctx.room.players.get(orderedRes?.choice);
  if (!ordered) return;
  if (blockedByImmunity(ctx, ordered, player)) return;

  const victimOptions = alivePlayers(ctx.room).filter((p) => p.id !== ordered.id);
  const victimRes = await promptOne(ctx, player.id, {
    kind: 'chooseTarget',
    messageTh: `เลือกผู้เล่นที่ ${ordered.name} จะต้องโจมตี`,
    message: `Choose who ${ordered.name} must attack.`,
    options: victimOptions.map((p) => p.id)
  }, 15000);
  const victim = ctx.room.players.get(victimRes?.choice);
  if (!victim) return;

  const hasAttackCard = ordered.hand.some((c) => c.cardId === 's_attack');
  const canUseInfantry = ordered.infantry >= 1 && !continuousChecks.infantryAttackBlocked(ctx, victim);
  if (!hasAttackCard && !canUseInfantry) {
    log(ctx.room, `${ordered.name} ถูกสั่งให้โจมตี ${victim.name} แต่ไม่มีวิธีโจมตี จึงข้ามไป`, `${ordered.name} was ordered to attack ${victim.name} but has no way to do so — skipped.`);
    broadcastState(ctx);
    return;
  }
  let fuel = 'card';
  let cardInstanceId = null;
  if (hasAttackCard && canUseInfantry) {
    const fuelRes = await promptOne(ctx, ordered.id, {
      kind: 'chooseOption',
      messageTh: `คุณถูกสั่งให้โจมตี ${victim.name}! เลือกวิธีโจมตี`,
      message: `You are ordered to attack ${victim.name}! Choose how.`,
      options: ['card', 'infantry']
    }, 15000);
    fuel = fuelRes?.choice === 'infantry' ? 'infantry' : 'card';
  } else {
    fuel = hasAttackCard ? 'card' : 'infantry';
  }
  if (fuel === 'card') cardInstanceId = ordered.hand.find((c) => c.cardId === 's_attack')?.instanceId;
  log(ctx.room, `${player.name} สั่งให้ ${ordered.name} โจมตี ${victim.name}!`, `${player.name} incited ${ordered.name} to attack ${victim.name}!`);
  await performAttack(ctx, ordered, victim, fuel, cardInstanceId);
}

async function effect_t6_lightning(ctx, player) {
  const others = alivePlayers(ctx.room).filter((p) => p.id !== player.id);
  await Promise.all(
    others.map(async (target) => {
      if (blockedByImmunity(ctx, target, player)) return;
      const validCards = target.hand.filter((c) => {
        const def = SUPPLY_BY_ID[c.cardId];
        return def && (def.type === 'trick' || def.type === 'defense');
      });
      if (validCards.length === 0) {
        await loseInfantry(ctx, target, 1);
        return;
      }
      const res = await promptOne(ctx, target.id, {
        kind: 'chooseCards',
        messageTh: `${player.name} เล่น "สายฟ้าฟาด"! เลือกการ์ดอุบายหรือป้องกัน 1 ใบเพื่อทิ้ง มิฉะนั้นเสียทหารราบ 1`,
        message: `${player.name} played "Lightning Strike"! Discard a trick or defense card, or lose 1 infantry.`,
        options: validCards.map((c) => c.instanceId),
        min: 0,
        max: 1
      }, 15000);
      const chosen = res?.choice;
      if (chosen && validCards.some((c) => c.instanceId === chosen)) {
        discardFromHand(ctx.room, target, chosen);
      } else {
        await loseInfantry(ctx, target, 1);
      }
    })
  );
  log(ctx.room, `${player.name} เล่น "สายฟ้าฟาด" ใส่ทุกคน`, `${player.name} played "Lightning Strike" against everyone.`);
  broadcastState(ctx);
}

async function effect_t7_collect_tax(ctx, player) {
  drawCards(ctx.room, player, 3);
  log(ctx.room, `${player.name} เล่น "เก็บภาษี" จั่วการ์ด 3 ใบ`, `${player.name} played "Collect Tax" and drew 3 cards.`);
  broadcastState(ctx);
}

async function effect_t8_ask_for_help(ctx, player) {
  const others = alivePlayers(ctx.room).filter((p) => p.id !== player.id && p.hand.length > 0);
  if (others.length === 0) return;
  const res = await promptOne(ctx, player.id, {
    kind: 'chooseTarget',
    messageTh: 'เลือกผู้เล่นที่จะสุ่มหยิบการ์ด 2 ใบ',
    message: 'Choose a player to randomly take 2 cards from.',
    options: others.map((p) => p.id)
  }, 15000);
  const target = ctx.room.players.get(res?.choice);
  if (!target) return;
  if (blockedByImmunity(ctx, target, player)) return;
  const n = Math.min(2, target.hand.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * target.hand.length);
    const [card] = target.hand.splice(idx, 1);
    player.hand.push(card);
  }
  log(ctx.room, `${player.name} สุ่มหยิบการ์ด ${n} ใบจาก ${target.name}`, `${player.name} randomly took ${n} card(s) from ${target.name}.`);
  broadcastState(ctx);

  if (player.hand.length > 0) {
    const giveRes = await promptOne(ctx, player.id, {
      kind: 'chooseCards',
      messageTh: `เลือกการ์ด 1 ใบมอบให้ ${target.name}`,
      message: `Choose 1 card to give to ${target.name}.`,
      options: player.hand.map((c) => c.instanceId),
      min: 1,
      max: 1
    }, 15000);
    const giveId = giveRes?.choice;
    if (giveId) {
      const idx = player.hand.findIndex((c) => c.instanceId === giveId);
      if (idx !== -1) {
        const [card] = player.hand.splice(idx, 1);
        target.hand.push(card);
        broadcastState(ctx);
      }
    }
  }
}

const EFFECTS = {
  t2_restore: effect_t2_restore,
  t3_clay_golem: effect_t3_clay_golem,
  t4_incite_rebellion: effect_t4_incite_rebellion,
  t6_lightning: effect_t6_lightning,
  t7_collect_tax: effect_t7_collect_tax,
  t8_ask_for_help: effect_t8_ask_for_help
};

/** Continuous "Taiping Clay Golem" tick, called once at the start of every turn. */
export async function tickContinuousTricks(ctx, activePlayer) {
  const { room } = ctx;
  const golems = room.continuousTricks.filter((c) => c.cardId === 't3_clay_golem');
  for (const _golem of golems) {
    if (blockedByImmunity(ctx, activePlayer, null)) continue;
    ensureDeck(room);
    const top = room.deck.pop();
    if (!top) continue;
    room.discard.push(top);
    const def = SUPPLY_BY_ID[top.cardId];
    log(room, `"ไท่ผิงหุ่นดิน": ${activePlayer.name} ทิ้งการ์ดบนสุด (${def?.name})`, `Taiping Clay Golem: ${activePlayer.name} discarded the top card (${def?.nameEn}).`);
    if (def && def.type !== 'attack' && def.type !== 'defense') {
      await loseInfantry(ctx, activePlayer, 1);
    }
  }
}

/**
 * Play a trick card as the player's own "trick" action for the turn.
 * Handles the Counter-Scheme reactive window, then resolves the effect.
 */
export async function playTrickCard(ctx, player, cardInstanceId) {
  const { room } = ctx;
  const card = player.hand.find((c) => c.instanceId === cardInstanceId);
  if (!card) return { ok: false, reason: 'no_card' };
  const def = SUPPLY_BY_ID[card.cardId];
  if (!def || def.type !== 'trick') return { ok: false, reason: 'not_a_trick' };
  if (REACTIVE_ONLY_TRICKS.has(card.cardId)) return { ok: false, reason: 'reactive_only' };

  const isContinuous = card.cardId === 't3_clay_golem';
  const removed = removeFromHand(room, player, cardInstanceId);
  if (!isContinuous) room.discard.push(removed);
  log(room, `${player.name} เล่นการ์ดอุบาย "${def.name}"`, `${player.name} plays the trick card "${def.nameEn}".`);
  broadcastState(ctx);
  await fireOnAnyCardUse(ctx, player);

  if (!isContinuous) {
    const negated = await offerCounterTrick(ctx, card.cardId);
    if (negated) return { ok: true, negated: true };
  }

  const handler = EFFECTS[card.cardId];
  if (handler) {
    await handler(ctx, player, removed.instanceId, removed.cardId);
  }
  return { ok: true };
}
