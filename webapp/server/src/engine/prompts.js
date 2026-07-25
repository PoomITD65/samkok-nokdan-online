import { newId } from './util.js';
// Circular import (state.js -> prompts.js for promptMany) — safe because
// broadcastState is only called from inside function bodies below, well after
// both modules have finished loading.
import { broadcastState } from './state.js';

// A prompt is a request for input from one or more players. Multiple prompts can
// be outstanding at once (e.g. "Lightning Strike" asks every other player to
// discard simultaneously), so they live in room.pendingPrompts (array), each
// resolved independently via its own promptId.
//
// kind: 'yesNo' | 'chooseTarget' | 'chooseCards' | 'chooseOption' | 'chooseGeneral' | ...
// eligiblePlayerIds: players allowed to respond
// firstResponseWins: if true (broadcast-style prompts like revival offers), the
//   first eligible player to respond wins and others are ignored.

export function promptOne(ctx, playerId, spec, timeoutMs = 45000) {
  return promptMany(ctx, [playerId], { ...spec, firstResponseWins: false }, timeoutMs).then(
    (result) => (result ? result[playerId] : null)
  );
}

export function promptMany(ctx, eligiblePlayerIds, spec, timeoutMs = 60000) {
  const { room, io } = ctx;
  eligiblePlayerIds = eligiblePlayerIds.filter((id) => {
    const p = room.players.get(id);
    return p && !p.eliminated;
  });
  if (eligiblePlayerIds.length === 0) return Promise.resolve(null);

  const promptId = newId('prompt');
  return new Promise((resolve) => {
    const responses = {};
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      delete room._resolvers[promptId];
      room.pendingPrompts = room.pendingPrompts.filter((p) => p.id !== promptId);
      io.to(room.code).emit('prompt:clear', { promptId });
      broadcastState(ctx);
      resolve(result);
    };

    const timer = setTimeout(() => finish(spec.firstResponseWins ? null : responses), timeoutMs);

    room._resolvers[promptId] = {
      eligiblePlayerIds,
      firstResponseWins: !!spec.firstResponseWins,
      onRespond(playerId, payload) {
        if (!eligiblePlayerIds.includes(playerId)) return;
        if (spec.firstResponseWins) {
          if (payload && payload.skip) {
            responses[playerId] = null;
            const allSkipped = eligiblePlayerIds.every((id) => id in responses);
            if (allSkipped) finish(null);
            return;
          }
          finish({ playerId, payload });
          return;
        }
        responses[playerId] = payload;
        const allAnswered = eligiblePlayerIds.every((id) => id in responses);
        if (allAnswered) finish(responses);
      }
    };

    const promptRecord = {
      id: promptId,
      kind: spec.kind,
      message: spec.message,
      messageTh: spec.messageTh,
      eligiblePlayerIds,
      firstResponseWins: !!spec.firstResponseWins,
      options: spec.options || null,
      min: spec.min ?? null,
      max: spec.max ?? null,
      context: spec.context || null
    };
    room.pendingPrompts.push(promptRecord);

    for (const pid of eligiblePlayerIds) {
      const p = room.players.get(pid);
      if (p?.socketId) {
        io.to(p.socketId).emit('prompt:show', promptRecord);
      }
    }
    io.to(room.code).emit('prompt:broadcast', {
      id: promptId,
      kind: spec.kind,
      message: spec.message,
      messageTh: spec.messageTh,
      eligiblePlayerIds
    });
    broadcastState(ctx);
  });
}

export function respondToPrompt(room, playerId, promptId, payload) {
  const resolver = room._resolvers[promptId];
  if (!resolver) return false;
  resolver.onRespond(playerId, payload);
  return true;
}
