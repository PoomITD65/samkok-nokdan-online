import { customAlphabet, nanoid } from 'nanoid';
import { createRoom, createPlayer, buildPlayerView, broadcastState, log, alivePlayers, setupGame } from './engine/state.js';
import { startTurn, performAction, endTurn, ACTION_TYPES } from './engine/actions.js';
import { respondToPrompt } from './engine/prompts.js';

const roomCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 4);

export function createRoomManager(io) {
  const rooms = new Map(); // code -> room

  function newRoomCode() {
    let code;
    do {
      code = roomCode();
    } while (rooms.has(code));
    return code;
  }

  function ctxFor(room) {
    return { room, io };
  }

  function getRoomOrFail(code) {
    const room = rooms.get(String(code || '').toUpperCase());
    return room || null;
  }

  io.on('connection', (socket) => {
    socket.on('room:create', ({ name }, cb) => {
      const code = newRoomCode();
      const playerId = nanoid(10);
      const room = createRoom(code, playerId);
      const player = createPlayer(playerId, (name || 'Host').slice(0, 20));
      player.isHost = true;
      player.socketId = socket.id;
      room.players.set(playerId, player);
      room.seatOrder = [playerId];
      rooms.set(code, room);

      socket.data.roomCode = code;
      socket.data.playerId = playerId;
      socket.join(code);
      log(room, `${player.name} สร้างห้อง ${code}`, `${player.name} created room ${code}.`);
      cb?.({ ok: true, roomCode: code, playerId, state: buildPlayerView(room, playerId) });
    });

    socket.on('room:join', ({ roomCode: code, name }, cb) => {
      const room = getRoomOrFail(code);
      if (!room) return cb?.({ ok: false, reason: 'room_not_found' });
      if (room.phase !== 'lobby') return cb?.({ ok: false, reason: 'already_started' });
      if (room.players.size >= 10) return cb?.({ ok: false, reason: 'room_full' });

      const playerId = nanoid(10);
      const player = createPlayer(playerId, (name || `ผู้เล่น ${room.players.size + 1}`).slice(0, 20));
      player.socketId = socket.id;
      room.players.set(playerId, player);
      room.seatOrder.push(playerId);

      socket.data.roomCode = room.code;
      socket.data.playerId = playerId;
      socket.join(room.code);
      log(room, `${player.name} เข้าห้อง`, `${player.name} joined the room.`);
      broadcastState(ctxFor(room));
      cb?.({ ok: true, roomCode: room.code, playerId, state: buildPlayerView(room, playerId) });
    });

    socket.on('room:rejoin', ({ roomCode: code, playerId }, cb) => {
      const room = getRoomOrFail(code);
      if (!room) return cb?.({ ok: false, reason: 'room_not_found' });
      const player = room.players.get(playerId);
      if (!player) return cb?.({ ok: false, reason: 'player_not_found' });

      player.socketId = socket.id;
      player.connected = true;
      socket.data.roomCode = room.code;
      socket.data.playerId = playerId;
      socket.join(room.code);
      log(room, `${player.name} กลับเข้าเกม`, `${player.name} reconnected.`);
      broadcastState(ctxFor(room));
      cb?.({ ok: true, roomCode: room.code, playerId, state: buildPlayerView(room, playerId) });
    });

    socket.on('room:start', async (_payload, cb) => {
      const { room, player } = currentRoomAndPlayer(socket, rooms);
      if (!room || !player) return cb?.({ ok: false, reason: 'not_in_room' });
      if (room.hostPlayerId !== player.id) return cb?.({ ok: false, reason: 'not_host' });
      if (room.phase !== 'lobby') return cb?.({ ok: false, reason: 'already_started' });
      if (room.players.size < 2) return cb?.({ ok: false, reason: 'need_at_least_2' });
      if (room.players.size > 10) return cb?.({ ok: false, reason: 'too_many' });

      const ctx = ctxFor(room);
      try {
        await setupGame(ctx);
        await startTurn(ctx);
        broadcastState(ctx);
        cb?.({ ok: true });
      } catch (e) {
        cb?.({ ok: false, reason: 'setup_error', message: e.message });
      }
    });

    socket.on('game:action', async ({ actionType, payload }, cb) => {
      const { room, player } = currentRoomAndPlayer(socket, rooms);
      if (!room || !player) return cb?.({ ok: false, reason: 'not_in_room' });
      if (!ACTION_TYPES.includes(actionType)) return cb?.({ ok: false, reason: 'unknown_action' });
      const result = await performAction(ctxFor(room), player.id, actionType, payload || {});
      cb?.(result);
    });

    socket.on('game:endTurn', async (_payload, cb) => {
      const { room, player } = currentRoomAndPlayer(socket, rooms);
      if (!room || !player) return cb?.({ ok: false, reason: 'not_in_room' });
      const result = await endTurn(ctxFor(room), player.id);
      cb?.(result);
    });

    socket.on('prompt:respond', ({ promptId, payload }, cb) => {
      const { room, player } = currentRoomAndPlayer(socket, rooms);
      if (!room || !player) return cb?.({ ok: false, reason: 'not_in_room' });
      const ok = respondToPrompt(room, player.id, promptId, payload || {});
      cb?.({ ok });
    });

    socket.on('room:state', (_payload, cb) => {
      const { room, player } = currentRoomAndPlayer(socket, rooms);
      if (!room || !player) return cb?.({ ok: false, reason: 'not_in_room' });
      cb?.({ ok: true, state: buildPlayerView(room, player.id) });
    });

    socket.on('disconnect', () => {
      const { room, player } = currentRoomAndPlayer(socket, rooms);
      if (!room || !player) return;
      player.connected = false;
      player.socketId = null;
      log(room, `${player.name} หลุดการเชื่อมต่อ`, `${player.name} disconnected.`);
      broadcastState(ctxFor(room));
    });
  });

  function currentRoomAndPlayer(socket, roomsMap) {
    const code = socket.data.roomCode;
    const playerId = socket.data.playerId;
    if (!code || !playerId) return { room: null, player: null };
    const room = roomsMap.get(code);
    if (!room) return { room: null, player: null };
    const player = room.players.get(playerId);
    return { room, player: player || null };
  }

  return { rooms };
}
