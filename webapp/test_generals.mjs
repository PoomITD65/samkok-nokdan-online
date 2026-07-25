// Unit-test harness for all 25 general abilities — calls the engine's exported
// functions directly (no sockets, no real server), auto-answering prompts via
// a mock io. Run with: node test_generals.mjs
import assert from 'node:assert/strict';
import {
  createRoom,
  createPlayer,
  drawCards,
  effectiveGeneralIds,
  hasActiveAbility
} from './server/src/engine/state.js';
import { respondToPrompt } from './server/src/engine/prompts.js';
import {
  continuousChecks,
  fireOnAttacked,
  fireOnAttackSuccess,
  fireOnInfantryLostFromAttack,
  fireOnAnyInfantryLoss,
  fireOnAnyCardUse,
  fireOnTurnStart,
  fireOnTurnEndNoAction,
  performGeneralAbilityAction,
  isActionAbilityAvailable
} from './server/src/engine/abilities.js';
import { performAttack, offerRevival } from './server/src/engine/combat.js';
import { newId } from './server/src/engine/util.js';

let seq = 0;
function id(prefix) {
  return `${prefix}_${++seq}`;
}

function makeRoom() {
  const room = createRoom('TEST', 'host');
  room.generalPool = [];
  return room;
}

function addPlayer(room, generalId, opts = {}) {
  const p = createPlayer(id('p'), opts.name || generalId);
  p.socketId = p.id;
  p.camp = [{ instanceId: id('gen'), generalId }];
  p.marshalIndex = 0;
  p.viceMarshalIndices = [];
  for (const vgid of opts.vice || []) {
    p.camp.push({ instanceId: id('gen'), generalId: vgid });
    p.viceMarshalIndices.push(p.camp.length - 1);
  }
  p.infantry = opts.infantry ?? 5;
  p.hand = (opts.hand || []).map((cardId) => ({ instanceId: id('card'), cardId }));
  room.players.set(p.id, p);
  room.seatOrder.push(p.id);
  return p;
}

function pushDeckCards(room, cardIds) {
  // pop() is "draw" (takes from the end), so push in order = first pushed
  // ends up drawn LAST. To make cardIds[0] the next card drawn, push reversed.
  for (const cardId of [...cardIds].reverse()) {
    room.deck.push({ instanceId: id('card'), cardId });
  }
}

/** answerFn: (promptRecord) => payload | null (return null to not answer this one) */
function makeCtx(room, answerFn) {
  const io = {
    to(targetId) {
      return {
        emit(event, payload) {
          if (event !== 'prompt:show') return;
          queueMicrotask(() => {
            const answer = answerFn(payload) ?? { skip: true };
            respondToPrompt(room, targetId, payload.id, answer);
          });
        }
      };
    }
  };
  return { room, io };
}

// --- tiny test runner -------------------------------------------------
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
  }
}

// =======================================================================
await test('g1 Cao Cao — reclaims a trick card from discard on attack success', async () => {
  const room = makeRoom();
  const attacker = addPlayer(room, 'g1');
  const defender = addPlayer(room, 'g99_none');
  room.discard.push({ instanceId: id('card'), cardId: 't7_collect_tax' });
  const trickInstanceId = room.discard[0].instanceId;
  const ctx = makeCtx(room, (p) => (p.kind === 'chooseCards' ? { choice: trickInstanceId } : null));
  await fireOnAttackSuccess(ctx, attacker, defender);
  assert.equal(attacker.hand.some((c) => c.instanceId === trickInstanceId), true, 'trick card should be in attacker hand');
  assert.equal(room.discard.length, 0, 'discard pile should be empty now');
});

await test('g2 Sun Jian — continuous: any card can fuel an attack', async () => {
  const room = makeRoom();
  const withG2 = addPlayer(room, 'g2');
  const without = addPlayer(room, 'g99_none');
  const ctx = makeCtx(room, () => null);
  assert.equal(continuousChecks.anyCardAsAttackFuel(ctx, withG2), true);
  assert.equal(continuousChecks.anyCardAsAttackFuel(ctx, without), false);
});

