import { alivePlayers, log } from './state.js';

function roleFactionDefeated(room, roleId) {
  return ![...room.players.values()].some((p) => p.role === roleId && !p.eliminated);
}

function findRoyal(room) {
  return [...room.players.values()].find((p) => p.role === 'royal');
}

/**
 * Call after any elimination. Returns true if the game ended.
 */
export function checkWinConditions(room) {
  if (room.winner) return true;
  const hasRoles = [...room.players.values()].some((p) => p.role);

  if (hasRoles) {
    const rebelDefeated = roleFactionDefeated(room, 'rebel');
    const invaderDefeated = roleFactionDefeated(room, 'invader');
    const marshalDefeated = roleFactionDefeated(room, 'marshal');
    const viceDefeated = roleFactionDefeated(room, 'vicemarshal');
    const royal = findRoyal(room);
    const royalAlive = royal && !royal.eliminated;

    // Rebel / Invader instant win: they personally eliminated the Royal Court in combat.
    if (royal && royal.eliminated && royal.eliminatedInCombatBy) {
      const killer = room.players.get(royal.eliminatedInCombatBy);
      if (killer && killer.role === 'rebel') {
        return declareWin(room, 'rebel', 'โจรกบฏชนะ! สังหารราชสำนักได้สำเร็จในการต่อสู้', 'The Rebel Bandits win — they eliminated the Royal Court in combat!');
      }
      if (killer && killer.role === 'invader') {
        return declareWin(room, 'invader', 'พวกนอกด่านชนะ! สังหารราชสำนักได้สำเร็จในการต่อสู้', 'The Outside-the-Pass Invaders win — they eliminated the Royal Court in combat!');
      }
    }

    if (rebelDefeated && invaderDefeated) {
      if (royalAlive) {
        return declareWin(room, 'royal+marshal', 'ราชสำนักและแม่ทัพชนะ! กำจัดโจรกบฏและพวกนอกด่านได้หมดแล้ว', 'The Royal Court (and Marshal) win — Rebels and Invaders have been wiped out!', ['royal', 'marshal']);
      }
    }
    if (marshalDefeated && rebelDefeated && royalAlive) {
      return declareWin(room, 'vicemarshal', 'รองแม่ทัพชนะ! กำจัดแม่ทัพและโจรกบฏได้หมดแล้ว โดยราชสำนักยังอยู่', 'The Vice-Marshal wins — Marshal and Rebels eliminated, Royal Court survives!');
    }
    if (marshalDefeated && viceDefeated && rebelDefeated) {
      return declareWin(room, 'invader', 'พวกนอกด่านชนะ! กำจัดแม่ทัพ รองแม่ทัพ และโจรกบฏได้หมดแล้ว', 'The Outside-the-Pass Invaders win — Marshal, Vice-Marshal and Rebels all eliminated!');
    }
  }

  const alive = alivePlayers(room);
  if (alive.length === 1) {
    return declareWin(room, 'lastStanding', `${alive[0].name} ชนะ! เป็นผู้เล่นคนสุดท้ายที่เหลือทหารราบ`, `${alive[0].name} wins as the last player standing!`, null, [alive[0].id]);
  }
  if (alive.length === 0) {
    return declareWin(room, 'draw', 'ไม่มีผู้เล่นเหลืออยู่ เกมจบแบบเสมอ', 'No players remain — the game ends in a draw.', null, []);
  }
  return false;
}

function declareWin(room, faction, textTh, textEn, winningRoles = null, explicitPlayerIds = null) {
  const winningPlayerIds =
    explicitPlayerIds ||
    [...room.players.values()]
      .filter((p) => (winningRoles ? winningRoles.includes(p.role) : p.role === faction))
      .map((p) => p.id);
  room.winner = { faction, textTh, textEn, playerIds: winningPlayerIds };
  room.phase = 'ended';
  log(room, textTh, textEn);
  return true;
}
