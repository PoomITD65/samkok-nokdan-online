import { GENERALS, SUPPLY, ROLE_COUNTS_BY_PLAYER_COUNT, INFANTRY } from '../data/index.js';
import { shuffle, newId, pick } from './util.js';
import { promptMany } from './prompts.js';

export const MAX_VICE_MARSHALS = 2;

export function createRoom(code, hostPlayerId) {
  return {
    code,
    hostPlayerId,
    phase: 'lobby', // lobby | playing | ended
    players: new Map(), // playerId -> player
    seatOrder: [],
    currentTurnPlayerId: null,
    deck: [],
    discard: [],
    generalPool: [],
    continuousTricks: [], // { instanceId, cardId, ownerPlayerId }
    turnActionsUsed: [],
    actedThisTurn: false,
    pendingPrompts: [],
    log: [],
    winner: null,
    createdAt: Date.now(),
    _resolvers: {}
  };
}

export function createPlayer(id, name) {
  return {
    id,
    name,
    socketId: null,
    connected: true,
    seat: 0,
    role: null,
    roleRevealed: false,
    eliminated: false,
    eliminatedInCombatBy: null,
    infantry: INFANTRY.startingCount,
    camp: [], // { instanceId, generalId }
    marshalIndex: 0,
    viceMarshalIndices: [], // up to 2 camp indices
    hand: [], // { instanceId, cardId }
    isHost: false
  };
}

export function log(room, textTh, textEn) {
  room.log.push({ id: newId('log'), ts: Date.now(), textTh, textEn });
  if (room.log.length > 300) room.log.shift();
}

export function activeGeneralId(player) {
  const entry = player.camp[player.marshalIndex];
  return entry ? entry.generalId : null;
}

export function viceGeneralIds(player) {
  return player.viceMarshalIndices.map((idx) => player.camp[idx]?.generalId).filter(Boolean);
}

/** All general IDs whose ability is currently "live" for this player: their
 * actual Marshal, plus — if that Marshal is Yo Jin (g4, whose own ∞ ability
 * IS the grant itself, continuously, no activation needed) — every one of
 * their Vice-Marshals too. Trigger/passive abilities gained this way fire
 * automatically just like the Marshal's own; only action-type ones still
 * need a deliberate button press (see abilities.js performGeneralAbilityAction),
 * because "action" inherently means "something you choose to do". */
export function effectiveGeneralIds(player) {
  const marshalId = activeGeneralId(player);
  const ids = marshalId ? [marshalId] : [];
  if (marshalId === 'g4') {
    for (const vgid of viceGeneralIds(player)) {
      if (!ids.includes(vgid)) ids.push(vgid);
    }
  }
  return ids;
}

export function hasActiveAbility(player, generalId) {
  return effectiveGeneralIds(player).includes(generalId);
}

/** Safely removes a camp slot (e.g. a demoted Vice-Marshal), fixing up
 * marshalIndex/viceMarshalIndices so they still point at the right entries. */
export function removeCampEntry(player, campIndex) {
  if (campIndex < 0 || campIndex >= player.camp.length) return null;
  const [removed] = player.camp.splice(campIndex, 1);
  const shift = (idx) => (idx > campIndex ? idx - 1 : idx);
  if (player.marshalIndex > campIndex) player.marshalIndex = shift(player.marshalIndex);
  player.viceMarshalIndices = player.viceMarshalIndices.filter((idx) => idx !== campIndex).map(shift);
  return removed;
}

function buildSupplyDeck() {
  const cards = [];
  for (const card of SUPPLY) {
    for (let i = 0; i < card.count; i++) {
      cards.push({ instanceId: newId('card'), cardId: card.id });
    }
  }
  return shuffle(cards);
}

export function ensureDeck(room) {
  if (room.deck.length === 0 && room.discard.length > 0) {
    room.deck = shuffle(room.discard);
    room.discard = [];
    log(room, 'กองเสบียงหมด ➜ นำกองใช้แล้วมาสับเป็นกองเสบียงใหม่', 'Supply deck empty — reshuffled discard pile back into the deck.');
  }
}

export function drawCards(room, player, n) {
  const drawn = [];
  for (let i = 0; i < n; i++) {
    ensureDeck(room);
    const c = room.deck.pop();
    if (c) {
      player.hand.push(c);
      drawn.push(c);
    } else {
      break;
    }
  }
  return drawn;
}

export function discardFromHand(room, player, instanceId) {
  const idx = player.hand.findIndex((c) => c.instanceId === instanceId);
  if (idx === -1) return null;
  const [card] = player.hand.splice(idx, 1);
  room.discard.push(card);
  return card;
}

/** Removes a card from hand WITHOUT sending it to the discard pile (e.g. it's
 * about to become a continuous trick in play instead). */
export function removeFromHand(room, player, instanceId) {
  const idx = player.hand.findIndex((c) => c.instanceId === instanceId);
  if (idx === -1) return null;
  return player.hand.splice(idx, 1)[0];
}