await test('g3 Zhang Liang — steals a random card from defender on attack success', async () => {
  const room = makeRoom();
  const attacker = addPlayer(room, 'g3');
  const defender = addPlayer(room, 'g99_none', { hand: ['s_attack'] });
  const stolenId = defender.hand[0].instanceId;
  const ctx = makeCtx(room, () => null);
  await fireOnAttackSuccess(ctx, attacker, defender);
  assert.equal(defender.hand.length, 0, 'defender hand should be emptied');
  assert.equal(attacker.hand.some((c) => c.instanceId === stolenId), true, 'attacker should have the stolen card');
});

await test('g4 Yo Jin — effectiveGeneralIds grants Vice-Marshal abilities passively', async () => {
  const room = makeRoom();
  const p = addPlayer(room, 'g4', { vice: ['g5', 'g6'] });
  const ids = effectiveGeneralIds(p);
  assert.deepEqual(new Set(ids), new Set(['g4', 'g5', 'g6']));
  assert.equal(hasActiveAbility(p, 'g5'), true);
  assert.equal(hasActiveAbility(p, 'g6'), true);
  assert.equal(isActionAbilityAvailable(p), false, 'button should be disabled — neither VM is action-type');

  const p2 = addPlayer(room, 'g4', { vice: ['g7'] }); // Liu Bei is action-type
  assert.equal(isActionAbilityAvailable(p2), true, 'button should be enabled — g7 is action-type');
});

await test('g5 Lady Wu — continuous: immune to others\' tricks, not her own', async () => {
  const room = makeRoom();
  const ladyWu = addPlayer(room, 'g5');
  const other = addPlayer(room, 'g99_none');
  const ctx = makeCtx(room, () => null);
  assert.equal(continuousChecks.trickBlockedForTarget(ctx, ladyWu, other), true);
  assert.equal(continuousChecks.trickBlockedForTarget(ctx, ladyWu, ladyWu), false, 'using her own trick on herself should not be blocked');
});

await test('g6 Ma Wan-yi — punishes a card-user by discarding an Attack card', async () => {
  const room = makeRoom();
  const watcher = addPlayer(room, 'g6', { hand: ['s_attack'] });
  const actor = addPlayer(room, 'g99_none', { infantry: 5 });
  const ctx = makeCtx(room, (p) => (p.kind === 'yesNo' ? { yes: true } : null));
  await fireOnAnyCardUse(ctx, actor);
  assert.equal(watcher.hand.length, 0, 'watcher should have discarded their attack card');
  assert.equal(actor.infantry, 4, 'actor should have lost 1 infantry');
});

await test('g7 Liu Bei — recruits ANY general directly from the whole pool (no random-5)', async () => {
  const room = makeRoom();
  const player = addPlayer(room, 'g7', { hand: ['s_attack', 's_defense', 't7_collect_tax'] });
  room.generalPool = ['g10', 'g11'];
  const ctx = makeCtx(room, (p) => {
    if (p.kind === 'chooseCards') return { choices: player.hand.map((c) => c.instanceId) };
    if (p.kind === 'chooseGeneral') return { choice: 'g10' };
    return null;
  });
  const result = await performGeneralAbilityAction(ctx, player);
  assert.equal(result.ok, true);
  assert.equal(player.hand.length, 0, 'the 3 discarded cards should be gone');
  assert.equal(player.camp.some((c) => c.generalId === 'g10'), true, 'g10 should have joined the camp');
  assert.equal(room.generalPool.includes('g10'), false, 'g10 should be removed from the pool');
  assert.equal(room.generalPool.includes('g11'), true, 'g11 (not chosen) should remain in the pool');
});

await test('g8 Diao Chan — redirects an attack to another player', async () => {
  const room = makeRoom();
  const attacker = addPlayer(room, 'g99_none');
  const defender = addPlayer(room, 'g8', { hand: ['s_attack'] });
  const bystander = addPlayer(room, 'g99_none2');
  const ctx = makeCtx(room, (p) => {
    if (p.kind === 'yesNo') return { yes: true };
    if (p.kind === 'chooseTarget') return { choice: bystander.id };
    return null;
  });
  const result = await fireOnAttacked(ctx, attacker, defender);
  assert.equal(result.newTarget?.id, bystander.id);
  assert.equal(defender.hand.length, 0, 'defender should have discarded the attack card to redirect');
});

