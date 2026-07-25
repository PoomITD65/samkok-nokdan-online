import { activeGeneralId, nextAlivePlayerId, drawCards, log, broadcastState } from './state.js';
import { promptOne } from './prompts.js';
import { performAttack } from './combat.js';
import {
  performRecruit,
  performInfantryDraw,
  performGeneralAbilityAction,
  fireOnTurnStart,
  fireOnTurnEndNoAction,
  isActionAbilityAvailable
} from './abilities.js';
import { playTrickCard, tickContinuousTricks } from './supplyEffects.js';
import { GENERALS_BY_ID } from '../data/index.js';

export const ACTION_TYPES = ['attack', 'trick', 'recruit', 'general_ability', 'swap', 'infantry_draw'];

const NON_CONSUMING_ATTACK_ERRORS = new Set([
  'invalid',
  'no_infantry',
  'no_card',
  'invalid_card',
  'free_attack_not_allowed',
  'blocked_infantry_attack'
]);

export async function startTurn(ctx) {
  const { room } = ctx;
  if (room.winner) return;
  const player = room.players.get(room.currentTurnPlayerId);
  if (!player) return;

  room.turnActionsUsed = [];
  room._zhaoYunUsedBy = null;
  log(room, `ถึงตาของ ${player.name}`, `It's ${player.name}'s turn.`);
  broadcastState(ctx);

  await tickContinuousTricks(ctx, player);
  if (room.winner) return;
  if (player.eliminated) {
    return advanceTurn(ctx, { skipEndHook: true });
  }

  const handledDraw = await fireOnTurnStart(ctx, player);
  if (room.winner) return;
  if (!handledDraw) {
    const drawn = drawCards(room, player, 1);
    if (drawn.length > 0) {
      log(room, `${player.name} จั่วการ์ด 1 ใบ (เหลือในมือ ${player.hand.length} ใบ)`, `${player.name} drew a card (${player.hand.length} in hand).`);
    }
  }
  broadcastState(ctx);
}

export async function advanceTurn(ctx, { skipEndHook = false } = {}) {
  const { room } = ctx;
  if (room.winner) return;
  const current = room.players.get(room.currentTurnPlayerId);
  if (current && !skipEndHook) {
    await fireOnTurnEndNoAction(ctx, current);
    if (room.winner) return;
  }
  const next = nextAlivePlayerId(room, room.currentTurnPlayerId);
  if (!next) return;
  room.currentTurnPlayerId = next;
  await startTurn(ctx);
}

export async function performAction(ctx, playerId, actionType, payload = {}) {
  const { room } = ctx;
  if (room.winner || room.phase !== 'playing') return { ok: false, reason: 'game_not_active' };
  if (playerId !== room.currentTurnPlayerId) return { ok: false, reason: 'not_your_turn' };
  const player = room.players.get(playerId);
  if (!player || player.eliminated) return { ok: false, reason: 'invalid_player' };
  if (!ACTION_TYPES.includes(actionType)) return { ok: false, reason: 'unknown_action' };
  if (room.turnActionsUsed.includes(actionType)) return { ok: false, reason: 'action_already_used' };
  if (room.turnActionsUsed.length >= 2) return { ok: false, reason: 'no_actions_left' };
  if (room._busy) return { ok: false, reason: 'busy' };

  room._busy = true;
  try {
    let result;
    switch (actionType) {
      case 'attack':
        result = await doAttack(ctx, player, payload);
        break;
      case 'trick':
        result = await playTrickCard(ctx, player, payload.cardInstanceId);
        break;
      case 'recruit':
        result = await performRecruit(ctx, player);
        break;
      case 'general_ability':
        if (!isActionAbilityAvailable(player)) {
          result = { ok: false, reason: 'no_action_ability' };
        } else {
          result = await performGeneralAbilityAction(ctx, player);
        }
        break;
      case 'swap':
        result = await doSwap(ctx, player);
        break;
      case 'infantry_draw':
        result = await performInfantryDraw(ctx, player);
        break;
      default:
        result = { ok: false, reason: 'unknown_action' };
    }

    if (result.ok && !room.winner) {
      room.turnActionsUsed.push(actionType);
    }
    broadcastState(ctx);
    return result;
  } finally {
    room._busy = false;
  }
}

async function doAttack(ctx, player, payload) {
  const { room } = ctx;
  const target = room.players.get(payload.targetId);
  if (!target) return { ok: false, reason: 'invalid_target' };
  const result = await performAttack(ctx, player, target, payload.fuel, payload.cardInstanceId || null);
  if (result.error && NON_CONSUMING_ATTACK_ERRORS.has(result.error)) {
    return { ok: false, reason: result.error };
  }
  return { ok: true, ...result };
}

async function doSwap(ctx, player) {
  const { room } = ctx;
  if (player.viceMarshalIndices.length === 0) {
    return { ok: false, reason: 'no_vice_marshal' };
  }
  let chosenViceIdx = player.viceMarshalIndices[0];
  if (player.viceMarshalIndices.length > 1) {
    const res = await promptOne(ctx, player.id, {
      kind: 'chooseGeneral',
      messageTh: 'เลือกรองแม่ทัพที่จะสลับขึ้นเป็นแม่ทัพ',
      message: 'Choose which Vice-Marshal to swap into the Marshal position.',
      options: player.viceMarshalIndices.map((idx) => player.camp[idx].generalId),
      cancellable: true
    }, 20000);
    if (res?.cancel) return { ok: false, reason: 'cancelled' };
    const pickedGeneralId = res?.choice;
    const match = player.viceMarshalIndices.find((idx) => player.camp[idx].generalId === pickedGeneralId);
    if (match !== undefined) chosenViceIdx = match;
  }

  const oldMarshalIdx = player.marshalIndex;
  player.marshalIndex = chosenViceIdx;
  player.viceMarshalIndices = player.viceMarshalIndices.map((idx) => (idx === chosenViceIdx ? oldMarshalIdx : idx));
  const gen = GENERALS_BY_ID[activeGeneralId(player)];
  log(room, `${player.name} สลับตำแหน่งแม่ทัพ-รองแม่ทัพ (แม่ทัพใหม่: ${gen?.name})`, `${player.name} swapped Marshal/Vice-Marshal (new Marshal: ${gen?.nameEn || gen?.name}).`);
  return { ok: true };
}

export async function endTurn(ctx, playerId) {
  const { room } = ctx;
  if (room.winner || room.phase !== 'playing') return { ok: false, reason: 'game_not_active' };
  if (playerId !== room.currentTurnPlayerId) return { ok: false, reason: 'not_your_turn' };
  if (room._busy) return { ok: false, reason: 'busy' };
  room._busy = true;
  try {
    await advanceTurn(ctx);
    broadcastState(ctx);
    return { ok: true };
  } finally {
    room._busy = false;
  }
}
