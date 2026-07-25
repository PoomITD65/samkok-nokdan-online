import { io } from 'socket.io-client';

const SERVER = 'http://localhost:3001';
const NUM_BOTS = 4; // change to test more players
const MAX_MS = 90000;

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class Bot {
  constructor(name) {
    this.name = name;
    this.socket = io(SERVER, { transports: ['websocket'] });
    this.state = null;
    this.playerId = null;
    this.roomCode = null;
    this.errors = [];
    this.socket.on('connect_error', (e) => this.errors.push(`connect_error: ${e.message}`));
    this.socket.on('state', (s) => {
      this.state = s;
    });
    this.socket.on('prompt:show', (p) => this.handlePrompt(p));
  }

  emitAsync(event, payload) {
    return new Promise((resolve) => this.socket.emit(event, payload, resolve));
  }

  async handlePrompt(p) {
    await sleep(50 + Math.random() * 150);
    let payload = {};
    switch (p.kind) {
      case 'yesNo':
        payload = { yes: Math.random() < 0.5 };
        break;
      case 'chooseGeneral':
        payload = { choice: rand(p.options) };
        break;
      case 'chooseTarget':
        payload = { choice: rand(p.options) };
        break;
      case 'chooseCards': {
        const min = p.min ?? 0;
        const max = p.max ?? 1;
        const n = Math.min(p.options.length, Math.max(min, Math.random() < 0.5 ? min : max));
        const shuffled = [...p.options].sort(() => Math.random() - 0.5);
        const chosen = shuffled.slice(0, n);
        payload = { choice: chosen[0] || null, choices: chosen };
        break;
      }
      case 'chooseOption':
        payload = { choice: rand(p.options) };
        break;
      case 'chooseAttack': {
        const others = p.options;
        const targetId = rand(others);
        const ctx = p.context || {};
        if (ctx.hasAttackCards && ctx.hasAttackCards.length > 0) {
          payload = { targetId, fuel: 'card', cardInstanceId: rand(ctx.hasAttackCards) };
        } else if (ctx.infantry >= 1) {
          payload = { targetId, fuel: 'infantry' };
        } else {
          payload = { targetId: null };
        }
        break;
      }
      case 'reorderCards':
        payload = { order: p.options };
        break;
      case 'revivalOffer': {
        const mine = (p.context?.options || []).filter((o) => o.playerId === this.playerId);
        if (mine.length > 0 && Math.random() < 0.5) payload = { method: mine[0].method };
        else payload = { skip: true };
        break;
      }
      case 'playCounterTrick':
      case 'playAmbush':
      case 'playInciteArmy':
        payload = Math.random() < 0.3 ? {} : { skip: true };
        break;
      default:
        payload = { skip: true };
    }
    const res = await this.emitAsync('prompt:respond', { promptId: p.id, payload });
    if (!res?.ok) this.errors.push(`prompt respond failed: ${p.kind} ${JSON.stringify(res)}`);
  }

  async create() {
    const res = await this.emitAsync('room:create', { name: this.name });
    if (!res?.ok) throw new Error('create failed: ' + JSON.stringify(res));
    this.playerId = res.playerId;
    this.roomCode = res.roomCode;
    this.state = res.state;
    return res;
  }

  async join(roomCode) {
    const res = await this.emitAsync('room:join', { roomCode, name: this.name });
    if (!res?.ok) throw new Error('join failed: ' + JSON.stringify(res));
    this.playerId = res.playerId;
    this.roomCode = res.roomCode;
    this.state = res.state;
    return res;
  }

  async maybeAct() {
    if (!this.state || this.state.phase !== 'playing') return;
    if (this.state.currentTurnPlayerId !== this.playerId) return;
    if (this.state.winner) return;
    const me = this.state.players.find((p) => p.id === this.playerId);
    if (!me || me.eliminated) return;
    const used = this.state.turnActionsUsed || [];
    if (used.length >= 2) return this.endTurn();

    const others = this.state.players.filter((p) => p.id !== this.playerId && !p.eliminated);
    const attackCard = (me.hand || []).find((c) => c.cardId === 's_attack');
    const roll = Math.random();

    if (!used.includes('attack') && others.length > 0 && (attackCard || me.infantry >= 1) && roll < 0.4) {
      const target = rand(others);
      const fuel = attackCard ? 'card' : 'infantry';
      const res = await this.emitAsync('game:action', {
        actionType: 'attack',
        payload: { targetId: target.id, fuel, cardInstanceId: attackCard?.instanceId }
      });
      if (!res?.ok) this.errors.push(`attack failed: ${JSON.stringify(res)}`);
    } else if (!used.includes('infantry_draw') && me.infantry >= 1 && roll < 0.55) {
      const res = await this.emitAsync('game:action', { actionType: 'infantry_draw', payload: {} });
      if (!res?.ok) this.errors.push(`infantry_draw failed: ${JSON.stringify(res)}`);
    } else if (!used.includes('recruit') && me.hand.length >= 3 && roll < 0.7) {
      const res = await this.emitAsync('game:action', { actionType: 'recruit', payload: {} });
      if (!res?.ok) this.errors.push(`recruit failed: ${JSON.stringify(res)}`);
    }
    await sleep(150);
    await this.endTurn();
  }

  async endTurn() {
    const res = await this.emitAsync('game:endTurn', {});
    if (!res?.ok && res?.reason !== 'not_your_turn') this.errors.push(`endTurn failed: ${JSON.stringify(res)}`);
  }
}

async function main() {
  const bots = Array.from({ length: NUM_BOTS }, (_, i) => new Bot(`Bot${i + 1}`));
  await new Promise((r) => bots[0].socket.on('connect', r));
  await Promise.all(bots.slice(1).map((b) => new Promise((r) => b.socket.on('connect', r))));

  await bots[0].create();
  console.log('Room created:', bots[0].roomCode);
  for (const b of bots.slice(1)) {
    await b.join(bots[0].roomCode);
  }
  console.log('All bots joined.');

  const startRes = await bots[0].emitAsync('room:start', {});
  console.log('Start result:', startRes);
  if (!startRes.ok) {
    console.error('FAILED to start game');
    process.exit(1);
  }

  const startTime = Date.now();
  let winnerReported = false;
  while (Date.now() - startTime < MAX_MS) {
    await Promise.all(bots.map((b) => b.maybeAct()));
    const anyWinner = bots.find((b) => b.state?.winner);
    if (anyWinner) {
      console.log('\n=== WINNER ===', JSON.stringify(anyWinner.state.winner, null, 2));
      winnerReported = true;
      break;
    }
    await sleep(200);
  }

  const allErrors = bots.flatMap((b) => b.errors.map((e) => `[${b.name}] ${e}`));
  console.log('\n=== FINAL STATE SUMMARY ===');
  const finalState = bots[0].state;
  if (finalState) {
    for (const p of finalState.players) {
      console.log(`${p.name}: infantry=${p.infantry} eliminated=${p.eliminated} role=${p.role} hand=${p.handCount}`);
    }
    console.log('Log tail:');
    for (const l of finalState.log.slice(-15)) console.log(' -', l.textEn || l.textTh);
  }
  console.log('\n=== ERRORS COLLECTED:', allErrors.length, '===');
  for (const e of allErrors.slice(0, 30)) console.log(e);

  console.log('\nWinner reported within time limit:', winnerReported);
  process.exit(allErrors.length > 0 && !winnerReported ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