await test('g9 Lü Bu — deals 2 infantry loss instead of 1 on a successful attack (full performAttack)', async () => {
  const room = makeRoom();
  const attacker = addPlayer(room, 'g9', { hand: ['s_attack'] });
  const defender = addPlayer(room, 'g99_none', { infantry: 5, hand: [] }); // no defense card -> auto-fail defense
  const ctx = makeCtx(room, () => null);
  const cardInstanceId = attacker.hand[0].instanceId;
  const result = await performAttack(ctx, attacker, defender, 'card', cardInstanceId);
  assert.equal(result.success, true);
  assert.equal(defender.infantry, 3, 'should lose 2 infantry, not 1');
});

await test('g10 Luo Zhi — allows a trick card to be used as defense', async () => {
  const room = makeRoom();
  const attacker = addPlayer(room, 'g99_none');
  const defender = addPlayer(room, 'g10');
  const ctx = makeCtx(room, () => null);
  const result = await fireOnAttacked(ctx, attacker, defender);
  assert.equal(result.allowTrickAsDefense, true);
});

await test('g11 Dong Zhuo — continuous: free attack vs. camps of 2 or fewer generals', async () => {
  const room = makeRoom();
  const dongZhuo = addPlayer(room, 'g11');
  const smallCamp = addPlayer(room, 'g99_none'); // camp size 1
  const bigCamp = addPlayer(room, 'g99_none2', { vice: ['g10', 'g12'] }); // camp size 3
  const ctx = makeCtx(room, () => null);
  assert.equal(continuousChecks.freeAttackAllowed(ctx, dongZhuo, smallCamp), true);
  assert.equal(continuousChecks.freeAttackAllowed(ctx, dongZhuo, bigCamp), false);
});

await test('g12 Gongsun Zan — action ability = spend 1 infantry, draw 2 (same as base infantry ability)', async () => {
  const room = makeRoom();
  const player = addPlayer(room, 'g12', { infantry: 5 });
  pushDeckCards(room, ['s_attack', 's_defense']);
  const ctx = makeCtx(room, () => null);
  const result = await performGeneralAbilityAction(ctx, player);
  assert.equal(result.ok, true);
  assert.equal(player.infantry, 4);
  assert.equal(player.hand.length, 2);
});

await test('g13 Guan Yu — reveals hand, extra loss + discard if an Attack card is found', async () => {
  const room = makeRoom();
  const attacker = addPlayer(room, 'g13');
  const defender = addPlayer(room, 'g99_none', { infantry: 5, hand: ['s_attack', 't7_collect_tax'] });
  const ctx = makeCtx(room, () => null);
  await fireOnAttackSuccess(ctx, attacker, defender);
  assert.equal(defender.hand.some((c) => c.cardId === 's_attack'), false, 'the attack card should be discarded');
  assert.equal(defender.hand.length, 1, 'the other card should remain');
  assert.equal(defender.infantry, 4, 'should have lost 1 extra infantry (Guan Yu bonus, isolated from base attack damage)');
});

await test('g14 Zhang Fei — draws 2 cards on attack success', async () => {
  const room = makeRoom();
  const attacker = addPlayer(room, 'g14');
  const defender = addPlayer(room, 'g99_none');
  pushDeckCards(room, ['s_attack', 's_defense']);
  const ctx = makeCtx(room, () => null);
  await fireOnAttackSuccess(ctx, attacker, defender);
  assert.equal(attacker.hand.length, 2);
});

await test('g15 Xiahou Dun — retaliates for 2 infantry when attacked and losing infantry', async () => {
  const room = makeRoom();
  const attacker = addPlayer(room, 'g99_none', { infantry: 5 });
  const defender = addPlayer(room, 'g15', { hand: ['s_attack', 's_defense'] });
  const ctx = makeCtx(room, (p) => (p.kind === 'yesNo' ? { yes: true } : null));
  await fireOnInfantryLostFromAttack(ctx, defender, attacker);
  assert.equal(defender.hand.length, 0, 'should discard 1 attack + 1 defense');
  assert.equal(attacker.infantry, 3, 'attacker should lose 2 infantry in retaliation');
});

await test('g16 Xun You — replaces the normal draw with look-2-take-1', async () => {
  const room = makeRoom();
  const player = addPlayer(room, 'g16');
  pushDeckCards(room, ['s_attack', 's_defense']);
  const firstCardId = room.deck[room.deck.length - 1].instanceId; // top of deck (next draw)
  const ctx = makeCtx(room, (p) => (p.kind === 'chooseCards' ? { choice: firstCardId } : null));
  const handled = await fireOnTurnStart(ctx, player);
  assert.equal(handled, true);
  assert.equal(player.hand.length, 1);
  assert.equal(player.hand[0].instanceId, firstCardId);
});