/** Setup phase: draft generals (2 candidates each, pick 1), deal roles, deal starting hand. */
export async function setupGame(ctx) {
  const { room } = ctx;
  const players = [...room.players.values()];
  const n = players.length;

  // --- General draft: 2 random candidates per player, choose 1 ---
  let pool = shuffle(GENERALS.map((g) => g.id));
  const candidatesByPlayer = {};
  for (const p of players) {
    candidatesByPlayer[p.id] = [pool.pop(), pool.pop()];
  }

  const draftSpecs = players.map((p) =>
    promptMany(ctx, [p.id], {
      kind: 'chooseGeneral',
      messageTh: 'เลือกขุนพลของท่าน 1 ใน 2 ใบ',
      message: 'Choose your starting General (1 of 2).',
      options: candidatesByPlayer[p.id]
    })
  );
  const draftResults = await Promise.all(draftSpecs);

  players.forEach((p, i) => {
    const result = draftResults[i];
    const candidates = candidatesByPlayer[p.id];
    let chosen = result && result[p.id] && candidates.includes(result[p.id].choice)
      ? result[p.id].choice
      : candidates[0]; // auto-pick first candidate if no response (disconnected / timeout)
    const unchosen = candidates.find((c) => c !== chosen);
    pool.push(unchosen);
    p.camp = [{ instanceId: newId('gen'), generalId: chosen }];
    p.marshalIndex = 0;
    p.viceMarshalIndices = [];
  });
  room.generalPool = shuffle(pool);

  // --- Roles ---
  if (n >= 3) {
    const counts = ROLE_COUNTS_BY_PLAYER_COUNT[String(n)];
    let roleDeck = [];
    for (const [roleId, count] of Object.entries(counts)) {
      if (roleId.startsWith('_')) continue;
      for (let i = 0; i < count; i++) roleDeck.push(roleId);
    }
    roleDeck = shuffle(roleDeck);
    players.forEach((p, i) => {
      p.role = roleDeck[i];
      p.roleRevealed = p.role === 'royal';
    });
  } else {
    // 2-player mode: no hidden roles, per rulebook. Win purely by last-standing.
    players.forEach((p) => {
      p.role = null;
      p.roleRevealed = false;
    });
  }

  // --- Deck + starting hands ---
  room.deck = buildSupplyDeck();
  for (const p of players) {
    drawCards(room, p, 3);
  }

  players.forEach((p, i) => {
    p.seat = i;
  });
  room.seatOrder = players.map((p) => p.id);

  const royal = players.find((p) => p.role === 'royal');
  room.currentTurnPlayerId = royal ? royal.id : room.seatOrder[0];
  room.turnActionsUsed = [];
  room.actedThisTurn = false;
  room.phase = 'playing';
  log(room, 'เกมเริ่มแล้ว! ทุกคนเปิดเผยขุนพลของตน', 'The game has begun! All players reveal their chosen General.');
}

export function nextAlivePlayerId(room, fromPlayerId) {
  const order = room.seatOrder;
  const startIdx = order.indexOf(fromPlayerId);
  for (let step = 1; step <= order.length; step++) {
    const idx = (startIdx + step) % order.length;
    const p = room.players.get(order[idx]);
    if (p && !p.eliminated) return p.id;
  }
  return null;
}

export function alivePlayers(room) {
  return [...room.players.values()].filter((p) => !p.eliminated);
}

/** Build the state snapshot visible to a specific viewer (hides other players' hands and unrevealed roles). */
export function buildPlayerView(room, viewerId) {
  const players = [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    connected: p.connected,
    seat: p.seat,
    isHost: p.isHost,
    infantry: p.infantry,
    eliminated: p.eliminated,
    camp: p.camp,
    marshalIndex: p.marshalIndex,
    viceMarshalIndices: p.viceMarshalIndices,
    handCount: p.hand.length,
    hand: p.id === viewerId ? p.hand : undefined,
    hasRole: !!p.role,
    role: p.id === viewerId || p.roleRevealed || p.eliminated ? p.role : null,
    roleRevealed: p.roleRevealed || p.eliminated || p.id === viewerId
  }));

  return {
    code: room.code,
    phase: room.phase,
    players,
    seatOrder: room.seatOrder,
    currentTurnPlayerId: room.currentTurnPlayerId,
    turnActionsUsed: room.turnActionsUsed,
    deckCount: room.deck.length,
    discardCount: room.discard.length,
    discard: room.discard.map((c) => ({ instanceId: c.instanceId, cardId: c.cardId })),
    generalPoolCount: room.generalPool.length,
    continuousTricks: room.continuousTricks,
    myPrompts: room.pendingPrompts.filter((p) => p.eligiblePlayerIds.includes(viewerId)),
    // Reactive card windows (Ambush/Incite Army/Counter-Scheme) are marked
    // `private` because their eligiblePlayerIds list IS the set of players
    // holding that specific card — showing it to non-holders would leak
    // hidden hand information in a bluffing game. Those are omitted here
    // entirely rather than shown as a generic "someone is deciding" banner.
    waitingOn: room.pendingPrompts
      .filter((p) => !p.eligiblePlayerIds.includes(viewerId) && !p.private)
      .map((p) => ({
        id: p.id,
        messageTh: p.messageTh,
        message: p.message,
        eligiblePlayerIds: p.eligiblePlayerIds
      })),
    log: room.log.slice(-60),
    winner: room.winner,
    hostPlayerId: room.hostPlayerId
  };
}

export function broadcastState(ctx) {
  const { room, io } = ctx;
  for (const p of room.players.values()) {
    if (p.socketId) {
      io.to(p.socketId).emit('state', buildPlayerView(room, p.id));
    }
  }
}