await test('g17 Tuo Yiu — demands a card; refusal costs 1 infantry', async () => {
  const room = makeRoom();
  const actor = addPlayer(room, 'g17');
  const targetGives = addPlayer(room, 'g99_none', { hand: ['s_attack'] });
  const giveCardId = targetGives.hand[0].instanceId;
  const ctx1 = makeCtx(room, (p) => {
    if (p.kind === 'chooseTarget') return { choice: targetGives.id };
    if (p.kind === 'chooseCards') return { choice: giveCardId };
    return null;
  });
  const r1 = await performGeneralAbilityAction(ctx1, actor);
  assert.equal(r1.ok, true);
  assert.equal(actor.hand.some((c) => c.instanceId === giveCardId), true, 'demanded card should transfer');
  assert.equal(targetGives.hand.length, 0);

  const targetRefuses = addPlayer(room, 'g99_none2', { hand: ['s_defense'], infantry: 5 });
  const ctx2 = makeCtx(room, (p) => {
    if (p.kind === 'chooseTarget') return { choice: targetRefuses.id };
    if (p.kind === 'chooseCards') return { choice: null, choices: [] }; // refuse to give
    if (p.kind === 'chooseOption') return { choice: 'infantry' };
    return null;
  });
  const r2 = await performGeneralAbilityAction(ctx2, actor);
  assert.equal(r2.ok, true);
  assert.equal(targetRefuses.infantry, 4, 'refusing should cost 1 infantry (chosen punishment)');
  assert.equal(targetRefuses.hand.length, 1, 'their card should NOT have been taken since they refused');
});

await test('g18 Zhang Rang — continuous: immune to infantry-fueled attacks', async () => {
  const room = makeRoom();
  const zhangRang = addPlayer(room, 'g18');
  const ctx = makeCtx(room, () => null);
  assert.equal(continuousChecks.infantryAttackBlocked(ctx, zhangRang), true);
});

await test('g19 Xun Yu — draws 2 if the turn ends with no action taken', async () => {
  const room = makeRoom();
  const player = addPlayer(room, 'g19');
  pushDeckCards(room, ['s_attack', 's_defense']);
  room.turnActionsUsed = [];
  const ctx = makeCtx(room, () => null);
  await fireOnTurnEndNoAction(ctx, player);
  assert.equal(player.hand.length, 2, 'should draw 2 when no action was taken');

  const player2 = addPlayer(room, 'g19');
  pushDeckCards(room, ['s_attack', 's_defense']);
  room.turnActionsUsed = ['attack'];
  await fireOnTurnEndNoAction(ctx, player2);
  assert.equal(player2.hand.length, 0, 'should NOT draw if an action was taken this turn');
});

await test('g20 Khao Qiao — reorders the top 3 cards correctly (rank 1 = drawn first)', async () => {
  const room = makeRoom();
  const player = addPlayer(room, 'g20');
  pushDeckCards(room, ['s_attack', 's_defense', 't7_collect_tax']); // will be drawn in this order if untouched
  const ctx1 = makeCtx(room, (p) => {
    if (p.kind !== 'reorderCards') return null;
    // Reverse the order: put the 3rd-drawn card first (rank 1).
    const reversedOrder = [...p.options].reverse();
    return { order: reversedOrder };
  });
  const r = await performGeneralAbilityAction(ctx1, player);
  assert.equal(r.ok, true);
  const drawn = drawCards(room, player, 1)[0];
  assert.equal(drawn.cardId, 't7_collect_tax', 'the card we put at rank 1 should be drawn first');
});

await test('g21 Sage of Nanhua — alternate revival cost (discard 2 cards instead of infantry)', async () => {
  const room = makeRoom();
  const rescuer = addPlayer(room, 'g21', { hand: ['s_attack', 's_defense', 't7_collect_tax'] });
  const dying = addPlayer(room, 'g99_none', { infantry: 0 });
  const ctx = makeCtx(room, (p) => (p.kind === 'revivalOffer' ? { method: 'nanhua' } : null));
  const revived = await offerRevival(ctx, dying);
  assert.equal(revived, true);
  assert.equal(dying.infantry, 1);
  assert.equal(rescuer.hand.length, 1, 'should have discarded 2 cards instead of spending infantry');
});

await test('g22 Huangfu Song — extra loss + draw, ONLY when fueled by infantry', async () => {
  const room = makeRoom();
  const attacker = addPlayer(room, 'g22');
  const defender = addPlayer(room, 'g99_none', { infantry: 5 });
  pushDeckCards(room, ['s_attack']);
  const ctx = makeCtx(room, () => null);
  await fireOnAttackSuccess(ctx, attacker, defender, { fuel: 'infantry' });
  assert.equal(defender.infantry, 4, 'should lose 1 extra infantry when infantry-fueled');
  assert.equal(attacker.hand.length, 1, 'should draw 1 card');

  const defender2 = addPlayer(room, 'g99_none2', { infantry: 5 });
  await fireOnAttackSuccess(ctx, attacker, defender2, { fuel: 'card' });
  assert.equal(defender2.infantry, 5, 'should NOT trigger when fueled by a card');
});

await test('g23 Zhao Yun — attacks again immediately on success (once per turn)', async () => {
  const room = makeRoom();
  const attacker = addPlayer(room, 'g23', { infantry: 5 });
  const original = addPlayer(room, 'g99_none');
  const secondTarget = addPlayer(room, 'g99_none2', { infantry: 5, hand: [] });
  const ctx = makeCtx(room, (p) => {
    if (p.kind === 'yesNo') return { yes: true };
    if (p.kind === 'chooseAttack') return { targetId: secondTarget.id, fuel: 'infantry' };
    return null;
  });
  await fireOnAttackSuccess(ctx, attacker, original);
  assert.equal(room._zhaoYunUsedBy, attacker.id, 'once-per-turn flag should be set');
  assert.equal(secondTarget.infantry, 4, 'the bonus attack should have landed on the second target');
});

await test('g24 Zhang Jiao — mandatory trick return, then chooses among multiple Taiping matches', async () => {
  const room = makeRoom();
  const player = addPlayer(room, 'g24', { hand: ['t7_collect_tax'] });
  room.deck = [
    { instanceId: id('card'), cardId: 't2_restore' },
    { instanceId: id('card'), cardId: 't3_clay_golem' }
  ];
  const wantedId = room.deck[1].instanceId; // deliberately pick the 2nd match, not just "first found"
  const ctx = makeCtx(room, (p) => {
    if (p.context?.source === 'inline') return { choice: wantedId };
    if (p.kind === 'chooseCards') return { choice: player.hand[0].instanceId };
    return null;
  });
  const result = await performGeneralAbilityAction(ctx, player);
  assert.equal(result.ok, true);
  assert.equal(player.hand.some((c) => c.instanceId === wantedId), true, 'should have taken the specifically-chosen Taiping card');
  assert.equal(player.hand.some((c) => c.cardId === 't7_collect_tax'), false, 'the returned trick card should be gone from hand');

  const emptyHandPlayer = addPlayer(room, 'g24', { hand: [] });
  const ctx2 = makeCtx(room, () => null);
  const result2 = await performGeneralAbilityAction(ctx2, emptyHandPlayer);
  assert.equal(result2.ok, false, 'should fail cleanly with no trick card to pay the cost');
  assert.equal(result2.reason, 'no_trick_to_return');
});

await test('g25 Sun Quan — draws on attack success AND on any infantry loss (not just combat)', async () => {
  const room = makeRoom();
  const attacker = addPlayer(room, 'g25');
  const defender = addPlayer(room, 'g99_none');
  pushDeckCards(room, ['s_attack']);
  const ctx = makeCtx(room, () => null);
  await fireOnAttackSuccess(ctx, attacker, defender);
  assert.equal(attacker.hand.length, 1, 'should draw on attack success');

  const player2 = addPlayer(room, 'g25');
  pushDeckCards(room, ['s_defense']);
  await fireOnAnyInfantryLoss(ctx, player2); // simulates a NON-combat loss (Clay Golem, self-spend, etc.)
  assert.equal(player2.hand.length, 1, 'should draw on ANY infantry loss, not just combat');
});

// =======================================================================
console.log('\n=== RESULTS ===');
let passed = 0;
for (const r of results) {
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.ok ? '' : `\n     ${r.error}`}`);
  if (r.ok) passed++;
}
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
